import type { Item, ItemKind, StepGroup } from "./types";

// Parses a day's transcribed notation into ordered items.
//
// Segments are separated by , . ; or newlines. Parenthesized notes are pulled
// out first (so commas inside them are safe) and reattached to the number or
// fork-alternative they follow. Within a segment, a "step expression" is a
// number — optionally a fork joined by "/" — that must sit on whitespace
// boundaries so digits inside words ("3:15pm", "~30") aren't mistaken for
// stairs. Everything else becomes a marker.
//
//   6 / -4        -> up / down
//   -3-1          -> 3 down, 1 avoidable (second minus = avoidable count)
//   ± -4-3        -> 4 down (ambiguous), 3 avoidable;  also +-, pm, plusminus
//   10/2          -> fork: 10 up | 2 up (take one path)
//   2 (high)/0 (low but steep) -> fork with a note on each path
//   2-2 pm 1-1    -> a 2-2 group with a 1-1 ambiguous sub-stair folded in
//   (is a branch) -> inline note attached to the previous item
//   anything else -> a marker (suspension bridge, TRAIL START, railroad…)

const SENT = String.fromCharCode(0xe000); // private-use sentinel around notes
const SEGMENT_DELIMITERS = /[,.;\n]+/;
const AMBIGUITY_PREFIX = /^(?:±|\+-|plusminus|pm)/i;
const GROUP_RE = /^([+-]?\d+)(?:-(\d+))?$/;

const AMB_SRC = "(?:±|\\+-|plusminus|pm)";
const NUM_SRC = "[+-]?\\d+(?:-\\d+)?";
const NOTE_SRC = "(?:\\s*\\uE000N\\d+\\uE000)?";
const ALT_SRC = `(?:${AMB_SRC}\\s*)?${NUM_SRC}${NOTE_SRC}`;
const EXPR_RE = new RegExp(`(?<=^|\\s)${ALT_SRC}(?:\\s*/\\s*${ALT_SRC})*(?=\\s|$)`, "gi");
const NOTE_AT_END = new RegExp("\\uE000N(\\d+)\\uE000\\s*$");
const FILLER_TOKEN = new RegExp("\\uE000N(\\d+)\\uE000|([^\\s\\uE000]+)", "g");

export interface InlineNote {
  afterItemId: string | null;
  text: string;
}

export interface ParseResult {
  items: Item[];
  inlineNotes: InlineNote[];
}

function parseGroup(text: string, ambiguous: boolean): StepGroup | null {
  const m = text.trim().match(GROUP_RE);
  if (!m) return null;
  const signed = parseInt(m[1], 10);
  if (Number.isNaN(signed)) return null;
  return {
    steps: Math.abs(signed),
    direction: signed < 0 ? "down" : "up",
    avoidable: m[2] ? parseInt(m[2], 10) : 0,
    ambiguous,
  };
}

// Canonical text for a group, used for stable ids and chip display. The ±
// marker is deliberately left out so ids stay stable regardless of ambiguity.
function groupRaw(g: StepGroup): string {
  const sign = g.direction === "down" ? "-" : "";
  const avoid = g.avoidable ? `-${g.avoidable}` : "";
  return `${sign}${g.steps}${avoid}`;
}

function parseAlt(
  altText: string,
  notes: string[],
): { group: StepGroup; note: string | null } | null {
  let t = altText.trim();
  let note: string | null = null;
  const nm = t.match(NOTE_AT_END);
  if (nm) {
    note = notes[parseInt(nm[1], 10)] ?? null;
    t = t.slice(0, nm.index).trim();
  }
  const rawStripped = t.replace(AMBIGUITY_PREFIX, "");
  const ambiguous = rawStripped !== t;
  const group = parseGroup(rawStripped.trim(), ambiguous);
  if (!group) return null;
  return { group, note };
}

// Collapse ambiguous (±) groups into the definite group they follow — but only
// within the same comma-cell ("2-2 pm 1-1"). A ± in its own cell ("…, ±1, …")
// stays a standalone group. Also resets at markers and forks.
function foldAmbiguous(items: Item[], segOf: number[], inlineNotes: InlineNote[]): Item[] {
  const out: Item[] = [];
  let lastDefinite: Item | null = null;
  let lastDefiniteSeg = -1;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const seg = segOf[i];
    if (item.kind === "group" && item.group?.ambiguous) {
      if (lastDefinite && lastDefiniteSeg === seg) {
        lastDefinite.subAmbiguous = [...(lastDefinite.subAmbiguous ?? []), item.group];
        for (const n of inlineNotes) {
          if (n.afterItemId === item.id) n.afterItemId = lastDefinite.id;
        }
        continue;
      }
      out.push(item);
      lastDefinite = null; // a standalone ± isn't a fold target for later ones
      continue;
    }
    if (item.kind === "group") {
      lastDefinite = item;
      lastDefiniteSeg = seg;
      out.push(item);
      continue;
    }
    lastDefinite = null;
    out.push(item);
  }
  return out;
}

export function parseDay(rawText: string): ParseResult {
  const items: Item[] = [];
  const segOf: number[] = []; // which comma-cell each item came from
  const inlineNotes: InlineNote[] = [];
  const occurrences = new Map<string, number>();
  let lastItemId: string | null = null;
  let currentSeg = 0;

  const makeId = (raw: string): string => {
    const n = (occurrences.get(raw) ?? 0) + 1;
    occurrences.set(raw, n);
    return `${raw}#${n}`;
  };
  const push = (item: Item) => {
    items.push(item);
    segOf.push(currentSeg);
    lastItemId = item.id;
  };

  // Phase A: protect parenthesized notes from segment splitting, then make sure
  // the branch dividers stand alone as their own tokens.
  const notes: string[] = [];
  const protectedText = rawText
    .replace(/\(([^)]*)\)/g, (_m, t) => {
      notes.push(String(t).trim());
      return `${SENT}N${notes.length - 1}${SENT}`;
    })
    .replace(/\[\[|\]\]|\|\|/g, " $& ");

  let markerWords: string[] = [];
  const flushMarker = () => {
    if (!markerWords.length) return;
    const raw = markerWords.join(" ");
    push({ id: makeId(raw), kind: "marker", raw, marker: raw });
    markerWords = [];
  };

  const dividerKind = (w: string): ItemKind | null =>
    w === "[[" ? "branch-open" : w === "]]" ? "branch-close" : w === "||" ? "lane-divider" : null;

  const processFiller = (chunk: string) => {
    FILLER_TOKEN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FILLER_TOKEN.exec(chunk)) !== null) {
      if (m[1] !== undefined) {
        flushMarker();
        const text = notes[parseInt(m[1], 10)];
        if (text) inlineNotes.push({ afterItemId: lastItemId, text });
      } else if (m[2] !== undefined) {
        const kind = dividerKind(m[2]);
        if (kind) {
          flushMarker();
          push({ id: makeId(m[2]), kind, raw: m[2] });
        } else {
          markerWords.push(m[2]);
        }
      }
    }
    flushMarker();
  };

  const emitExpr = (text: string) => {
    flushMarker();
    const alts = text.split("/").map((p) => parseAlt(p, notes));
    if (alts.some((a) => a === null)) {
      processFiller(text); // degrade to a marker; shouldn't happen
      return;
    }
    const parsed = alts as { group: StepGroup; note: string | null }[];
    if (parsed.length === 1) {
      const { group, note } = parsed[0];
      const raw = groupRaw(group);
      const id = makeId(raw);
      push({ id, kind: "group", raw, group });
      if (note) inlineNotes.push({ afterItemId: id, text: note });
      return;
    }
    const raw = parsed.map((a) => groupRaw(a.group)).join("/");
    push({
      id: makeId(raw),
      kind: "fork",
      raw,
      fork: {
        alternatives: parsed.map((a) => a.group),
        altNotes: parsed.map((a) => a.note),
        takenPath: null,
      },
    });
  };

  const segments = protectedText.split(SEGMENT_DELIMITERS);
  for (let si = 0; si < segments.length; si++) {
    const segment = segments[si];
    if (!segment.trim()) continue;
    currentSeg = si;
    EXPR_RE.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = EXPR_RE.exec(segment)) !== null) {
      processFiller(segment.slice(last, m.index));
      emitExpr(m[0]);
      last = m.index + m[0].length;
      if (m[0].length === 0) EXPR_RE.lastIndex++;
    }
    processFiller(segment.slice(last));
  }

  return { items: foldAmbiguous(items, segOf, inlineNotes), inlineNotes };
}

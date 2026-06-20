import { parseDay } from "./parse";
import type { Day, Span } from "./types";

const isDeleteSpan = (s: Span) =>
  !s.auto && (s.note ?? "").trim().toLowerCase() === "delete";

// Re-derive a day's items from its rawText, preserving manual spans and
// regenerating the auto spans that come from inline "(notes)". Items covered by
// a "DELETE" note are dropped entirely (a soft-delete you can tag on a phone
// without hunting the exact character in the raw text).
export function recomputeDay(day: Day): Day {
  const { items: parsed, inlineNotes } = parseDay(day.rawText);

  const deletedIds = new Set<string>();
  for (const s of day.spans) {
    if (!isDeleteSpan(s)) continue;
    const start = parsed.findIndex((it) => it.id === s.startItemId);
    const end = parsed.findIndex((it) => it.id === s.endItemId);
    if (start === -1 || end === -1) continue;
    for (let k = Math.min(start, end); k <= Math.max(start, end); k++) deletedIds.add(parsed[k].id);
  }

  const items = parsed.filter((it) => !deletedIds.has(it.id));
  const manualSpans = day.spans.filter((s) => !s.auto && !isDeleteSpan(s));

  const autoSpans: Span[] = [];
  inlineNotes.forEach((note, i) => {
    const anchor = note.afterItemId ?? items[0]?.id;
    if (!anchor || deletedIds.has(anchor)) return;
    autoSpans.push({
      id: `auto:${anchor}:${i}`,
      startItemId: anchor,
      endItemId: anchor,
      note: note.text,
      auto: true,
    });
  });

  return { ...day, items, spans: [...manualSpans, ...autoSpans] };
}

// Resolve a span's endpoints to item indices. Returns null if either anchor no
// longer exists (e.g. the underlying text was edited away).
export function spanRange(day: Day, span: Span): { start: number; end: number } | null {
  const startIndex = day.items.findIndex((it) => it.id === span.startItemId);
  const endIndex = day.items.findIndex((it) => it.id === span.endItemId);
  if (startIndex === -1 || endIndex === -1) return null;
  return { start: Math.min(startIndex, endIndex), end: Math.max(startIndex, endIndex) };
}

export function newId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${prefix}_${rand}`;
}

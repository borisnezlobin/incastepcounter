import type { Item, StepGroup, Trail } from "./types";

// Turns the parsed trail into an elevation profile: a stepped line where x is
// progress along the trail and y is altitude (the running sum of up/down
// steps). The line follows the minimum route — cheaper side of every fork and
// branch — and markers become landmarks placed along it.
//
// An optional `transform` maps the synthetic (step-unit) coordinates into real
// ones (km, metres) so the same geometry can render raw or calibrated.

export type LandmarkKind =
  | "start"
  | "camp"
  | "ruin"
  | "control"
  | "progress"
  | "split"
  | "waypoint";

export interface Landmark {
  x: number;
  y: number;
  label: string;
  kind: LandmarkKind;
  note?: string; // text of a note attached to this marker (often a measured altitude/%)
}

export type SegmentKind = "up" | "down" | "ambiguous" | "flat";

export interface Profile {
  paths: Record<SegmentKind, string>;
  landmarks: Landmark[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ProfileOptions {
  transform?: (x: number, y: number) => [number, number];
}

const RUN = 0.5; // horizontal advance per real stair
const RISE = 1; // altitude per real stair
const AMB_RUN = 0.4;
const AMB_RISE = 0.5; // ambiguous stairs are half height
const GROUP_GAP = 3; // walking section between staircases
const DAY_GAP = 14; // longer walk between days
const GAP_CARRY = 0.3; // how much a group's climb carries into the next walk (slopes it)

// Each drawn stair is a sloped tread plus a smaller riser, so it reads like
// real stairs on a grade rather than tall blocks. Heights vary a little (and
// occasionally spike, like the odd 12-inch step) — deterministic so it doesn't
// shimmer on re-render.
function riserFraction(i: number): number {
  const r = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
  const spike = Math.abs((Math.sin(i * 78.233) * 12345.678) % 1) < 0.06;
  return spike ? 0.62 + r * 0.16 : 0.32 + r * 0.2;
}

function classify(text: string): LandmarkKind {
  const t = text.toLowerCase();
  if (/(trail )?start|control point|begin/.test(t)) return "start";
  if (/camp/.test(t)) return "camp";
  if (
    /ruin|site|sayac|runku|runqu|phuyu|wiñay|winay|intipata|inti ?punku|sun gate|machu|temple|terrace|sayaq|chakiq|chaqu/.test(
      t,
    )
  )
    return "ruin";
  if (/km|mile|\bm\b|asl|%|viewpoint|mirador|pass|bridge|river|stream|lunch|lake/.test(t)) return "progress";
  return "waypoint";
}

const requiredOf = (g: StepGroup) => (g.ambiguous ? 0 : Math.max(0, g.steps - g.avoidable));

function laneCost(items: Item[]): number {
  let cost = 0;
  for (const it of items) {
    if (it.kind === "group" && it.group) cost += requiredOf(it.group);
    else if (it.kind === "fork" && it.fork) cost += Math.min(...it.fork.alternatives.map(requiredOf));
  }
  return cost;
}

function cheapestAlt(alts: StepGroup[]): StepGroup {
  let best = alts[0];
  for (const a of alts) if (requiredOf(a) < requiredOf(best)) best = a;
  return best;
}

function rnd(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildProfile(trail: Trail, options: ProfileOptions = {}): Profile {
  const tf = options.transform ?? ((x: number, y: number): [number, number] => [x, y]);
  const paths: Record<SegmentKind, string> = { up: "", down: "", ambiguous: "", flat: "" };
  const landmarks: Landmark[] = [];

  let x = 0;
  let y = 0;
  let stairIndex = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  // Transform a synthetic point, track real-coordinate bounds, return "X,Y".
  const emit = (px: number, py: number): string => {
    const [X, Y] = tf(px, py);
    if (X < minX) minX = X;
    if (X > maxX) maxX = X;
    if (Y < minY) minY = Y;
    if (Y > maxY) maxY = Y;
    return `${rnd(X)},${rnd(Y)}`;
  };

  const stair = (dir: 1 | -1, ambiguous: boolean) => {
    const run = ambiguous ? AMB_RUN : RUN;
    const total = (ambiguous ? AMB_RISE : RISE) * dir;
    const f = riserFraction(++stairIndex);
    const tread = total * (1 - f); // sloped tread carries most of the climb
    const kind: SegmentKind = ambiguous ? "ambiguous" : dir > 0 ? "up" : "down";
    const p0 = emit(x, y);
    const p1 = emit(x + run, y + tread);
    const p2 = emit(x + run, y + total); // the visible riser
    paths[kind] += `M${p0}L${p1}L${p2}`;
    x += run;
    y += total;
  };

  const flat = (gap: number, rise = 0) => {
    const p0 = emit(x, y);
    const p1 = emit(x + gap, y + rise);
    paths.flat += `M${p0}L${p1}`;
    x += gap;
    y += rise;
  };

  let activeNotes = new Map<string, string>();
  const landmark = (label: string, kind: LandmarkKind, note?: string) => {
    const [X, Y] = tf(x, y);
    landmarks.push({ x: rnd(X), y: rnd(Y), label, kind, note });
  };

  const drawGroup = (g: StepGroup, subs: StepGroup[] = []) => {
    const dir: 1 | -1 = g.direction === "up" ? 1 : -1;
    for (let i = 0; i < g.steps; i++) stair(dir, g.ambiguous);
    for (const s of subs) {
      const sd: 1 | -1 = s.direction === "up" ? 1 : -1;
      for (let i = 0; i < s.steps; i++) stair(sd, true);
    }
  };

  const drawItems = (items: Item[]) => {
    let i = 0;
    while (i < items.length) {
      const it = items[i];
      if (it.kind === "branch-open") {
        const lanes: Item[][] = [[]];
        i += 1;
        while (i < items.length && items[i].kind !== "branch-close") {
          if (items[i].kind === "lane-divider") lanes.push([]);
          else lanes[lanes.length - 1].push(items[i]);
          i += 1;
        }
        if (i < items.length) i += 1;
        landmark("split", "split");
        let best = lanes[0];
        for (const l of lanes) if (laneCost(l) < laneCost(best)) best = l;
        drawItems(best);
        flat(GROUP_GAP);
        continue;
      }
      if (it.kind === "marker" && it.marker) {
        landmark(it.marker, classify(it.marker), activeNotes.get(it.id));
      } else if (it.kind === "group" && it.group) {
        const y0 = y;
        drawGroup(it.group, it.subAmbiguous ?? []);
        flat(GROUP_GAP, (y - y0) * GAP_CARRY); // walk slopes with the trend
      } else if (it.kind === "fork" && it.fork) {
        const y0 = y;
        drawGroup(cheapestAlt(it.fork.alternatives));
        flat(GROUP_GAP, (y - y0) * GAP_CARRY);
      }
      i += 1;
    }
  };

  trail.days.forEach((day, idx) => {
    activeNotes = new Map<string, string>();
    for (const s of day.spans) {
      if (s.note && s.startItemId === s.endItemId) {
        const prev = activeNotes.get(s.startItemId);
        activeNotes.set(s.startItemId, prev ? `${prev} ${s.note}` : s.note);
      }
    }
    if (idx > 0) flat(DAY_GAP);
    landmark(day.name, idx === 0 ? "start" : "camp");
    drawItems(day.items);
  });

  if (!Number.isFinite(minX)) {
    minX = maxX = minY = maxY = 0;
  }
  return { paths, landmarks, minX: rnd(minX), maxX: rnd(maxX), minY: rnd(minY), maxY: rnd(maxY) };
}

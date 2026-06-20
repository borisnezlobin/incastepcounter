// Data model for the Inca Trail step recordings.
//
// A trail is a list of days. Each day's steps live as the raw text the user
// transcribed from their notebook (the source of truth) plus the parsed items
// derived from it. Annotations (notes / sections / uncertainty) are spans laid
// over the parsed items, anchored by item id so they survive most text edits.

export type Direction = "up" | "down";

// One stair group, e.g. "-21-8" => 21 down, 8 of them avoidable.
export interface StepGroup {
  steps: number; // magnitude, always positive
  direction: Direction;
  avoidable: number; // 0..steps, walk-aroundable stairs within this group
  ambiguous: boolean; // the ± / plusminus marker — stair may not really count
}

// A fork in the trail: you take exactly one of the alternatives.
// e.g. "4/3-1/2" => three paths: 4 up | 3 up (1 avoidable) | 2 up.
// Each alternative may carry an inline note, e.g. "2 (high)/0 (low but steep)".
export interface Fork {
  alternatives: StepGroup[];
  altNotes: (string | null)[]; // parallel to alternatives
  takenPath: number | null; // index of the path actually walked, if known
}

export type ItemKind =
  | "group"
  | "fork"
  | "marker"
  // A long "either/or" stretch (e.g. the Phuyupatamarca up/down split) written
  // inline as [[ laneA || laneB ]]. The dividers are their own items; the lane
  // contents are ordinary items between them.
  | "branch-open"
  | "branch-close"
  | "lane-divider";

export interface Item {
  id: string;
  kind: ItemKind;
  raw: string; // original token text, for display and re-anchoring
  group?: StepGroup; // when kind === "group"
  fork?: Fork; // when kind === "fork"
  marker?: string; // when kind === "marker" (e.g. "Control Point")
  // Ambiguous (±) groups recorded right after this definite group; they belong
  // to it as sub-stairs rather than standing on their own.
  subAmbiguous?: StepGroup[];
}

export interface Uncertainty {
  upTo: number; // numeric magnitude for error bands
  text: string; // the user's exact phrasing, e.g. "off by up to 4"
}

// A contiguous span over a day's items. Doubles as section, note, and/or
// uncertainty — a span may carry any combination (a named "carved staircase"
// section that is also "off by up to 4", for instance).
export interface Span {
  id: string;
  startItemId: string;
  endItemId: string;
  label?: string; // section / checkpoint name
  note?: string;
  uncertainty?: Uncertainty;
  isCheckpoint?: boolean;
  auto?: boolean; // regenerated from an inline "(note)" on each parse
}

export interface Day {
  id: string;
  name: string; // "Day One"
  rawText: string; // exactly what the user typed / transcribed
  items: Item[]; // derived from rawText by the parser
  spans: Span[];
  // For the Phuyupatamarca two-row case: days sharing a branchSet are parallel
  // branches of the same stretch of trail; you walked one of them.
  branchSet?: string;
  branchLabel?: string;
}

export interface Trail {
  version: number;
  updatedAt: string | null;
  days: Day[];
}

export function emptyTrail(): Trail {
  return { version: 1, updatedAt: null, days: [] };
}

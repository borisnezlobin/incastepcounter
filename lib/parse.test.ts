import { parseDay } from "./parse";
import { dayTotals } from "./totals";
import type { Day } from "./types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

// --- single groups ---------------------------------------------------------
{
  const { items } = parseDay("6, -4, -3-1, 3-1");
  check("4 group items", items.length === 4, items.length);
  check("6 => up 6", items[0].group?.direction === "up" && items[0].group?.steps === 6);
  check("-4 => down 4", items[1].group?.direction === "down" && items[1].group?.steps === 4);
  check(
    "-3-1 => down 3, avoidable 1",
    items[2].group?.direction === "down" &&
      items[2].group?.steps === 3 &&
      items[2].group?.avoidable === 1,
    items[2].group,
  );
  check(
    "3-1 => up 3, avoidable 1",
    items[3].group?.direction === "up" &&
      items[3].group?.steps === 3 &&
      items[3].group?.avoidable === 1,
  );
}

// --- ± folds only within a comma-cell --------------------------------------
{
  // "-21-8 plusminus -4-3" is one cell -> -4-3 folds in. The rest are their
  // own cells -> standalone ambiguous groups, NOT folded.
  const { items } = parseDay("-21-8 plusminus -4-3, ± 5, +-2, pm -7");
  check("commas respected: 4 items", items.length === 4, items.map((i) => i.raw));
  check(
    "-21-8 => down 21 avoidable 8, not ambiguous, one folded sub",
    items[0].group?.steps === 21 &&
      items[0].group?.ambiguous === false &&
      items[0].subAmbiguous?.length === 1 &&
      items[0].subAmbiguous?.[0].steps === 4,
    items[0],
  );
  check("± 5 standalone ambiguous up 5", items[1].group?.ambiguous === true && items[1].group?.steps === 5 && !items[1].subAmbiguous, items[1]);
  check("+-2 standalone ambiguous up 2", items[2].group?.ambiguous === true && items[2].group?.steps === 2, items[2].group);
  check("pm -7 standalone ambiguous down 7", items[3].group?.ambiguous === true && items[3].group?.direction === "down" && items[3].group?.steps === 7, items[3].group);
}

// --- multiple ± within ONE cell do fold ------------------------------------
{
  const { items } = parseDay("5-3 ±2 ±1");
  check("one cell with two subs => one item", items.length === 1, items.map((i) => i.raw));
  check("base 5-3 with 2 folded subs", items[0].subAmbiguous?.length === 2, items[0].subAmbiguous);
}

// --- comma between base and ± keeps them separate --------------------------
{
  const { items } = parseDay("2-2, ±1");
  check("comma keeps ± standalone (2 items)", items.length === 2, items.map((i) => i.raw));
  check("2-2 has no subs", !items[0].subAmbiguous, items[0].subAmbiguous);
  check("±1 is its own ambiguous group", items[1].group?.ambiguous === true && items[1].group?.steps === 1, items[1].group);
}

// --- ambiguity resets at a marker ------------------------------------------
{
  const { items } = parseDay("6, Mirador Viewpoint, ± 2");
  check("marker breaks the fold (3 items)", items.length === 3, items.map((i) => i.raw));
  check("trailing ± stays standalone", items[2].kind === "group" && items[2].group?.ambiguous === true, items[2]);
  check("standalone ± has no subs on the 6", !items[0].subAmbiguous, items[0].subAmbiguous);
}

// --- "2-2 pm 1-1" => 2-2 with a folded 1-1 sub-stair -----------------------
{
  const { items } = parseDay("2-2 pm 1-1");
  check("one item", items.length === 1, items.map((i) => i.raw));
  check("base 2-2 => up 2 avoidable 2", items[0].group?.steps === 2 && items[0].group?.avoidable === 2);
  check(
    "sub 1-1 => up 1 avoidable 1 ambiguous",
    items[0].subAmbiguous?.[0]?.steps === 1 && items[0].subAmbiguous?.[0]?.avoidable === 1,
    items[0].subAmbiguous,
  );
}

// --- forks ------------------------------------------------------------------
{
  const { items } = parseDay("10/2, 4/3-1/2");
  check("two fork items", items.length === 2 && items.every((i) => i.kind === "fork"));
  check("10/2 => 2 alts", items[0].fork?.alternatives.length === 2);
  check(
    "4/3-1/2 => 3 alts incl avoidable",
    items[1].fork?.alternatives.length === 3 &&
      items[1].fork?.alternatives[1].steps === 3 &&
      items[1].fork?.alternatives[1].avoidable === 1,
    items[1].fork?.alternatives,
  );
}

// --- fork with a note on each path -----------------------------------------
{
  const { items } = parseDay("2 (high)/0 (low but steep)");
  check("one fork item", items.length === 1 && items[0].kind === "fork", items.map((i) => i.raw));
  const f = items[0].fork;
  check("two alts: up 2 and up 0", f?.alternatives.length === 2 && f?.alternatives[0].steps === 2 && f?.alternatives[1].steps === 0, f?.alternatives);
  check("alt notes preserved", f?.altNotes[0] === "high" && f?.altNotes[1] === "low but steep", f?.altNotes);
}

// --- digits inside words are NOT steps -------------------------------------
{
  const { items } = parseDay("Arrive at Base Camp 3:15pm, ~30 uncounted ambiguous");
  check("no groups parsed from times/tildes", items.every((i) => i.kind === "marker"), items.map((i) => `${i.kind}:${i.raw}`));
}

// --- markers and inline notes ----------------------------------------------
{
  const { items, inlineNotes } = parseDay(
    "Control Point. 6, -4, (is a branch). railroad. end control point. TRAIL START",
  );
  const markers = items.filter((i) => i.kind === "marker").map((i) => i.marker);
  check(
    "markers preserved with case/spacing",
    markers.includes("Control Point") &&
      markers.includes("railroad") &&
      markers.includes("end control point") &&
      markers.includes("TRAIL START"),
    markers,
  );
  check("inline note captured", inlineNotes.length === 1 && inlineNotes[0].text === "is a branch", inlineNotes);
  check(
    "inline note anchored after -4",
    inlineNotes[0].afterItemId === items.find((i) => i.raw === "-4")?.id,
  );
}

// --- stable ids for repeated tokens ----------------------------------------
{
  const { items } = parseDay("-1, -1, -1");
  const ids = items.map((i) => i.id);
  check("repeated tokens get distinct ids", new Set(ids).size === 3, ids);
  check("ids are occurrence-numbered", ids[0] === "-1#1" && ids[2] === "-1#3", ids);
}

// --- totals: min vs total ---------------------------------------------------
{
  const { items } = parseDay("10, -4-1, ± 6, 8/2");
  const day: Day = { id: "d", name: "t", rawText: "", items, spans: [] };
  const t = dayTotals(day);
  // total = 10 + 4 + (8+2 fork) = 24; ambiguous 6 held aside
  check("total stairs = 24", t.totalStairs === 24, t.totalStairs);
  // min = 10 + (4-1) + min(8,2) = 15
  check("min stairs = 15", t.minStairs === 15, t.minStairs);
  check("ambiguous = 6", t.ambiguousStairs === 6, t.ambiguousStairs);
  check("avoidable = 1", t.avoidable === 1, t.avoidable);
}

// --- totals: a long branch block -------------------------------------------
{
  const { items } = parseDay("Split. [[ up, 5, 6 || down, -4, -10 ]] Rejoin");
  const day: Day = { id: "d", name: "t", rawText: "", items, spans: [] };
  const t = dayTotals(day);
  check("one branch", t.branchCount === 1, t.branchCount);
  check("total counts both lanes = 25", t.totalStairs === 25, t.totalStairs);
  check("min takes the cheaper lane = 11", t.minStairs === 11, t.minStairs);
  check("min route climbs 11, descends 0", t.up === 11 && t.down === 0, t);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

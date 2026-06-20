import type { Landmark } from "./profile";

// Anchors the synthetic profile to real-world coordinates:
//   x — distance in km, from "NN% done" markers against the trail's length.
//   y — altitude in metres, from the trailhead, named ruins/passes, and any
//       explicit "NNNNm" markers.
// All of these are best-guesses (the trail is famously imprecise) and are kept
// here, in the open, so they're easy to correct. Sources: see chat.

export const TOTAL_KM = 43; // Classic Inca Trail, Km82 → Machu Picchu (~43 km)
export const START_ALT_M = 2600; // Km82 / Piscacucho trailhead

interface KnownAltitude {
  test: RegExp;
  meters: number;
}

// Matched against a landmark's label, first hit wins (so order matters —
// "end intipata" must beat the generic "intipata").
const KNOWN_ALTITUDES: KnownAltitude[] = [
  { test: /dead\s*woman|warmi|^peak$/i, meters: 4215 }, // Dead Woman's Pass (high point)
  { test: /runku|runqu|runkur/i, meters: 3950 }, // Runkurakay
  { test: /phuyu/i, meters: 3601 }, // Phuyupatamarca CAMP (the actual ruin is the day-3 branch)
  { test: /saya[cqo]|sayaq/i, meters: 3600 }, // Sayacmarca
  { test: /chaki|chaqu/i, meters: 3600 }, // Chaquicocha
  { test: /end\s*intipata/i, meters: 2730 }, // bottom of the Intipata terraces (ESTIMATE)
  { test: /intipata/i, meters: 2840 }, // top of the Intipata terraces
  { test: /sun ?gate|inti ?punku|intipunku/i, meters: 2720 }, // Sun Gate
  { test: /wiñay|winay/i, meters: 2650 }, // Wiñay Wayna
  { test: /machu/i, meters: 2400 }, // Machu Picchu
];

function explicitAltitude(label: string): number | null {
  const m = label.match(/(\d{3,4})\s*m\b/i);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v >= 1500 && v <= 5000 ? v : null;
}

// A measured altitude in the label or its note wins over a name-based guess.
function altitudeFor(label: string, note: string): number | null {
  const explicit = explicitAltitude(label) ?? explicitAltitude(note);
  if (explicit != null) return explicit;
  for (const k of KNOWN_ALTITUDES) if (k.test.test(label) || k.test.test(note)) return k.meters;
  return null;
}

function distancePctFor(label: string, note: string): number | null {
  const m = `${label} ${note}`.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v >= 0 && v <= 100 ? v : null;
}

// Approximate km-from-start for late landmarks the user is unlikely to mark
// with a % (all well past the typical % markers). Best-guesses, editable.
const KNOWN_DISTANCES_KM: { test: RegExp; km: number }[] = [
  { test: /machu/i, km: 43 },
  { test: /sun ?gate|inti ?punku|intipunku/i, km: 42 },
  // Intipata's terraces span ground as you switchback down, so the top and
  // bottom sit at different distances — otherwise the descent is a vertical wall.
  { test: /end\s*intipata/i, km: 40.9 },
  { test: /intipata/i, km: 40.3 },
  { test: /wiñay|winay/i, km: 39 },
];

function knownDistanceFor(label: string): number | null {
  for (const k of KNOWN_DISTANCES_KM) if (k.test.test(label)) return k.km;
  return null;
}

export interface AnchorInfo {
  label: string;
  km?: number;
  meters?: number;
}

export interface Calibration {
  transform: (x: number, y: number) => [number, number]; // synthetic -> [km, m]
  anchors: AnchorInfo[]; // what was pinned, for transparency
}

interface DistAnchor {
  sx: number;
  km: number;
}
interface AltAnchor {
  sx: number;
  sy: number;
  m: number;
}

function dedupeSorted<T extends { sx: number }>(arr: T[]): T[] {
  const sorted = [...arr].sort((a, b) => a.sx - b.sx);
  const out: T[] = [];
  for (const a of sorted) {
    if (out.length && Math.abs(out[out.length - 1].sx - a.sx) < 1e-6) continue;
    out.push(a);
  }
  return out;
}

// Build a calibration from the raw (synthetic) landmarks. Returns null when
// there aren't enough anchors to interpolate.
export function buildCalibration(landmarks: Landmark[]): Calibration | null {
  if (!landmarks.length) return null;
  const first = landmarks[0];

  const dist: DistAnchor[] = [{ sx: first.x, km: 0 }];
  const alt: AltAnchor[] = [{ sx: first.x, sy: first.y, m: START_ALT_M }];
  const anchors: AnchorInfo[] = [{ label: `${first.label} (start)`, km: 0, meters: START_ALT_M }];

  for (const l of landmarks) {
    const note = l.note ?? "";
    const pct = distancePctFor(l.label, note);
    if (pct != null) {
      dist.push({ sx: l.x, km: (pct / 100) * TOTAL_KM });
      anchors.push({ label: l.label, km: (pct / 100) * TOTAL_KM });
    } else {
      // No %, but a few late landmarks have well-known distances. This keeps the
      // long stair-packed tail past the last % marker from extrapolating wild.
      const km = knownDistanceFor(l.label);
      if (km != null) {
        dist.push({ sx: l.x, km });
        anchors.push({ label: l.label, km });
      }
    }
    const m = altitudeFor(l.label, note);
    if (m != null) {
      alt.push({ sx: l.x, sy: l.y, m });
      anchors.push({ label: l.label, meters: m });
    }
  }

  // If the trail data runs past the last distance anchor, pin its end to the
  // full trail length so the finish doesn't extrapolate beyond 43 km.
  const lastLandmark = landmarks[landmarks.length - 1];
  const furthestKnown = dist.reduce((mx, d) => Math.max(mx, d.sx), -Infinity);
  if (lastLandmark && lastLandmark.x > furthestKnown) {
    dist.push({ sx: lastLandmark.x, km: TOTAL_KM });
    anchors.push({ label: `${lastLandmark.label} (end)`, km: TOTAL_KM });
  }

  const distA = dedupeSorted(dist);
  const altA = dedupeSorted(alt);
  if (distA.length < 2 || altA.length < 2) return null;

  const mapDistance = (sx: number): number => {
    if (sx <= distA[0].sx) {
      const a = distA[0];
      const b = distA[1];
      return a.km + ((sx - a.sx) * (b.km - a.km)) / (b.sx - a.sx);
    }
    for (let i = 0; i < distA.length - 1; i++) {
      const a = distA[i];
      const b = distA[i + 1];
      if (sx <= b.sx) return a.km + ((sx - a.sx) * (b.km - a.km)) / (b.sx - a.sx);
    }
    const a = distA[distA.length - 2];
    const b = distA[distA.length - 1];
    return a.km + ((sx - a.sx) * (b.km - a.km)) / (b.sx - a.sx);
  };

  // Altitude tracks cumulative steps (more net climb = higher). Base shape is a
  // least-squares fit  metres = A·sy + B  (bounded — can't overshoot). Then a
  // residual, interpolated along distance (monotonic), pins every anchor
  // exactly without reintroducing overshoot.
  const n = altA.length;
  let sX = 0;
  let sY = 0;
  let sXY = 0;
  let sXX = 0;
  for (const a of altA) {
    sX += a.sy;
    sY += a.m;
    sXY += a.sy * a.m;
    sXX += a.sy * a.sy;
  }
  const denom = n * sXX - sX * sX;
  const A = Math.abs(denom) > 1e-6 ? (n * sXY - sX * sY) / denom : 0;
  const B = (sY - A * sX) / n;

  const residuals = altA
    .map((a) => ({ sx: a.sx, res: a.m - (A * a.sy + B) }))
    .sort((p, q) => p.sx - q.sx);
  const residualAt = (sx: number): number => {
    if (sx <= residuals[0].sx) return residuals[0].res;
    for (let i = 0; i < residuals.length - 1; i++) {
      const a = residuals[i];
      const b = residuals[i + 1];
      if (sx <= b.sx) return a.res + ((sx - a.sx) * (b.res - a.res)) / (b.sx - a.sx || 1);
    }
    return residuals[residuals.length - 1].res;
  };

  const mapAltitude = (sx: number, sy: number): number => A * sy + B + residualAt(sx);

  return {
    transform: (x, y) => [mapDistance(x), mapAltitude(x, y)],
    anchors,
  };
}

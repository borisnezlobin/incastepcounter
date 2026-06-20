"use client";

import { useMemo, useState } from "react";
import { Mountains } from "@phosphor-icons/react";
import type { Trail } from "@/lib/types";
import { buildProfile, type Landmark, type LandmarkKind } from "@/lib/profile";
import { buildCalibration } from "@/lib/calibration";

const KIND_COLOR: Record<LandmarkKind, string> = {
  start: "#0f766e",
  camp: "#b45309",
  ruin: "#be123c",
  control: "#1c1917",
  progress: "#0369a1",
  split: "#7c3aed",
  waypoint: "#a8a29e",
};

const LABELLED: Set<LandmarkKind> = new Set(["start", "camp", "ruin", "split"]);

const CHART_H = 240;
const TOP = 30;
const BOTTOM = 22;

export function ElevationProfile({ trail }: { trail: Trail }) {
  const [daySel, setDaySel] = useState<"all" | string>("all");
  const [real, setReal] = useState(true);

  const sub = useMemo(
    () => (daySel === "all" ? trail : { ...trail, days: trail.days.filter((d) => d.id === daySel) }),
    [trail, daySel],
  );
  const raw = useMemo(() => buildProfile(sub), [sub]);
  const calibration = useMemo(() => buildCalibration(raw.landmarks), [raw]);
  const calibrated = useMemo(
    () => (calibration ? buildProfile(sub, { transform: calibration.transform }) : null),
    [sub, calibration],
  );

  const showReal = real && !!calibrated;
  const profile = showReal ? calibrated! : raw;

  const yTicks = niceTicks(profile.minY, profile.maxY, 4);
  const xTicks = niceTicks(profile.minX, profile.maxX, 6);

  const yspan = Math.max(1, profile.maxY - profile.minY);
  const PYY = CHART_H / yspan;
  const xspan = Math.max(1, profile.maxX - profile.minX);
  const PXX = showReal ? Math.max(60, 1000 / xspan) : 1.25;
  const W = Math.max(340, xspan * PXX);

  const sx = (x: number) => (x - profile.minX) * PXX;
  const sy = (y: number) => TOP + (profile.maxY - y) * PYY;

  const xUnit = showReal ? "km" : "steps";
  const yUnit = showReal ? "m" : "steps";

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Mountains weight="fill" size={18} className="text-emerald-700" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-stone-800">
            Elevation profile
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {calibrated && (
            <div className="flex rounded-lg bg-stone-100 p-0.5 text-[11px] font-medium">
              <Toggle active={real} onClick={() => setReal(true)}>
                Distance
              </Toggle>
              <Toggle active={!real} onClick={() => setReal(false)}>
                Steps
              </Toggle>
            </div>
          )}
          <div className="flex gap-1 overflow-x-auto">
            <Tab active={daySel === "all"} onClick={() => setDaySel("all")}>
              All
            </Tab>
            {trail.days.map((d) => (
              <Tab key={d.id} active={daySel === d.id} onClick={() => setDaySel(d.id)}>
                {d.name.replace(/^Day\s*/i, "D")}
              </Tab>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="overflow-x-auto">
          <svg width={W} height={TOP + CHART_H + BOTTOM} className="block">
            {/* horizontal gridlines */}
            {yTicks.map((v) => (
              <line key={v} x1={0} x2={W} y1={sy(v)} y2={sy(v)} stroke="#f1f0ee" strokeWidth={1} />
            ))}
            {/* altitude-zero / start baseline */}
            <line x1={0} x2={W} y1={sy(profile.minY)} y2={sy(profile.minY)} stroke="#e7e5e4" strokeWidth={1} />

            {/* x ticks */}
            {xTicks.map((v) => (
              <g key={v}>
                <line x1={sx(v)} x2={sx(v)} y1={TOP + CHART_H} y2={TOP + CHART_H + 4} stroke="#d6d3d1" strokeWidth={1} />
                <text x={sx(v)} y={TOP + CHART_H + 15} fontSize={9} fill="#a8a29e" textAnchor="middle">
                  {fmt(v)}
                </text>
              </g>
            ))}

            {/* the trail line */}
            <g transform={`translate(${-profile.minX * PXX} ${TOP + CHART_H + profile.minY * PYY}) scale(${PXX} ${-PYY})`}>
              <path d={profile.paths.flat} fill="none" stroke="#d6d3d1" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <path d={profile.paths.ambiguous} fill="none" stroke="#f59e0b" strokeOpacity={0.55} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
              <path d={profile.paths.down} fill="none" stroke="#ea580c" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <path d={profile.paths.up} fill="none" stroke="#059669" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>

            {profile.landmarks.map((l, i) => (
              <LandmarkPin key={i} l={l} x={sx(l.x)} y={sy(l.y)} baseline={sy(profile.minY)} flip={i % 2 === 1} />
            ))}
          </svg>
        </div>

        {/* fixed altitude axis on the left */}
        <div className="pointer-events-none absolute left-0 top-0 h-full">
          {yTicks.map((v) => (
            <span
              key={v}
              className="absolute -translate-y-1/2 bg-white/85 pl-3 pr-1.5 text-[9px] font-medium tabular-nums text-stone-400"
              style={{ top: sy(v) }}
            >
              {fmt(v)}
              {v === yTicks[yTicks.length - 1] ? ` ${yUnit}` : ""}
            </span>
          ))}
        </div>
      </div>

      <Legend
        peak={showReal ? profile.maxY : undefined}
        xUnit={xUnit}
        assumptions={showReal ? calibration!.anchors.length : 0}
      />
    </section>
  );
}

function LandmarkPin({
  l,
  x,
  y,
  baseline,
  flip,
}: {
  l: Landmark;
  x: number;
  y: number;
  baseline: number;
  flip: boolean;
}) {
  const color = KIND_COLOR[l.kind];
  const labelled = LABELLED.has(l.kind);
  const labelY = flip ? 12 : 24;
  return (
    <g>
      <line x1={x} x2={x} y1={Math.min(y, baseline)} y2={labelled ? labelY + 4 : y} stroke={color} strokeOpacity={0.25} strokeWidth={1} />
      <circle cx={x} cy={y} r={3} fill={color} stroke="white" strokeWidth={1} />
      {labelled ? (
        <text x={x} y={labelY} fontSize={9} fill={color} transform={`rotate(-32 ${x} ${labelY})`} className="font-medium">
          {l.label.length > 22 ? l.label.slice(0, 21) + "…" : l.label}
        </text>
      ) : (
        <title>{l.label}</title>
      )}
    </g>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-md px-2 py-1 ${active ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}>
      {children}
    </button>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium ${
        active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
      }`}
    >
      {children}
    </button>
  );
}

function Legend({ peak, xUnit, assumptions }: { peak?: number; xUnit: string; assumptions: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-100 px-4 py-2.5 text-[11px] text-stone-500">
      <Swatch color="#059669" label="up" />
      <Swatch color="#ea580c" label="down" />
      <Swatch color="#f59e0b" label="maybe (±)" />
      <span className="ml-auto text-stone-400">
        {peak != null
          ? `peak ${Math.round(peak)} m · ${assumptions} anchors · x in ${xUnit}`
          : `altitude = cumulative steps`}
      </span>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const rawStep = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-6; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

function fmt(v: number): string {
  return Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k" : String(Math.round(v));
}

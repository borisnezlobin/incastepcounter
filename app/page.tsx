"use client";

import { useMemo, useState } from "react";
import {
  CloudCheck,
  CircleNotch,
  Plus,
  WarningCircle,
  CaretDown,
  CaretRight,
  Mountains,
} from "@phosphor-icons/react";
import { useTrail } from "@/lib/useTrail";
import { newId } from "@/lib/day";
import type { Day, Trail } from "@/lib/types";
import { dayTotals, trailTotals } from "@/lib/totals";
import { DayEditor } from "./components/DayEditor";
import { ElevationProfile } from "./components/ElevationProfile";
import type { SaveState } from "@/lib/useTrail";

export default function Page() {
  const { trail, saveState, update } = useTrail();
  const [showHelp, setShowHelp] = useState(false);

  if (!trail) {
    return (
      <main className="flex flex-1 items-center justify-center text-stone-400">
        <CircleNotch size={22} className="animate-spin" />
      </main>
    );
  }

  const addDay = () => {
    update((prev) => {
      const day: Day = {
        id: newId("day"),
        name: `Day ${prev.days.length + 1}`,
        rawText: "",
        items: [],
        spans: [],
      };
      return { ...prev, days: [...prev.days, day] };
    });
  };

  const updateDay = (next: Day) =>
    update((prev) => ({
      ...prev,
      days: prev.days.map((d) => (d.id === next.id ? next : d)),
    }));

  const deleteDay = (id: string) =>
    update((prev) => ({ ...prev, days: prev.days.filter((d) => d.id !== id) }));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-6">
      <Header saveState={saveState} />

      {trail.days.length > 0 && <Overview trail={trail} />}

      {trail.days.some((d) => d.items.length > 0) && (
        <div className="mt-4">
          <ElevationProfile trail={trail} />
        </div>
      )}

      <HelpCard open={showHelp} onToggle={() => setShowHelp((s) => !s)} />

      <div className="mt-5 space-y-4">
        {trail.days.map((day) => (
          <DayEditor
            key={day.id}
            day={day}
            onChange={updateDay}
            onDelete={() => deleteDay(day.id)}
          />
        ))}
      </div>

      <button
        onClick={addDay}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 py-4 text-sm font-medium text-stone-500 hover:border-stone-400 hover:text-stone-700"
      >
        <Plus size={16} weight="bold" /> Add a day
      </button>

      {trail.days.length === 0 && (
        <p className="mt-6 text-center text-sm text-stone-400">
          Start by adding your first day, then transcribe its steps from your notebook.
        </p>
      )}
    </main>
  );
}

function Header({ saveState }: { saveState: SaveState }) {
  return (
    <header className="mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-stone-900 text-amber-300">
            <Mountains size={22} weight="fill" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-stone-900">
              Inca Trail Steps
            </h1>
            <p className="text-xs text-stone-500">Every stair, counted and added up.</p>
          </div>
        </div>
        <SaveBadge state={saveState} />
      </div>
    </header>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-xs text-stone-400">
        <CircleNotch size={13} className="animate-spin" /> Saving
      </span>
    );
  if (state === "error")
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-xs text-red-600">
        <WarningCircle size={13} /> Save failed
      </span>
    );
  if (state === "saved")
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600">
        <CloudCheck size={13} weight="fill" /> Saved
      </span>
    );
  return null;
}

function Overview({ trail }: { trail: Trail }) {
  const totals = useMemo(() => trailTotals(trail), [trail]);
  const perDay = useMemo(
    () => trail.days.map((d) => ({ name: d.name, t: dayTotals(d) })),
    [trail],
  );
  const maxTotal = Math.max(1, ...perDay.map((d) => d.t.totalStairs));

  return (
    <section className="rounded-2xl bg-stone-900 px-5 py-5 text-white shadow-sm">
      <div className="grid grid-cols-2 gap-4">
        <Stat
          label="Minimum to complete"
          value={totals.minStairs}
          tone="text-emerald-300"
          hint="skipping avoidable & maybe stairs, cheaper path at every split"
        />
        <Stat
          label="Total stairs on the trail"
          value={totals.totalStairs}
          tone="text-amber-300"
          hint={totals.ambiguousStairs > 0 ? `+${totals.ambiguousStairs} maybe (±)` : "every stair that exists"}
        />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-white/10 pt-4 text-xs text-white/70">
        <MiniStat label="Climb / descent (min route)" value={`↑${totals.up} ↓${totals.down}`} />
        <MiniStat label="Avoidable" value={totals.avoidable} />
        <MiniStat
          label="Forks / branches"
          value={`${totals.forkCount} / ${totals.branchCount}`}
        />
      </div>
      {totals.uncertaintyUpTo > 0 && (
        <p className="mt-2 text-[11px] text-white/50">±{totals.uncertaintyUpTo} stairs uncertain across flagged sections</p>
      )}

      {perDay.length > 1 && (
        <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
          {perDay.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="w-16 shrink-0 truncate text-white/60">{d.name}</span>
              <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                <div className="absolute inset-y-0 left-0 bg-amber-400/40" style={{ width: `${(d.t.totalStairs / maxTotal) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 bg-emerald-400/90" style={{ width: `${(d.t.minStairs / maxTotal) * 100}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right tabular-nums text-white/50">
                {d.t.minStairs}/{d.t.totalStairs}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: string;
  hint?: string;
}) {
  return (
    <div>
      <p className={`font-display text-4xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-white/80">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-tight text-white/45">{hint}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-sm font-semibold tabular-nums text-white">{value}</p>
      <p className="text-[11px] text-white/50">{label}</p>
    </div>
  );
}

function HelpCard({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="mt-4 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-stone-700"
      >
        {open ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
        How to write your steps
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-stone-100 px-4 py-3 text-xs text-stone-600">
          <Rule code="6 / -4">positive = up, negative = down</Rule>
          <Rule code="-3-1">3 down, 1 of them avoidable (walk around it)</Rule>
          <Rule code="± -4-3">ambiguous stairs (tap the ± button); here 4 down, 3 avoidable</Rule>
          <Rule code="10/2">a fork — you take one of the paths</Rule>
          <Rule code="[[ … || … ]]">a long split: each side is a branch (the up/down split). Total counts both; minimum takes the cheaper one</Rule>
          <Rule code="(is a branch)">a note attached to the step before it</Rule>
          <Rule code="Control Point">any words become a marker on the trail</Rule>
          <p className="pt-1 text-stone-400">
            Separate entries with commas, periods, or new lines. Tap parsed chips to select a
            stretch, then add a section, note, or uncertainty.
          </p>
        </div>
      )}
    </div>
  );
}

function Rule({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <p className="flex gap-2">
      <code className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-700">
        {code}
      </code>
      <span>{children}</span>
    </p>
  );
}

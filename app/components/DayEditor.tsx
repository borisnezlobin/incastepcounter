"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  CaretRight,
  MapPin,
  NotePencil,
  Path,
  Tag,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { Day, Item, Span } from "@/lib/types";
import { newId, recomputeDay, spanRange } from "@/lib/day";
import { dayTotals } from "@/lib/totals";

type FormState =
  | null
  | {
      kind: "section" | "note" | "uncertainty";
      spanId: string | null; // editing an existing span, or null for new
      start: number;
      end: number;
      label: string;
      note: string;
      uncertaintyText: string;
      uncertaintyUpTo: string;
    };

const PLACEHOLDER = `Control Point. 6, -4, -1, -14, railroad.
TRAIL START. suspension bridge.
3-1, ± -4-3, 10/2, (is a branch)`;

export function DayEditor({
  day,
  onChange,
  onDelete,
}: {
  day: Day;
  onChange: (day: Day) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [highlightSpan, setHighlightSpan] = useState<string | null>(null);
  const prevRaw = useRef(day.rawText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Editing the notation invalidates index-based selection.
  useEffect(() => {
    if (prevRaw.current !== day.rawText) {
      prevRaw.current = day.rawText;
      setAnchor(null);
      setFocus(null);
      setForm(null);
    }
  }, [day.rawText]);

  const totals = useMemo(() => dayTotals(day), [day]);

  const setRaw = (rawText: string) => onChange(recomputeDay({ ...day, rawText }));
  const setName = (name: string) => onChange({ ...day, name });

  // Insert "± " at the caret without stealing focus, so the phone keyboard
  // stays open (and on its current symbol layer).
  const insertAmbiguity = () => {
    const ta = textareaRef.current;
    const text = day.rawText;
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? start;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const insert = (before && !/\s$/.test(before) ? " " : "") + "± ";
    setRaw(before + insert + after);
    const caret = before.length + insert.length;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    });
  };

  const selection =
    anchor === null || focus === null
      ? null
      : { start: Math.min(anchor, focus), end: Math.max(anchor, focus) };

  const tapChip = (index: number) => {
    if (anchor === null) {
      setAnchor(index);
      setFocus(index);
    } else if (anchor === index && focus === index) {
      setAnchor(null);
      setFocus(null);
    } else {
      setFocus(index);
    }
  };

  const clearSelection = () => {
    setAnchor(null);
    setFocus(null);
    setForm(null);
  };

  const openForm = (kind: "section" | "note" | "uncertainty") => {
    if (!selection) return;
    setForm({
      kind,
      spanId: null,
      start: selection.start,
      end: selection.end,
      label: "",
      note: "",
      uncertaintyText: "",
      uncertaintyUpTo: "",
    });
  };

  const editSpan = (span: Span) => {
    const range = spanRange(day, span);
    if (!range) return;
    const kind = span.label !== undefined ? "section" : span.uncertainty ? "uncertainty" : "note";
    setAnchor(range.start);
    setFocus(range.end);
    setForm({
      kind,
      spanId: span.id,
      start: range.start,
      end: range.end,
      label: span.label ?? "",
      note: span.note ?? "",
      uncertaintyText: span.uncertainty?.text ?? "",
      uncertaintyUpTo: span.uncertainty ? String(span.uncertainty.upTo) : "",
    });
  };

  const saveForm = () => {
    if (!form) return;
    const startItemId = day.items[form.start]?.id;
    const endItemId = day.items[form.end]?.id;
    if (!startItemId || !endItemId) return;

    const base: Span = {
      id: form.spanId ?? newId("span"),
      startItemId,
      endItemId,
    };
    if (form.kind === "section") {
      base.label = form.label.trim() || "Section";
      base.isCheckpoint = true;
    } else if (form.kind === "note") {
      base.note = form.note.trim();
    } else {
      base.uncertainty = {
        upTo: Number(form.uncertaintyUpTo) || 0,
        text: form.uncertaintyText.trim() || `off by up to ${form.uncertaintyUpTo || "?"}`,
      };
    }

    const others = day.spans.filter((s) => s.id !== base.id);
    onChange({ ...day, spans: [...others, base] });
    clearSelection();
  };

  const deleteSpan = (id: string) => {
    onChange({ ...day, spans: day.spans.filter((s) => s.id !== id) });
  };

  const setForkPath = (index: number, takenPath: number | null) => {
    const items = day.items.map((it, i) =>
      i === index && it.fork ? { ...it, fork: { ...it.fork, takenPath } } : it,
    );
    onChange({ ...day, items });
  };

  const manualSpans = day.spans.filter((s) => !s.auto);
  const autoSpans = day.spans.filter((s) => s.auto);
  const highlightRange = useMemo(() => {
    if (!highlightSpan) return null;
    const s = day.spans.find((x) => x.id === highlightSpan);
    return s ? spanRange(day, s) : null;
  }, [highlightSpan, day]);

  const inSelection = (i: number) => selection && i >= selection.start && i <= selection.end;
  const inHighlight = (i: number) => highlightRange && i >= highlightRange.start && i <= highlightRange.end;

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70 overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-3 bg-stone-50">
        <button
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-stone-400 hover:text-stone-700"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <CaretDown size={18} weight="bold" /> : <CaretRight size={18} weight="bold" />}
        </button>
        <input
          value={day.name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-0 bg-transparent font-semibold text-stone-900 outline-none"
          placeholder="Day name"
        />
        <div className="shrink-0 flex items-center gap-2 text-xs font-medium">
          <span className="text-stone-500">min</span>
          <span className="text-stone-900 tabular-nums">{totals.minStairs}</span>
          <span className="text-stone-300">/</span>
          <span className="text-stone-500">total</span>
          <span className="text-stone-900 tabular-nums">{totals.totalStairs}</span>
        </div>
        <button
          onClick={onDelete}
          className="shrink-0 text-stone-300 hover:text-red-600"
          aria-label="Delete day"
        >
          <Trash size={16} />
        </button>
      </header>

      {open && (
        <div className="px-4 py-4 space-y-4">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={day.rawText}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              rows={Math.min(10, Math.max(3, day.rawText.split("\n").length + 1))}
              className="w-full resize-y rounded-xl bg-stone-50 ring-1 ring-stone-200 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-stone-800 outline-none focus:ring-stone-400"
            />
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                insertAmbiguity();
              }}
              className="absolute bottom-2 right-2 rounded-lg bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-800 hover:bg-amber-200"
              title="Insert an ambiguous (±) marker"
            >
              ±
            </button>
          </div>

          {day.items.length > 0 && (
            <ChipStrip
              items={day.items}
              inSelection={inSelection}
              inHighlight={inHighlight}
              onTap={tapChip}
            />
          )}

          {selection && (
            <SelectionBar
              singleFork={
                selection.start === selection.end ? day.items[selection.start] : undefined
              }
              forkIndex={selection.start}
              onSection={() => openForm("section")}
              onNote={() => openForm("note")}
              onUncertainty={() => openForm("uncertainty")}
              onSetForkPath={setForkPath}
              onClear={clearSelection}
            />
          )}

          {form && (
            <SpanForm
              form={form}
              tokens={day.items.slice(form.start, form.end + 1).map((i) => i.raw)}
              onField={(patch) => setForm({ ...form, ...patch })}
              onSave={saveForm}
              onCancel={clearSelection}
            />
          )}

          {(manualSpans.length > 0 || autoSpans.length > 0) && (
            <SpanList
              day={day}
              onEdit={editSpan}
              onDelete={deleteSpan}
              onHover={setHighlightSpan}
            />
          )}

          <p className="text-xs text-stone-500">
            {totals.groupCount} groups · {totals.forkCount} forks · {totals.branchCount} branches ·{" "}
            {totals.markerCount} markers
            {totals.ambiguousStairs > 0 && ` · +${totals.ambiguousStairs} maybe`}
            {totals.uncertaintyUpTo > 0 && ` · ±${totals.uncertaintyUpTo} uncertain`}
          </p>
        </div>
      )}
    </section>
  );
}

function ChipStrip({
  items,
  inSelection,
  inHighlight,
  onTap,
}: {
  items: Item[];
  inSelection: (i: number) => boolean | null;
  inHighlight: (i: number) => boolean | null;
  onTap: (i: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <Chip
          key={item.id}
          item={item}
          selected={!!inSelection(i)}
          highlighted={!!inHighlight(i)}
          onClick={() => onTap(i)}
        />
      ))}
    </div>
  );
}

function Chip({
  item,
  selected,
  highlighted,
  onClick,
}: {
  item: Item;
  selected: boolean;
  highlighted: boolean;
  onClick: () => void;
}) {
  const ring = selected
    ? "ring-2 ring-stone-900"
    : highlighted
      ? "ring-2 ring-sky-400"
      : "ring-1 ring-black/5";

  if (item.kind === "marker") {
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 rounded-lg bg-stone-100 px-2 py-1 text-xs font-medium text-stone-600 ${ring}`}
      >
        <MapPin size={12} weight="fill" className="text-stone-400" />
        {item.marker}
      </button>
    );
  }

  if (item.kind === "fork" && item.fork) {
    const { alternatives, takenPath } = item.fork;
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 ${ring}`}
      >
        <Path size={12} weight="bold" />
        {alternatives.map((a, idx) => (
          <span
            key={idx}
            className={
              takenPath === idx ? "underline decoration-2 underline-offset-2" : "opacity-70"
            }
          >
            {idx > 0 && <span className="opacity-40">/</span>}
            {a.direction === "down" ? "↓" : "↑"}
            {a.steps}
            {a.avoidable > 0 && <span className="opacity-60">-{a.avoidable}</span>}
            {item.fork!.altNotes?.[idx] && (
              <span className="ml-0.5 font-normal italic opacity-60">({item.fork!.altNotes[idx]})</span>
            )}
          </span>
        ))}
      </button>
    );
  }

  if (item.kind === "branch-open" || item.kind === "branch-close" || item.kind === "lane-divider") {
    const label =
      item.kind === "branch-open" ? "split ⌄" : item.kind === "branch-close" ? "⌃ rejoin" : "— or —";
    return (
      <button
        onClick={onClick}
        className={`inline-flex w-full items-center justify-center rounded-lg bg-violet-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700 ${selected ? "ring-2 ring-stone-900" : ""}`}
      >
        {label}
      </button>
    );
  }

  const g = item.group!;
  const tone = g.ambiguous
    ? "bg-amber-50 text-amber-800"
    : g.direction === "up"
      ? "bg-emerald-50 text-emerald-800"
      : "bg-orange-50 text-orange-800";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold ${tone} ${ring}`}
    >
      {g.ambiguous && <span className="font-bold">±</span>}
      {g.direction === "up" ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />}
      {g.steps}
      {g.avoidable > 0 && (
        <span className="ml-0.5 rounded bg-black/5 px-1 text-[10px] font-medium opacity-70">
          −{g.avoidable}
        </span>
      )}
      {item.subAmbiguous?.map((s, i) => (
        <span
          key={i}
          className="ml-1 rounded bg-amber-200/60 px-1 text-[10px] font-semibold text-amber-800"
          title="ambiguous sub-stairs"
        >
          ±{s.direction === "down" ? "↓" : "↑"}
          {s.steps}
          {s.avoidable > 0 && `-${s.avoidable}`}
        </span>
      ))}
    </button>
  );
}

function SelectionBar({
  singleFork,
  forkIndex,
  onSection,
  onNote,
  onUncertainty,
  onSetForkPath,
  onClear,
}: {
  singleFork?: Item;
  forkIndex: number;
  onSection: () => void;
  onNote: () => void;
  onUncertainty: () => void;
  onSetForkPath: (index: number, takenPath: number | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-xl bg-stone-900 px-3 py-2 text-white">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onSection} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium hover:bg-white/20">
          <Tag size={13} /> Section
        </button>
        <button onClick={onNote} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium hover:bg-white/20">
          <NotePencil size={13} /> Note
        </button>
        <button onClick={onUncertainty} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium hover:bg-white/20">
          <WarningCircle size={13} /> Uncertainty
        </button>
        <button onClick={onClear} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-white/60 hover:text-white">
          <X size={13} /> Clear
        </button>
      </div>
      {singleFork?.kind === "fork" && singleFork.fork && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
          <span className="text-[11px] text-white/60">Path taken:</span>
          {singleFork.fork.alternatives.map((a, idx) => (
            <button
              key={idx}
              onClick={() => onSetForkPath(forkIndex, singleFork.fork!.takenPath === idx ? null : idx)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                singleFork.fork!.takenPath === idx ? "bg-violet-400 text-stone-900" : "bg-white/10"
              }`}
            >
              {a.direction === "down" ? "↓" : "↑"}
              {a.steps}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SpanForm({
  form,
  tokens,
  onField,
  onSave,
  onCancel,
}: {
  form: NonNullable<FormState>;
  tokens: string[];
  onField: (patch: Partial<NonNullable<FormState>>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const title =
    form.kind === "section" ? "Name this section" : form.kind === "note" ? "Add a note" : "Record uncertainty";
  return (
    <div className="rounded-xl bg-sky-50 ring-1 ring-sky-200 px-3 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-900">{title}</p>
        <button onClick={onCancel} className="text-sky-400 hover:text-sky-700">
          <X size={15} />
        </button>
      </div>
      <p className="font-mono text-[11px] text-sky-700/80 truncate">over: {tokens.join(" ")}</p>
      {form.kind === "section" && (
        <input
          autoFocus
          value={form.label}
          onChange={(e) => onField({ label: e.target.value })}
          placeholder="e.g. Carved staircase"
          className="w-full rounded-lg bg-white ring-1 ring-sky-200 px-3 py-2 text-sm outline-none focus:ring-sky-400"
        />
      )}
      {form.kind === "note" && (
        <textarea
          autoFocus
          value={form.note}
          onChange={(e) => onField({ note: e.target.value })}
          placeholder="Anything worth remembering here…"
          rows={2}
          className="w-full rounded-lg bg-white ring-1 ring-sky-200 px-3 py-2 text-sm outline-none focus:ring-sky-400"
        />
      )}
      {form.kind === "uncertainty" && (
        <div className="space-y-2">
          <input
            autoFocus
            value={form.uncertaintyText}
            onChange={(e) => onField({ uncertaintyText: e.target.value })}
            placeholder='Your wording, e.g. "off by up to 4"'
            className="w-full rounded-lg bg-white ring-1 ring-sky-200 px-3 py-2 text-sm outline-none focus:ring-sky-400"
          />
          <label className="flex items-center gap-2 text-xs text-sky-800">
            ± up to
            <input
              type="number"
              inputMode="numeric"
              value={form.uncertaintyUpTo}
              onChange={(e) => onField({ uncertaintyUpTo: e.target.value })}
              className="w-20 rounded-lg bg-white ring-1 ring-sky-200 px-2 py-1.5 text-sm outline-none focus:ring-sky-400"
            />
            steps
          </label>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-100">
          Cancel
        </button>
        <button onClick={onSave} className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800">
          Save
        </button>
      </div>
    </div>
  );
}

function SpanList({
  day,
  onEdit,
  onDelete,
  onHover,
}: {
  day: Day;
  onEdit: (span: Span) => void;
  onDelete: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const spans = [...day.spans].sort((a, b) => {
    const ra = spanRange(day, a)?.start ?? 0;
    const rb = spanRange(day, b)?.start ?? 0;
    return ra - rb;
  });
  return (
    <div className="space-y-1.5">
      {spans.map((span) => {
        const range = spanRange(day, span);
        const tokens = range
          ? day.items.slice(range.start, range.end + 1).map((i) => i.raw).join(" ")
          : null;
        const Icon = span.label !== undefined ? Tag : span.uncertainty ? WarningCircle : NotePencil;
        const text =
          span.label !== undefined
            ? span.label
            : span.uncertainty
              ? span.uncertainty.text
              : span.note;
        return (
          <div
            key={span.id}
            onMouseEnter={() => onHover(span.id)}
            onMouseLeave={() => onHover(null)}
            className="flex items-center gap-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs"
          >
            <Icon size={13} className="shrink-0 text-stone-400" />
            <div className="min-w-0 flex-1">
              <span className={`font-medium ${range ? "text-stone-700" : "text-red-600 line-through"}`}>
                {text || "(empty)"}
              </span>
              {tokens && <span className="ml-2 font-mono text-[10px] text-stone-400">{tokens}</span>}
              {!range && <span className="ml-2 text-[10px] text-red-500">needs review</span>}
            </div>
            {span.auto ? (
              <span className="text-[10px] text-stone-400">inline</span>
            ) : (
              <>
                <button onClick={() => onEdit(span)} className="text-stone-400 hover:text-stone-700">
                  <NotePencil size={13} />
                </button>
                <button onClick={() => onDelete(span.id)} className="text-stone-400 hover:text-red-600">
                  <Trash size={13} />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

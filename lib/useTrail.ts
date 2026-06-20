"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyTrail, type Trail } from "./types";
import { recomputeDay } from "./day";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useTrail() {
  const [trail, setTrail] = useState<Trail | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/trail")
      .then((r) => r.json())
      .then((data: Trail) => {
        if (cancelled) return;
        // Re-derive items from each day's rawText so stored data picks up the
        // current parser (folded ± sub-stairs, fork notes, etc.).
        const normalized = data
          ? { ...data, days: data.days.map((d) => recomputeDay(d)) }
          : emptyTrail();
        setTrail(normalized);
      })
      .catch(() => {
        if (!cancelled) setTrail(emptyTrail());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: Trail) => {
    setSaveState("saving");
    try {
      const res = await fetch("/api/trail", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, []);

  // Update trail state and schedule a debounced save.
  const update = useCallback(
    (mutate: (prev: Trail) => Trail) => {
      setTrail((prev) => {
        const base = prev ?? emptyTrail();
        const next = mutate(base);
        pending.current = true;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          pending.current = false;
          void persist(next);
        }, 700);
        return next;
      });
    },
    [persist],
  );

  return { trail, saveState, update };
}

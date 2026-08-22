"use client";

import { useCallback, useEffect, useState } from "react";
import type { DateRange } from "@/components/ui/DateRangePicker";

/**
 * Période partagée par toutes les pages Pilotage (Ventes, Produits,
 * Rentabilité, Masse salariale, Mon tableau, accueils établissement).
 * Choisir une date sur une page la conserve sur les autres, jusqu'au
 * prochain changement. Mémorisée dans le navigateur.
 */
const KEY = "pilotage:range";
const EVT = "pilotage-range-change";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function readPilotageRange(): DateRange | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<DateRange>;
    if (v && typeof v.from === "string" && typeof v.to === "string" && ISO.test(v.from) && ISO.test(v.to) && v.from <= v.to) {
      return { from: v.from, to: v.to };
    }
  } catch { /* ignore */ }
  return null;
}

export function writePilotageRange(r: DateRange): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(r));
  window.dispatchEvent(new CustomEvent(EVT, { detail: r }));
}

/**
 * Période Pilotage : `initial` sert quand rien n'est mémorisé (ou pour
 * forcer une valeur, ex. paramètres d'URL → `force: true`).
 */
export function usePilotageRange(initial: () => DateRange, force = false): [DateRange, (r: DateRange) => void] {
  const [range, setRangeState] = useState<DateRange>(() => (force ? null : readPilotageRange()) ?? initial());

  // Une autre page / un autre onglet a changé la période
  useEffect(() => {
    const onChange = (e: Event) => {
      const r = (e as CustomEvent<DateRange>).detail;
      if (r) setRangeState(prev => (prev.from === r.from && prev.to === r.to ? prev : r));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const r = readPilotageRange();
      if (r) setRangeState(prev => (prev.from === r.from && prev.to === r.to ? prev : r));
    };
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(EVT, onChange); window.removeEventListener("storage", onStorage); };
  }, []);

  const setRange = useCallback((r: DateRange) => {
    setRangeState(r);
    writePilotageRange(r);
  }, []);

  return [range, setRange];
}

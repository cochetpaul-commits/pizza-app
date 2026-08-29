"use client";

import { useEffect } from "react";
import { DateRangePicker, shiftRange, type DateRange } from "@/components/ui/DateRangePicker";
import { useTopBar } from "@/components/layout/TopBarContext";

/**
 * Barre de période commune à toutes les pages Pilotage :
 * ‹ [ période ] › — même rendu que Ventes / Mon tableau.
 */
export function PilotageRangeBar({ value, onChange, accent = "#D4775A", center = true }: {
  value: DateRange; onChange: (r: DateRange) => void; accent?: string; center?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const atToday = value.to >= today;
  const btn = (disabled: boolean): React.CSSProperties => ({
    width: 28, height: 28, borderRadius: 8, border: "1px solid #e0d8ce",
    background: disabled ? "#f0ebe3" : "#fff", color: disabled ? "#ccc" : accent,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: center ? "center" : "flex-start" }}>
      <button type="button" aria-label="Période précédente" onClick={() => onChange(shiftRange(value, -1))} style={btn(false)}>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <DateRangePicker value={value} onChange={onChange} format="short" />
      <button type="button" aria-label="Période suivante" onClick={() => { if (!atToday) onChange(shiftRange(value, 1)); }} style={btn(atToday)}>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
    </div>
  );
}

/**
 * Place la barre de période dans le bandeau du haut sur mobile (même
 * emplacement que la page Ventes). La barre de page reste pour l'ordinateur
 * (à masquer sous 768 px via une classe display:none).
 */
export function usePilotageTopBar(value: DateRange, onChange: (r: DateRange) => void, accent = "#D4775A") {
  const topBar = useTopBar();
  useEffect(() => {
    topBar.set({ actions: <PilotageRangeBar value={value} onChange={onChange} accent={accent} center={false} /> });
    return () => topBar.clear();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.from, value.to, accent]);
}

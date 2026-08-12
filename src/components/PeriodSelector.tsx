"use client";

import { useMemo } from "react";

export type PeriodMode = "jour" | "semaine" | "mois" | "annee";

export type PeriodValue = {
  mode: PeriodMode;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  label: string;
  shortLabel: string;
};

// ── Helpers ──────────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonday(d: Date): Date {
  const dt = new Date(d);
  const dow = dt.getDay() || 7;
  dt.setDate(dt.getDate() - dow + 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function parisToday(): Date {
  const s = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  return new Date(s + "T12:00:00");
}

// ── Compute period bounds ────────────────────────────────

export function currentPeriod(mode: PeriodMode): PeriodValue {
  const today = parisToday();
  return periodFromDate(mode, today);
}

export function periodFromDate(mode: PeriodMode, ref: Date): PeriodValue {
  if (mode === "jour") {
    const iso = toISO(ref);
    const label = ref.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase());
    const shortLabel = ref.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return { mode, from: iso, to: iso, label, shortLabel };
  }

  if (mode === "semaine") {
    const mon = getMonday(ref);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const monDay = mon.getDate();
    const sunDay = sun.getDate();
    let label: string;
    if (mon.getMonth() === sun.getMonth()) {
      label = `Sem. ${monDay}-${sunDay} ${sun.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
    } else {
      label = `Sem. ${monDay} ${mon.toLocaleDateString("fr-FR", { month: "short" })} - ${sunDay} ${sun.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}`;
    }
    return { mode, from: toISO(mon), to: toISO(sun), label, shortLabel: `S${getISOWeek(mon)}` };
  }

  if (mode === "mois") {
    const y = ref.getFullYear(), m = ref.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const label = first.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase());
    return { mode, from: toISO(first), to: toISO(last), label, shortLabel: first.toLocaleDateString("fr-FR", { month: "short" }) };
  }

  // annee
  const y = ref.getFullYear();
  return { mode, from: `${y}-01-01`, to: `${y}-12-31`, label: `Annee ${y}`, shortLabel: String(y) };
}

export function shiftPeriod(period: PeriodValue, offset: number): PeriodValue {
  const ref = new Date(period.from + "T12:00:00");
  if (period.mode === "jour") {
    ref.setDate(ref.getDate() + offset);
  } else if (period.mode === "semaine") {
    ref.setDate(ref.getDate() + offset * 7);
  } else if (period.mode === "mois") {
    ref.setMonth(ref.getMonth() + offset);
  } else {
    ref.setFullYear(ref.getFullYear() + offset);
  }
  return periodFromDate(period.mode, ref);
}

export function isCurrent(period: PeriodValue): boolean {
  const now = currentPeriod(period.mode);
  return period.from === now.from;
}

function getISOWeek(d: Date): number {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + 4 - (dt.getDay() || 7));
  const yearStart = new Date(dt.getFullYear(), 0, 1);
  return Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ── Component ────────────────────────────────────────────

const MODES: { key: PeriodMode; label: string }[] = [
  { key: "jour", label: "Jour" },
  { key: "semaine", label: "Semaine" },
  { key: "mois", label: "Mois" },
  { key: "annee", label: "Annee" },
];

const ACCENT = "#D4775A";

export function PeriodSelector({
  period,
  onPeriodChange,
  onModeChange,
}: {
  period: PeriodValue;
  onPeriodChange: (p: PeriodValue) => void;
  onModeChange: (mode: PeriodMode) => void;
}) {
  const isNow = isCurrent(period);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
      {/* Mode tabs */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ display: "inline-flex", gap: 2, padding: 3, background: "rgba(0,0,0,0.04)", borderRadius: 10 }}>
          {MODES.map(m => (
            <button key={m.key} type="button" onClick={() => onModeChange(m.key)} style={{
              padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700,
              background: period.mode === m.key ? "#fff" : "transparent",
              color: period.mode === m.key ? "#1a1a1a" : "#999",
              cursor: "pointer",
              boxShadow: period.mode === m.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      }}>
        <button type="button" onClick={() => onPeriodChange(shiftPeriod(period, -1))} style={{
          width: 32, height: 32, borderRadius: 8, border: "1px solid #ddd6c8",
          background: "#fff", color: ACCENT, fontSize: 16, fontWeight: 700,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}>&#8592;</button>

        <div style={{ textAlign: "center", minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>
            {period.label}
          </div>
          {isNow && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 8px", borderRadius: 4, background: ACCENT, color: "#fff" }}>
              En cours
            </span>
          )}
        </div>

        <button type="button" onClick={() => onPeriodChange(shiftPeriod(period, 1))} disabled={isNow} style={{
          width: 32, height: 32, borderRadius: 8, border: "1px solid #ddd6c8",
          background: "#fff", color: isNow ? "#ddd" : ACCENT, fontSize: 16, fontWeight: 700,
          cursor: isNow ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}>&#8594;</button>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ── Types ────────────────────────────────────────── */

export type DateRange = { from: string; to: string }; // ISO yyyy-mm-dd

export type PresetKey =
  | "today"
  | "yesterday"
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "this-year"
  | "last-year"
  | "last-7-days"
  | "last-30-days"
  | "last-90-days"
  | "last-12-months";

type DateRangePickerProps = {
  value: DateRange;
  onChange: (range: DateRange, presetKey?: PresetKey | null) => void;
  /** Optional: presets to show. Defaults to all. */
  presets?: PresetKey[];
  /** Optional: label shown inside the trigger button when no preset */
  format?: "short" | "long";
};

/* ── Helpers ─────────────────────────────────────── */

const MONTH_NAMES_FR = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];
const MONTH_SHORT_FR = [
  "janv.", "fevr.", "mars", "avr.", "mai", "juin",
  "juil.", "aout", "sept.", "oct.", "nov.", "dec.",
];
const DOW_SHORT = ["L", "M", "M", "J", "V", "S", "D"];

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfWeek(d: Date): Date {
  // Monday-based (ISO)
  const x = new Date(d);
  const dow = x.getDay() || 7;
  x.setDate(x.getDate() - dow + 1);
  return x;
}

function endOfWeek(d: Date): Date {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isBetween(d: Date, from: Date, to: Date): boolean {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function computePreset(key: PresetKey): DateRange {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  switch (key) {
    case "today":
      return { from: toISO(today), to: toISO(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: toISO(y), to: toISO(y) };
    }
    case "this-week":
      return { from: toISO(startOfWeek(today)), to: toISO(endOfWeek(today)) };
    case "last-week": {
      const lw = addDays(startOfWeek(today), -7);
      return { from: toISO(lw), to: toISO(addDays(lw, 6)) };
    }
    case "this-month":
      return { from: toISO(startOfMonth(today)), to: toISO(endOfMonth(today)) };
    case "last-month": {
      const lm = addMonths(today, -1);
      return { from: toISO(startOfMonth(lm)), to: toISO(endOfMonth(lm)) };
    }
    case "this-year":
      return { from: toISO(new Date(today.getFullYear(), 0, 1)), to: toISO(new Date(today.getFullYear(), 11, 31)) };
    case "last-year":
      return { from: toISO(new Date(today.getFullYear() - 1, 0, 1)), to: toISO(new Date(today.getFullYear() - 1, 11, 31)) };
    case "last-7-days":
      return { from: toISO(addDays(today, -6)), to: toISO(today) };
    case "last-30-days":
      return { from: toISO(addDays(today, -29)), to: toISO(today) };
    case "last-90-days":
      return { from: toISO(addDays(today, -89)), to: toISO(today) };
    case "last-12-months": {
      const start = new Date(today); start.setMonth(start.getMonth() - 12); start.setDate(today.getDate());
      return { from: toISO(start), to: toISO(today) };
    }
  }
}

const PRESET_LABELS: Record<PresetKey, string> = {
  "today": "Aujourd'hui",
  "yesterday": "Hier",
  "this-week": "Cette semaine",
  "last-week": "La semaine derniere",
  "this-month": "Ce mois-ci",
  "last-month": "Le mois dernier",
  "this-year": "Cette annee",
  "last-year": "L'annee derniere",
  "last-7-days": "7 derniers jours",
  "last-30-days": "30 derniers jours",
  "last-90-days": "90 derniers jours",
  "last-12-months": "12 derniers mois",
};

const DEFAULT_PRESETS: PresetKey[] = [
  "today", "this-week", "this-month", "this-year",
  "yesterday", "last-week", "last-month", "last-year",
  "last-30-days", "last-90-days", "last-12-months",
];

function formatLabel(range: DateRange, format: "short" | "long" = "short"): string {
  if (!range.from || !range.to) return "Selectionner une periode";
  const f = fromISO(range.from);
  const t = fromISO(range.to);
  if (isSameDay(f, t)) {
    return format === "long"
      ? f.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : `${f.getDate()} ${MONTH_SHORT_FR[f.getMonth()]} ${f.getFullYear()}`;
  }
  const sameYear = f.getFullYear() === t.getFullYear();
  const sameMonth = sameYear && f.getMonth() === t.getMonth();
  if (sameMonth) {
    return `${f.getDate()} - ${t.getDate()} ${MONTH_SHORT_FR[t.getMonth()]} ${t.getFullYear()}`;
  }
  if (sameYear) {
    return `${f.getDate()} ${MONTH_SHORT_FR[f.getMonth()]} - ${t.getDate()} ${MONTH_SHORT_FR[t.getMonth()]} ${t.getFullYear()}`;
  }
  return `${f.getDate()} ${MONTH_SHORT_FR[f.getMonth()]} ${f.getFullYear()} - ${t.getDate()} ${MONTH_SHORT_FR[t.getMonth()]} ${t.getFullYear()}`;
}

function detectPreset(range: DateRange, presets: PresetKey[]): PresetKey | null {
  for (const k of presets) {
    const r = computePreset(k);
    if (r.from === range.from && r.to === range.to) return k;
  }
  return null;
}

/* ── Calendar month component ────────────────────── */

function MonthGrid({
  month,
  draftFrom,
  draftTo,
  hover,
  onPick,
  onHover,
}: {
  month: Date;
  draftFrom: Date | null;
  draftTo: Date | null;
  hover: Date | null;
  onPick: (d: Date) => void;
  onHover: (d: Date | null) => void;
}) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const firstDow = first.getDay() || 7; // 1..7 (Mon..Sun)
  const daysInMonth = last.getDate();

  // Build cells (leading blanks + days)
  const cells: (Date | null)[] = [];
  for (let i = 1; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));

  const rangeStart = draftFrom;
  const rangeEnd = draftTo ?? (draftFrom && hover && hover.getTime() >= draftFrom.getTime() ? hover : null);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        textAlign: "center",
        fontFamily: "var(--font-oswald), Oswald, sans-serif",
        fontWeight: 700, fontSize: 13,
        textTransform: "uppercase", letterSpacing: ".08em",
        marginBottom: 10, color: "#1a1a1a",
      }}>
        {MONTH_NAMES_FR[month.getMonth()]} {month.getFullYear()}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 2,
        fontSize: 11,
      }}>
        {DOW_SHORT.map((d, i) => (
          <div key={i} style={{ textAlign: "center", color: "#999", fontSize: 10, padding: "4px 0", fontWeight: 600 }}>{d}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const isStart = rangeStart && isSameDay(cell, rangeStart);
          const isEnd = rangeEnd && isSameDay(cell, rangeEnd);
          const inRange = rangeStart && rangeEnd && isBetween(cell, rangeStart, rangeEnd);
          const isEdge = isStart || isEnd;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => onHover(cell)}
              onClick={() => onPick(cell)}
              style={{
                padding: "6px 0",
                border: "none",
                borderRadius: isEdge ? 8 : inRange ? 0 : 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: isEdge ? 700 : 500,
                background: isEdge ? "#1a1a1a" : inRange ? "#1a1a1a10" : "transparent",
                color: isEdge ? "#fff" : inRange ? "#1a1a1a" : "#333",
                transition: "background .12s",
              }}
              onMouseOver={(e) => { if (!isEdge && !inRange) e.currentTarget.style.background = "#f3ede0"; }}
              onMouseOut={(e) => { if (!isEdge && !inRange) e.currentTarget.style.background = "transparent"; }}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────── */

export function DateRangePicker({ value, onChange, presets = DEFAULT_PRESETS, format = "short" }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<Date | null>(null);
  const [draftTo, setDraftTo] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const [monthLeft, setMonthLeft] = useState<Date>(() => {
    const base = value.from ? fromISO(value.from) : new Date();
    return startOfMonth(base);
  });
  const rootRef = useRef<HTMLDivElement>(null);

  const monthRight = useMemo(() => addMonths(monthLeft, 1), [monthLeft]);
  const activePreset = useMemo(() => detectPreset(value, presets), [value, presets]);
  const label = useMemo(() => {
    const p = activePreset;
    if (p) return PRESET_LABELS[p];
    return formatLabel(value, format);
  }, [value, format, activePreset]);

  // Open helper that initializes the draft from the current value
  const handleOpen = () => {
    setDraftFrom(value.from ? fromISO(value.from) : null);
    setDraftTo(value.to ? fromISO(value.to) : null);
    setHover(null);
    setMonthLeft(startOfMonth(value.from ? fromISO(value.from) : new Date()));
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handlePick = (d: Date) => {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(d);
      setDraftTo(null);
      return;
    }
    // draftFrom set, no draftTo yet
    if (d.getTime() < draftFrom.getTime()) {
      setDraftFrom(d);
      setDraftTo(null);
    } else {
      setDraftTo(d);
    }
  };

  const handleApplyPreset = (key: PresetKey) => {
    const r = computePreset(key);
    onChange(r, key);
    setOpen(false);
  };

  const handleApply = () => {
    if (draftFrom && draftTo) {
      onChange({ from: toISO(draftFrom), to: toISO(draftTo) }, null);
      setOpen(false);
    } else if (draftFrom && !draftTo) {
      onChange({ from: toISO(draftFrom), to: toISO(draftFrom) }, null);
      setOpen(false);
    }
  };

  const handleCancel = () => setOpen(false);

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => { if (open) setOpen(false); else handleOpen(); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 10,
          border: "1px solid #e0d8ce", background: "#fff",
          color: "#1a1a1a", fontSize: 13, fontWeight: 600,
          cursor: "pointer", whiteSpace: "nowrap",
          fontFamily: "var(--font-oswald), Oswald, sans-serif",
          letterSpacing: ".03em",
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {label}
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="daterange-popover"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 300,
            background: "#fff",
            border: "1px solid #e0d8ce",
            borderRadius: 14,
            boxShadow: "0 12px 40px rgba(0,0,0,.14)",
            padding: 18,
            display: "flex",
            gap: 18,
            minWidth: 680,
          }}
        >
          {/* Presets column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 150, borderRight: "1px solid #f0ebe3", paddingRight: 12 }}>
            {presets.map((k, i) => {
              const isActive = activePreset === k;
              const needsSeparatorBefore = (k === "yesterday" || k === "last-30-days") && i > 0;
              return (
                <React.Fragment key={k}>
                  {needsSeparatorBefore && <div style={{ height: 1, background: "#f0ebe3", margin: "6px 0" }} />}
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(k)}
                    style={{
                      textAlign: "left",
                      padding: "7px 10px",
                      border: "none",
                      borderRadius: 8,
                      background: isActive ? "#1a1a1a" : "transparent",
                      color: isActive ? "#fff" : "#333",
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      cursor: "pointer",
                      transition: "background .12s",
                    }}
                    onMouseOver={(e) => { if (!isActive) e.currentTarget.style.background = "#f3ede0"; }}
                    onMouseOut={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    {PRESET_LABELS[k]}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* Calendars + inputs */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Date inputs */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <input
                type="date"
                value={draftFrom ? toISO(draftFrom) : ""}
                onChange={(e) => { if (e.target.value) { const d = fromISO(e.target.value); setDraftFrom(d); setMonthLeft(startOfMonth(d)); } }}
                style={{ flex: 1, padding: "8px 12px", border: "1px solid #e0d8ce", borderRadius: 8, fontSize: 13, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}
              />
              <input
                type="date"
                value={draftTo ? toISO(draftTo) : ""}
                onChange={(e) => { if (e.target.value) setDraftTo(fromISO(e.target.value)); }}
                style={{ flex: 1, padding: "8px 12px", border: "1px solid #e0d8ce", borderRadius: 8, fontSize: 13, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}
              />
            </div>

            {/* Month nav */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => setMonthLeft(addMonths(monthLeft, -1))}
                style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #e0d8ce", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                aria-label="Mois precedent"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => setMonthLeft(addMonths(monthLeft, 1))}
                style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #e0d8ce", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                aria-label="Mois suivant"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>

            {/* Two-month grid */}
            <div style={{ display: "flex", gap: 24 }} onMouseLeave={() => setHover(null)}>
              <MonthGrid month={monthLeft} draftFrom={draftFrom} draftTo={draftTo} hover={hover} onPick={handlePick} onHover={setHover} />
              <MonthGrid month={monthRight} draftFrom={draftFrom} draftTo={draftTo} hover={hover} onPick={handlePick} onHover={setHover} />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14, paddingTop: 12, borderTop: "1px solid #f0ebe3" }}>
              <button
                type="button"
                onClick={handleCancel}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e0d8ce", background: "#fff", color: "#1a1a1a", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!draftFrom}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 12, fontWeight: 700, cursor: draftFrom ? "pointer" : "not-allowed", opacity: draftFrom ? 1 : 0.5 }}
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile: full width popover with grid presets */}
      <style>{`
        @media (max-width: 720px) {
          .daterange-popover {
            position: fixed !important;
            left: 12px !important;
            right: 12px !important;
            top: auto !important;
            bottom: 12px !important;
            min-width: 0 !important;
            flex-direction: column !important;
            max-height: 85dvh;
            overflow-y: auto;
            padding: 14px !important;
            gap: 12px !important;
          }
          .daterange-popover > div:first-child {
            border-right: none !important;
            border-bottom: 1px solid #f0ebe3;
            padding-right: 0 !important;
            padding-bottom: 12px;
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 6px !important;
            min-width: 0 !important;
          }
          .daterange-popover > div:first-child > button {
            text-align: center !important;
            padding: 9px 8px !important;
            font-size: 12px !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .daterange-popover > div:first-child > div {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

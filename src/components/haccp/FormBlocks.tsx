"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { T } from "@/lib/tokens";

// Briques de formulaire HACCP — CSS inline, alignées sur le design system
// pizza-app (T tokens, Oswald pour les titres, DM Sans pour le body).

// ── Layout de page ──────────────────────────────────────────────────────────

export function HaccpPageShell({
  title,
  back = "/haccp",
  right,
  children
}: {
  title: string;
  back?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: T.creme,
        padding: "24px 16px 110px",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif"
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 20
          }}
        >
          <Link
            href={back}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: T.muted,
              textDecoration: "none"
            }}
          >
            ← {back === "/haccp" ? "HACCP" : "Retour"}
          </Link>
          <h1
            style={{
              flex: 1,
              margin: 0,
              fontFamily: "var(--font-oswald), Oswald, sans-serif",
              fontSize: 22,
              color: T.dark,
              textAlign: "center"
            }}
          >
            {title}
          </h1>
          <div>{right}</div>
        </header>
        {children}
      </div>
    </main>
  );
}

export function FormSection({
  title,
  right,
  children
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 8
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 800,
            color: T.muted,
            letterSpacing: 1,
            textTransform: "uppercase"
          }}
        >
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

// ── Inputs ──────────────────────────────────────────────────────────────────

const inputStyle: CSSProperties = {
  width: "100%",
  background: "#fff",
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 600,
  color: T.dark,
  fontFamily: "inherit",
  boxSizing: "border-box"
};

export function DateTimeRow({
  date,
  time,
  onDate,
  onTime
}: {
  date: string;
  time: string;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        type="date"
        value={date}
        onChange={(e) => onDate(e.target.value)}
        style={{ ...inputStyle, flex: 1 }}
      />
      <input
        type="time"
        value={time}
        onChange={(e) => onTime(e.target.value)}
        style={{ ...inputStyle, width: 130, flex: "0 0 auto" }}
      />
    </div>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  multiline,
  type = "text",
  inputMode
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  type?: "text" | "number";
  inputMode?: "numeric" | "decimal";
}) {
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{ ...inputStyle, resize: "none", minHeight: 80 }}
      />
    );
  }
  return (
    <input
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
    />
  );
}

// ── Boutons ─────────────────────────────────────────────────────────────────

export function ChipGroup<V extends string>({
  options,
  value,
  onChange,
  multi = false,
  accent = T.belloMio
}: {
  options: { value: V; label: string }[];
  value: V[] | V | null;
  onChange: (v: V[] | V) => void;
  multi?: boolean;
  accent?: string;
}) {
  const isActive = (v: V) => (multi ? (value as V[]).includes(v) : value === v);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const active = isActive(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              if (multi) {
                const arr = (value as V[]) ?? [];
                onChange(
                  arr.includes(opt.value)
                    ? arr.filter((x) => x !== opt.value)
                    : [...arr, opt.value]
                );
              } else onChange(opt.value);
            }}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 800,
              border: `1px solid ${active ? accent : T.border}`,
              background: active ? accent : "#fff",
              color: active ? "#fff" : T.dark,
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function ConformityPicker({
  value,
  onChange
}: {
  value: "conform" | "nonconform" | null;
  onChange: (v: "conform" | "nonconform") => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <button
        type="button"
        onClick={() => onChange("conform")}
        style={{
          padding: "12px 14px",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 800,
          border: `1px solid ${value === "conform" ? T.green : T.border}`,
          background: value === "conform" ? "rgba(34,197,94,.12)" : "#fff",
          color: value === "conform" ? T.green : T.muted,
          cursor: "pointer"
        }}
      >
        ✓ Conforme
      </button>
      <button
        type="button"
        onClick={() => onChange("nonconform")}
        style={{
          padding: "12px 14px",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 800,
          border: `1px solid ${value === "nonconform" ? T.terracotta : T.border}`,
          background: value === "nonconform" ? "rgba(226,127,87,.12)" : "#fff",
          color: value === "nonconform" ? T.terracotta : T.muted,
          cursor: "pointer"
        }}
      >
        ✗ Non conforme
      </button>
    </div>
  );
}

export function NumberStepper({
  value,
  onChange,
  step = 0.1,
  unit,
  placeholder
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  unit?: string;
  placeholder?: string;
}) {
  const round = (v: number) => Math.round(v * 10) / 10;
  const btn: CSSProperties = {
    width: 46,
    height: 46,
    borderRadius: 12,
    background: "#fff",
    border: `1px solid ${T.border}`,
    fontSize: 22,
    fontWeight: 800,
    color: T.dark,
    cursor: "pointer"
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
      <button
        type="button"
        onClick={() => onChange(value == null ? -step : round(value - step))}
        style={btn}
      >
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={value == null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value.replace(",", ".");
          if (raw === "" || raw === "-") return onChange(null);
          const n = parseFloat(raw);
          if (!Number.isNaN(n)) onChange(n);
        }}
        placeholder={placeholder ?? (unit ? `…${unit}` : "…")}
        style={{ ...inputStyle, flex: 1, textAlign: "center", fontSize: 16, fontWeight: 800 }}
      />
      <button
        type="button"
        onClick={() => onChange(value == null ? step : round(value + step))}
        style={btn}
      >
        +
      </button>
    </div>
  );
}

// ── Save bar ────────────────────────────────────────────────────────────────

export function SaveBar({
  onSave,
  label = "Valider",
  disabled,
  hint,
  busy
}: {
  onSave: () => void;
  label?: string;
  disabled?: boolean;
  hint?: string;
  busy?: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: T.creme,
        borderTop: `1px solid ${T.border}`,
        padding: "12px 16px",
        zIndex: 30
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {hint && (
          <div style={{ fontSize: 12, color: T.muted, textAlign: "center", marginBottom: 6 }}>
            {hint}
          </div>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || busy}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            background: T.dark,
            color: "#fff",
            fontWeight: 800,
            fontSize: 14,
            cursor: disabled || busy ? "not-allowed" : "pointer",
            opacity: disabled || busy ? 0.4 : 1
          }}
        >
          {busy ? "…" : label}
        </button>
      </div>
    </div>
  );
}

// ── Banner status ───────────────────────────────────────────────────────────

export function StatusBanner({
  tone = "info",
  children
}: {
  tone?: "info" | "ok" | "warn";
  children: ReactNode;
}) {
  const palette = {
    info: { bg: "rgba(100,116,139,.10)", fg: T.muted, border: T.border },
    ok: { bg: "rgba(34,197,94,.12)", fg: T.green, border: T.green },
    warn: { bg: "rgba(226,127,87,.12)", fg: T.terracotta, border: T.terracotta }
  }[tone];
  return (
    <div
      style={{
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 700
      }}
    >
      {children}
    </div>
  );
}

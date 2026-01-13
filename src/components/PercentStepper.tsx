"use client";

import { useMemo } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
};

function toNumSafe(v: string, fallback: number) {
  if (v === "" || v === "-" || v === "." || v === "-.") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function decimalsFromStep(step: number) {
  const s = String(step);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

function formatByStep(n: number, step: number) {
  const d = decimalsFromStep(step);
  return d === 0 ? String(Math.round(n)) : n.toFixed(d);
}

export default function PercentStepper({
  label,
  value,
  onChange,
  step = 0.1,
  min = 0,
  max = 120,
  suffix = "%",
}: Props) {
  const num = useMemo(
    () => clamp(toNumSafe(value, 0), min, max),
    [value, min, max]
  );

  const setNum = (n: number) => {
    onChange(formatByStep(clamp(n, min, max), step));
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 240px",
        gap: 12,
        alignItems: "center",
        padding: "10px 0",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="muted">{label}</div>

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          className="btn"
          style={{ width: 44, height: 44, borderRadius: 12 }}
          onClick={() => setNum(num - step)}
        >
          −
        </button>

        <div
          style={{
            height: 44,
            width: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 14,
            padding: "0 14px",
          }}
        >
          <input
            className="noSpin"
            type="number"
            value={value ?? ""}
            step={step}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setNum(num)}
            style={{
              width: 70,
              textAlign: "center",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "#ffffff",
              fontSize: 18,
              fontWeight: 600,
            }}
          />
          <span className="muted" style={{ fontSize: 16, fontWeight: 600 }}>
            {suffix}
          </span>
        </div>

        <button
          type="button"
          className="btn"
          style={{ width: 44, height: 44, borderRadius: 12 }}
          onClick={() => setNum(num + step)}
        >
          +
        </button>
      </div>
    </div>
  );
}
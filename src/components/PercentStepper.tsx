"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  label?: string;
  value: string; // on garde string pour ton modèle (ex: "65", "")
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
};

function clamp(n: number, min?: number, max?: number) {
  let x = n;
  if (Number.isFinite(min as number)) x = Math.max(min as number, x);
  if (Number.isFinite(max as number)) x = Math.min(max as number, x);
  return x;
}

function toNumSafe(v: string, fallback: number) {
  const clean = (v ?? "").replace(",", ".").trim();
  if (clean === "" || clean === "-" || clean === "." || clean === "-.") return fallback;
  const n = Number(clean);
  return Number.isFinite(n) ? n : fallback;
}

function roundStep(n: number, step: number) {
  if (!step || step <= 0) return n;
  const p = 1 / step;
  return Math.round(n * p) / p;
}

export default function PercentStepper({ label, value, onChange, step = 0.1, min = 0, max = 100, suffix = "%" }: Props) {
  const [draft, setDraft] = useState<string>(value ?? "");

  useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setDraft(value ?? "");
}, [value]);

  const current = useMemo(() => clamp(toNumSafe(value ?? "", 0), min, max), [value, min, max]);

  const dec = () => {
    const next = roundStep(clamp(current - step, min, max), step);
    onChange(String(next));
  };

  const inc = () => {
    const next = roundStep(clamp(current + step, min, max), step);
    onChange(String(next));
  };

  const commit = () => {
    const n = roundStep(clamp(toNumSafe(draft ?? "", current), min, max), step);
    onChange(String(n));
  };

  const canDec = current > min;
  const canInc = current < max;

  return (
    <div style={{ marginTop: 10 }}>
      {label ? (
        <div className="muted" style={{ marginBottom: 6 }}>
          {label}
        </div>
      ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "32px auto 32px", gap: 6, alignItems: "center" }}>
        <button className="btn stepBtn" type="button" onClick={dec} disabled={!canDec}>
          –
        </button>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <input
            className="input stepInput"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            inputMode="decimal"
            style={{
              width: 64,
              padding: "6px 8px",
              textAlign: "center",
              fontWeight: 700,
              fontSize: 14,
            }}
          />
          {suffix ? <span className="stepSuffix">{suffix}</span> : null}
        </div>

        <button className="btn stepBtn" type="button" onClick={inc} disabled={!canInc}>
          +
        </button>
      </div>
    </div>
  );
}
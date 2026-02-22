"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  label?: string;
  value: number;
  onChange: (n: number) => void;
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

function toNumberLoose(s: string, fallback: number) {
  const clean = (s ?? "").replace(",", ".").trim();
  if (!clean) return fallback;
  const n = Number(clean);
  return Number.isFinite(n) ? n : fallback;
}

export default function NumberStepper({ label, value, onChange, step = 1, min, max, suffix }: Props) {
  const [draft, setDraft] = useState<string>(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const dec = () => {
    const next = clamp(value - step, min, max);
    onChange(next);
  };

  const inc = () => {
    const next = clamp(value + step, min, max);
    onChange(next);
  };

  const commit = () => {
    const n = clamp(toNumberLoose(draft, value), min, max);
    onChange(n);
  };

  const canDec = useMemo(() => (Number.isFinite(min as number) ? value > (min as number) : true), [value, min]);
  const canInc = useMemo(() => (Number.isFinite(max as number) ? value < (max as number) : true), [value, max]);

  return (
    <div>
      {label ? (
        <div className="muted" style={{ marginBottom: 6 }}>
          {label}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", gap: 10, alignItems: "center" }}>
        <button className="btn stepBtn" type="button" onClick={dec} disabled={!canDec}>
          –
        </button>

        <div style={{ display: "flex", alignItems: "center" }}>
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
            inputMode="numeric"
            style={{ textAlign: "center", fontWeight: 700 }}
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
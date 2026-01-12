"use client";

import { useMemo } from "react";

type Props = {
  label?: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
};

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export default function NumberStepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999999,
  suffix,
}: Props) {
  const num = useMemo(() => clamp(value ?? 0, min, max), [value, min, max]);

  const setNum = (n: number) => onChange(clamp(n, min, max));

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {label ? <div className="muted">{label}</div> : null}

      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-start" }}>
        <button className="btn stepBtn" type="button" onClick={() => setNum(num - step)}>
          −
        </button>

        <div className="stepField">
          <input
            className="stepInput"
            type="number"
            value={num}
            step={step}
            onChange={(e) => setNum(Number(e.target.value))}
          />
          {suffix ? <span className="stepSuffix">{suffix}</span> : null}
        </div>

        <button className="btn stepBtn" type="button" onClick={() => setNum(num + step)}>
          +
        </button>
      </div>
    </div>
  );
}
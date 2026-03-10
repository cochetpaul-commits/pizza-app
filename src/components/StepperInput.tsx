"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  value: number | "";
  onChange: (v: number | "") => void;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
}

export function StepperInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  placeholder,
  disabled,
}: Props) {
  const [draft, setDraft] = useState(value === "" ? "" : String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(value === "" ? "" : String(value));
    }
  }, [value]);

  function clamp(v: number): number {
    let r = v;
    if (min != null) r = Math.max(min, r);
    if (max != null) r = Math.min(max, r);
    return r;
  }

  function commit() {
    if (draft === "" || draft === "-") {
      onChange("");
      return;
    }
    const n = parseFloat(draft);
    if (!Number.isFinite(n)) {
      onChange("");
      setDraft("");
      return;
    }
    const clamped = clamp(n);
    onChange(clamped);
    setDraft(String(clamped));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      commit();
      inputRef.current?.blur();
    }
  }

  function increment(direction: 1 | -1) {
    const current = value === "" ? 0 : value;
    const next = current + step * direction;
    const clamped = clamp(next);
    const precision = step < 1 ? String(step).split(".")[1]?.length ?? 0 : 0;
    const rounded = Number(clamped.toFixed(precision));
    onChange(rounded);
    setDraft(String(rounded));
  }

  const atMin = min != null && (value === "" ? 0 : value) <= min;
  const atMax = max != null && (value === "" ? 0 : value) >= max;

  return (
    <div style={{
      display: "inline-flex",
      border: "1.5px solid #e5ddd0",
      borderRadius: 10,
      overflow: "hidden",
      opacity: disabled ? 0.5 : 1,
    }}>
      <button
        type="button"
        onClick={() => increment(-1)}
        disabled={disabled || atMin}
        style={{
          width: 36, height: 40,
          background: "#f5f0e8", color: "#8B1A1A",
          fontSize: 18, border: "none",
          cursor: disabled || atMin ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700,
        }}
      >−</button>
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: 64, height: 40,
          background: "#fff",
          borderLeft: "1.5px solid #e5ddd0",
          borderRight: "1.5px solid #e5ddd0",
          borderTop: "none", borderBottom: "none",
          textAlign: "center", fontWeight: 600,
          fontSize: 14, fontFamily: "inherit",
          outline: "none",
          MozAppearance: "textfield",
          WebkitAppearance: "none",
        } as React.CSSProperties}
      />
      <button
        type="button"
        onClick={() => increment(1)}
        disabled={disabled || atMax}
        style={{
          width: 36, height: 40,
          background: "#f5f0e8", color: "#8B1A1A",
          fontSize: 18, border: "none",
          cursor: disabled || atMax ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700,
        }}
      >+</button>
    </div>
  );
}

"use client";

import { useState, useRef } from "react";

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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function clamp(v: number): number {
    let r = v;
    if (min != null) r = Math.max(min, r);
    if (max != null) r = Math.min(max, r);
    return r;
  }

  function handleFocus() {
    setDraft(value === "" ? "" : String(value));
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    if (draft === "" || draft === "-") {
      onChange("");
      return;
    }
    const n = parseFloat(draft);
    if (!Number.isFinite(n)) {
      onChange("");
      return;
    }
    const clamped = clamp(n);
    onChange(clamped);
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
  }

  const displayValue = editing ? draft : (value === "" ? "" : String(value));
  const hasValue = value !== "" && value > 0;
  const atMin = min != null && (value === "" ? 0 : value) <= min;
  const atMax = max != null && (value === "" ? 0 : value) >= max;

  const btnBase: React.CSSProperties = {
    width: 32, height: 32,
    borderRadius: "50%",
    border: "none",
    fontSize: 16,
    fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.12s, transform 0.1s",
    flexShrink: 0,
  };

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      opacity: disabled ? 0.5 : 1,
    }}>
      <button
        type="button"
        onClick={() => increment(-1)}
        disabled={disabled || atMin}
        style={{
          ...btnBase,
          background: hasValue ? "rgba(139,26,26,0.08)" : "rgba(0,0,0,0.04)",
          color: hasValue ? "#8B1A1A" : "#ccc",
          cursor: disabled || atMin ? "not-allowed" : "pointer",
        }}
      >−</button>
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        value={displayValue}
        onChange={e => setDraft(e.target.value)}
        onFocus={handleFocus}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: 38, height: 32,
          background: "transparent",
          border: "none",
          textAlign: "center",
          fontWeight: hasValue ? 800 : 500,
          fontSize: hasValue ? 16 : 13,
          fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
          color: hasValue ? "#D4775A" : "#bbb",
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
          ...btnBase,
          background: "rgba(74,103,65,0.10)",
          color: "#4a6741",
          cursor: disabled || atMax ? "not-allowed" : "pointer",
        }}
      >+</button>
    </div>
  );
}

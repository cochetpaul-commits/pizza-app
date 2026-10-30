"use client";

/** Compteur −/+ d'une ligne d'inventaire (cartons, unités) */
export function MiniStepper({ value, active, color, label, onChange }: {
  value: number | "";
  active: boolean;
  color: string;
  label: string;
  onChange: (v: number) => void;
}) {
  const n = value === "" ? 0 : Number(value);
  const btn: React.CSSProperties = {
    width: 22, height: 36, border: "1px solid #ddd6c8", background: "#f9f5ef",
    fontSize: 15, fontWeight: 700, cursor: "pointer", padding: 0,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button type="button" onClick={() => onChange(Math.max(0, n - 1))}
          style={{ ...btn, borderRadius: "8px 0 0 8px", borderRight: "none", color: "#D4775A" }}>−</button>
        <input
          type="number"
          step="1"
          min="0"
          value={value}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val === "" ? 0 : Math.max(0, Math.round(Number(val))));
          }}
          placeholder="0"
          style={{
            width: 40, height: 36, borderRadius: 0,
            border: active ? `1.5px solid ${color}` : "1px solid #ddd6c8",
            padding: "0 2px", fontSize: 14, fontWeight: 600,
            textAlign: "center", background: "#fff", outline: "none",
            color: active ? color : "#1a1a1a",
          }}
        />
        <button type="button" onClick={() => onChange(n + 1)}
          style={{ ...btn, borderRadius: "0 8px 8px 0", borderLeft: "none", color: "#4a6741" }}>+</button>
      </div>
      <span style={{ fontSize: 8, color: active ? color : "#999", fontWeight: 700, marginTop: 1 }}>{label}</span>
    </div>
  );
}


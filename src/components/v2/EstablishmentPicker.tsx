"use client";

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
}

const ESTABS = [
  { id: "bellomio", label: "Bello Mio" },
  { id: "piccola",  label: "Piccola Mia" },
] as const;

export function EstablishmentPicker({ value, onChange }: Props) {
  function toggle(id: string) {
    if (value.includes(id)) {
      const next = value.filter(v => v !== id);
      if (next.length > 0) onChange(next);
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {ESTABS.map(e => {
        const active = value.includes(e.id);
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => toggle(e.id)}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: "1.5px solid",
              borderColor: active ? "#D4775A" : "rgba(217,199,182,0.95)",
              background: active ? "rgba(139,26,26,0.08)" : "rgba(255,255,255,0.7)",
              color: active ? "#D4775A" : "#6f6a61",
              cursor: "pointer", transition: "all 0.12s",
            }}
          >
            {e.label}
          </button>
        );
      })}
    </div>
  );
}

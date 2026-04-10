"use client";

import { PALETTE } from "@/lib/colors";

interface ColorPickerProps {
  value: string | null;
  onChange: (hex: string) => void;
  size?: number;
}

/**
 * Compact color picker: grid of palette swatches.
 * Used on supplier detail, recipe forms, establishment settings.
 */
export function ColorPicker({ value, onChange, size = 28 }: ColorPickerProps) {
  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
    }}>
      {PALETTE.map((c) => {
        const selected = value?.toUpperCase() === c.hex.toUpperCase();
        return (
          <button
            key={c.hex}
            type="button"
            title={c.name}
            onClick={() => onChange(c.hex)}
            style={{
              width: size,
              height: size,
              borderRadius: 8,
              background: c.hex,
              border: selected ? "2.5px solid #1a1a1a" : "2px solid transparent",
              cursor: "pointer",
              padding: 0,
              outline: selected ? "2px solid #fff" : "none",
              outlineOffset: -4,
              transition: "transform 0.1s",
              transform: selected ? "scale(1.15)" : "scale(1)",
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}

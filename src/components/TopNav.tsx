import React from "react";

type TopNavProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
};

export function TopNav({ title, subtitle, eyebrow }: TopNavProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      {eyebrow && (
        <p style={{
          margin: "0 0 4px", fontSize: 9, fontWeight: 700,
          letterSpacing: 3, textTransform: "uppercase", color: "#7a4a2a",
        }}>
          {eyebrow}
        </p>
      )}
      <h1 style={h1}>{title}</h1>
      {subtitle && <div style={sub}>{subtitle}</div>}
    </div>
  );
}

const h1: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.1,
  fontWeight: 700,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: "#1a1a1a",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const sub: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#999",
};

import React from "react";

type TopNavProps = {
  title: string;
  subtitle?: string;
};

export function TopNav({ title, subtitle }: TopNavProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h1 style={h1}>{title}</h1>
      {subtitle && <div style={sub}>{subtitle}</div>}
    </div>
  );
}

const h1: React.CSSProperties = {
  margin: 0,
  fontSize: 32,
  lineHeight: 1.1,
  fontWeight: 800,
  letterSpacing: -0.4,
};

const sub: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#6f6a61",
};

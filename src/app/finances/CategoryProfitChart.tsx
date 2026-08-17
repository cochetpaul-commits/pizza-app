"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";

const ACCENT = "#D4775A";

type CategoryProfit = {
  name: string;
  ca: number;
  cogs: number;
  margin: number;
  foodCostPct: number | null;
  matchRate: number;
};

function fmtEuroInt(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €"; }

function CatBarTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number; dataKey: string; name: string }>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 10, padding: "10px 14px", fontSize: 13, minWidth: 140 }}>
      <p style={{ margin: 0, fontWeight: 700, color: "#1a1a1a" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: "4px 0 0", color: p.dataKey === "ca" ? ACCENT : "#999", fontWeight: 600 }}>
          {p.dataKey === "ca" ? "CA" : "Coût"} : {fmtEuroInt(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function CategoryProfitChart({ categories }: { categories: CategoryProfit[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, categories.length * 50)}>
      <BarChart data={categories} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3" horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => `${Math.round(v)}€`} tick={{ fontSize: 10, fill: "#9a8f84" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1a1a1a", fontWeight: 600 }} axisLine={false} tickLine={false} width={80} />
        <Tooltip content={<CatBarTooltip />} cursor={{ fill: "#f5f0e8" }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Bar dataKey="ca" name="CA" fill={ACCENT} radius={[0, 4, 4, 0]} maxBarSize={24} />
        <Bar dataKey="cogs" name="Coût" fill="#c9b99a" radius={[0, 4, 4, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

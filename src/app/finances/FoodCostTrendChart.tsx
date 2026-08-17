"use client";

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";

const ACCENT = "#D4775A";
const GREEN = "#4a6741";

type WeeklyTrend = {
  week: string;
  ca: number;
  cogs: number;
  foodCostPct: number | null;
};

function TrendTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 10, padding: "10px 14px", fontSize: 13, minWidth: 120 }}>
      <p style={{ margin: 0, fontWeight: 700, color: "#1a1a1a" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: "4px 0 0", color: p.color, fontWeight: 600 }}>
          {p.dataKey === "foodCostPct" ? `${p.value?.toFixed(1)}%` : p.value.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €"}
        </p>
      ))}
    </div>
  );
}

export default function FoodCostTrendChart({ weeklyTrend }: { weeklyTrend: WeeklyTrend[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={weeklyTrend} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3" vertical={false} />
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9a8f84" }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10, fill: "#9a8f84" }} axisLine={false} tickLine={false} width={40}
          domain={["dataMin - 2", "dataMax + 2"]}
        />
        <Tooltip content={<TrendTooltip />} />
        <Line
          type="monotone" dataKey="foodCostPct" stroke={ACCENT}
          strokeWidth={2.5} dot={{ r: 4, fill: ACCENT }} name="Food cost %"
          connectNulls
        />
        <ReferenceLine y={30} stroke={GREEN} strokeWidth={1} strokeDasharray="6 4" label={{ value: "30%", position: "right", fontSize: 10, fill: GREEN }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

type MonthData = { label: string; hausses: number; baisses: number };

export default function PriceVariationsChart({ chartData }: { chartData: MonthData[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid rgba(217,199,182,0.95)", background: "#FAF7F2", fontSize: 13 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="hausses" name="Hausses" fill="#DC2626" radius={[4,4,0,0]} />
        <Bar dataKey="baisses" name="Baisses" fill="#16A34A" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

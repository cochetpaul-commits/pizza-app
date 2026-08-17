"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const LINE_COLORS = ["#8B1A1A", "#1E40AF", "#5C7A4E", "#7C3AED", "#92400E", "#EA580C"];

export default function PriceEvolutionChart({
  chartData,
  supplierList,
}: {
  chartData: Record<string, string | number>[];
  supplierList: [string, string][];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: "1px solid rgba(217,199,182,0.95)", background: "#FAF7F2", fontSize: 12 }}
          formatter={(value: unknown, name: unknown) => {
            const supName = supplierList.find(([id]) => id === name)?.[1] ?? String(name);
            return [`${Number(value).toFixed(2)} €`, supName];
          }}
        />
        {supplierList.length > 1 && <Legend formatter={(value) => supplierList.find(([id]) => id === value)?.[1] ?? value} wrapperStyle={{ fontSize: 11 }} />}
        {supplierList.map(([supId], idx) => (
          <Line
            key={supId}
            type="monotone"
            dataKey={supId}
            stroke={LINE_COLORS[idx % LINE_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

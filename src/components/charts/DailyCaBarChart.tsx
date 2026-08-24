"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

const DM_SANS = "var(--font-dm-sans), 'DM Sans', sans-serif";

export default function DailyCaBarChart({
  dailyCa,
  color,
}: {
  dailyCa: { date: string; ca: number }[];
  color: string;
}) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current || dailyCa.length === 0) return;
    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels: dailyCa.map(d => new Date(d.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })),
        datasets: [{ label: "CA TTC", data: dailyCa.map(d => Math.round(d.ca)), backgroundColor: color + "CC", borderRadius: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${(ctx.parsed.y ?? 0).toLocaleString("fr-FR")} €` } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10, family: DM_SANS } } },
          y: { grid: { color: "rgba(0,0,0,0.04)" }, ticks: { font: { size: 10, family: DM_SANS }, callback: v => `${Number(v).toLocaleString("fr-FR")}` } },
        },
      },
    });
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [dailyCa, color]);

  return <canvas ref={chartRef} height={220} />;
}

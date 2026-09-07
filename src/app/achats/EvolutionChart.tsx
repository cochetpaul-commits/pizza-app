"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export default function EvolutionChart({
  labels,
  datasets,
}: {
  labels: string[];
  datasets: { label: string; data: number[]; backgroundColor: string; borderRadius: number }[];
}) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { font: { size: 10 }, color: "#999" },
            grid: { display: false },
          },
          y: {
            stacked: true,
            ticks: {
              callback: (v) => {
                const n = typeof v === "number" ? v : parseFloat(String(v));
                return Math.round(n).toLocaleString("fr-FR") + "€";
              },
              font: { size: 10 },
              color: "#999",
            },
            grid: { color: "#f2ede4" },
          },
        },
      },
    });
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [labels, datasets]);

  return <canvas ref={chartRef} />;
}

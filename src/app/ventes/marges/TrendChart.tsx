"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

const fmtDec = (v: number) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";
const fmt = fmtDec;
const BORDER = "#e0d8ce";

export default function TrendChart({
  labels,
  values,
  metric,
  color,
}: {
  labels: string[];
  values: number[];
  metric: "qty" | "ca_ht";
  color: string;
}) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: color,
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => (metric === "qty" ? `${ctx.parsed.y}` : fmtDec(ctx.parsed.y ?? 0)),
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: {
            beginAtZero: true,
            grid: { color: BORDER },
            ticks: { font: { size: 10 }, callback: (v) => (metric === "qty" ? v : fmt(v as number)) },
          },
        },
      },
    });
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [labels, values, metric, color]);

  return <canvas ref={chartRef} />;
}

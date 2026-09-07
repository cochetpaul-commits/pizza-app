"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export default function SupplierBarChart({
  labels,
  data,
  colors,
}: {
  labels: string[];
  data: number[];
  colors: string[];
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
        datasets: [{
          data,
          backgroundColor: colors,
          borderRadius: 4,
          barThickness: 18,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => fmt(ctx.parsed.x),
            },
          },
        },
        scales: {
          x: {
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
          y: {
            ticks: { font: { size: 11, family: "DM Sans, sans-serif" }, color: "#555" },
            grid: { display: false },
          },
        },
      },
    });
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [labels, data, colors]);

  return <canvas ref={chartRef} />;
}

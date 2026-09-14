"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

const fmtDec = (v: number) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";

export default function FoodCostCategoryChart({
  categories,
  colors,
}: {
  categories: { cat: string; cogs: number; food_cost_pct: number }[];
  colors: string[];
}) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "doughnut",
      data: {
        labels: categories.map((c) => c.cat),
        datasets: [
          {
            data: categories.map((c) => c.cogs),
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: "#fff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "55%",
        plugins: {
          legend: {
            position: "right",
            labels: { font: { size: 11 }, padding: 12 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const cat = categories[ctx.dataIndex];
                return `${cat.cat}: ${fmtDec(cat.cogs)} (${cat.food_cost_pct}%)`;
              },
            },
          },
        },
      },
    });
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [categories, colors]);

  return <canvas ref={chartRef} />;
}

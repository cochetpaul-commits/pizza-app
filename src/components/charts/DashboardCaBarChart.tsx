"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { T } from "@/lib/tokens";
import type { Etablissement } from "@/types/etablissement";

const DM_SANS = "var(--font-dm-sans), 'DM Sans', sans-serif";

export default function DashboardCaBarChart({
  dailyCa,
  etablissements,
}: {
  dailyCa: { date: string; byEtab: Record<string, number> }[];
  etablissements: Etablissement[];
}) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current || dailyCa.length === 0) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const etabIds = etablissements.map(e => e.id);
    const etabColors: Record<string, string> = {};
    for (const e of etablissements) etabColors[e.id] = e.slug?.includes("bello") ? T.belloMio : T.piccolaMia;

    const labels = dailyCa.map(d => {
      const dt = new Date(d.date + "T12:00:00");
      return dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
    });

    const datasets = etabIds.map(id => ({
      label: etablissements.find(e => e.id === id)?.nom ?? "",
      data: dailyCa.map(d => Math.round(d.byEtab[id] ?? 0)),
      backgroundColor: etabColors[id] + "CC",
      borderRadius: 6,
    }));

    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: etabIds.length > 1, position: "top", labels: { boxWidth: 10, font: { size: 11, family: DM_SANS } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toLocaleString("fr-FR")} €` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10, family: DM_SANS } } },
          y: { stacked: true, grid: { color: "rgba(0,0,0,0.04)" }, ticks: { font: { size: 10, family: DM_SANS }, callback: (v) => `${Number(v).toLocaleString("fr-FR")}` } },
        },
      },
    });
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [dailyCa, etablissements]);

  return <canvas ref={chartRef} height={220} />;
}

"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { getCategoryColor, getCategoryColors } from "@/lib/categoryColors";
import type { WeekData } from "./page";

const fmt = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + "€";
const fmtK = (v: number) => Math.round(v).toLocaleString("fr-FR") + "€";

const charts: Record<string, Chart> = {};
function destroyChart(id: string) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

export default function ChartCanvas({ id, height, data, mode, type, onBarClick }: {
  id: string; height: number; data: WeekData; mode: "ttc" | "ht"; type: "mix" | "top10" | "serv" | "pay";
  onBarClick?: (label: string, color: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    destroyChart(id);

    if (type === "mix") {
      const vals = mode === "ttc" ? data.mix_ttc : data.mix_ht;
      const total = vals.reduce((a, b) => a + b, 0);
      charts[id] = new Chart(canvasRef.current, {
        type: "bar",
        data: { labels: data.mix_labels, datasets: [{
          data: vals,
          backgroundColor: getCategoryColors(data.mix_labels),
          borderRadius: 4, borderSkipped: false,
          barPercentage: 0.7, categoryPercentage: 0.85,
        }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          layout: { padding: { right: 100 } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${fmt(ctx.raw as number)} — ${((ctx.raw as number) / total * 100).toFixed(1)}%` } } },
          scales: {
            x: { display: false },
            y: { grid: { display: false }, ticks: { color: "#444", font: { size: 12, weight: "bold" as const }, padding: 4 }, border: { display: false } },
          },
          onClick: (_evt, elements) => {
            if (elements.length && onBarClick) {
              const i = elements[0].index;
              onBarClick(data.mix_labels[i], getCategoryColor(data.mix_labels[i], i));
            }
          },
        },
        plugins: [{
          id: "barLabels",
          afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            chart.data.datasets.forEach((ds, di) => {
              chart.getDatasetMeta(di).data.forEach((bar, i) => {
                const val = ds.data[i] as number;
                const pct = (val / total * 100).toFixed(0);
                ctx.save();
                ctx.font = "600 11px DM Sans, sans-serif";
                ctx.fillStyle = "#777";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(`${Math.round(val).toLocaleString("fr-FR")}€  ${pct}%`, bar.x + 8, bar.y);
                ctx.restore();
              });
            });
          },
        }],
      });
    }

    if (type === "top10") {
      const gradStart = [196, 90, 54], gradEnd = [240, 196, 180];
      const n = data.top10_names.length;
      const colors = data.top10_names.map((_, i) => {
        const t = n > 1 ? i / (n - 1) : 0;
        return `rgb(${Math.round(gradStart[0] + (gradEnd[0] - gradStart[0]) * t)},${Math.round(gradStart[1] + (gradEnd[1] - gradStart[1]) * t)},${Math.round(gradStart[2] + (gradEnd[2] - gradStart[2]) * t)})`;
      });
      charts[id] = new Chart(canvasRef.current, {
        type: "bar",
        data: { labels: data.top10_names, datasets: [{ data: mode === "ttc" ? data.top10_ca_ttc : data.top10_ca_ht, backgroundColor: colors, borderRadius: 4 }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `CA : ${(ctx.raw as number).toLocaleString("fr-FR")}€ · ${data.top10_qty[ctx.dataIndex]} ventes` } } },
          scales: {
            x: { grid: { color: "rgba(0,0,0,0.05)" }, ticks: { callback: v => v + "€", color: "#aaa", font: { size: 11 } }, border: { display: false } },
            y: { grid: { display: false }, ticks: { color: "#444", font: { size: 11 } }, border: { display: false } },
          },
        },
      });
    }

    if (type === "serv") {
      const gradStart = [46, 101, 90], gradEnd = [155, 195, 185];
      const n = data.serveurs.length;
      const colors = data.serveurs.map((_, i) => {
        const t = n > 1 ? i / (n - 1) : 0;
        return `rgb(${Math.round(gradStart[0] + (gradEnd[0] - gradStart[0]) * t)},${Math.round(gradStart[1] + (gradEnd[1] - gradStart[1]) * t)},${Math.round(gradStart[2] + (gradEnd[2] - gradStart[2]) * t)})`;
      });
      charts[id] = new Chart(canvasRef.current, {
        type: "bar",
        data: { labels: data.serveurs, datasets: [{ data: mode === "ttc" ? data.serv_ca_ttc : data.serv_ca_ht, backgroundColor: colors, borderRadius: 4 }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => {
            const i = ctx.dataIndex;
            const caVal = ctx.raw as number;
            const tkt = data.serv_tickets?.[i] ?? 0;
            const cov = data.serv_cov?.[i] ?? 0;
            const cvtM = cov > 0 ? (caVal / cov).toFixed(1) : "—";
            return [`CA : ${fmt(caVal)} (${(caVal / (mode === "ttc" ? data.ca_ttc : data.ca_ht) * 100).toFixed(1)}%)`, `${tkt} tickets · ${cov} cvts · CVT M ${cvtM}€`];
          } } } },
          scales: {
            x: { grid: { color: "rgba(0,0,0,0.05)" }, ticks: { callback: v => fmtK(v as number), color: "#aaa", font: { size: 11 } }, border: { display: false } },
            y: { grid: { display: false }, ticks: { color: "#444", font: { size: 12 } }, border: { display: false } },
          },
        },
      });
    }

    if (type === "pay" && data.pay && data.pay.length > 0) {
      const payColors = ["#c8960a", "#e0b020", "#f0c840", "#f5d96a", "#f9e9a0"];
      charts[id] = new Chart(canvasRef.current, {
        type: "doughnut",
        data: {
          labels: data.pay.map(p => p.l),
          datasets: [{ data: data.pay.map(p => p.v), backgroundColor: payColors.slice(0, data.pay.length), borderWidth: 2, borderColor: "#fff" }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label} : ${fmt(ctx.raw as number)}` } } },
          cutout: "62%",
        },
      });
    }

    return () => { destroyChart(id); };
  }, [id, data, mode, type, onBarClick]);

  return <div style={{ position: "relative", height }}><canvas ref={canvasRef} /></div>;
}

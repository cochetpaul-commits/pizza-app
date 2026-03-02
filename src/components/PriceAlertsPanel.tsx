"use client";

// src/components/PriceAlertsPanel.tsx

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts, ALERT_THRESHOLD, ABERRANT_THRESHOLD } from "@/lib/priceAlerts";
import type { PriceAlert } from "@/lib/priceAlerts";

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── Ligne individuelle ──────────────────────────────────────────────────────

function AlertRow({ a }: { a: PriceAlert }) {
  const isUp = a.direction === "up";

  const badgeBg    = a.aberrant ? "#D97706" : isUp ? "#DC2626" : "#16a34a";
  const badgeBorder = a.aberrant ? "rgba(217,119,6,0.3)" : isUp ? "rgba(220,38,38,0.3)" : "rgba(22,163,74,0.3)";
  const rowBg      = a.aberrant ? "rgba(254,243,199,0.4)" : isUp ? "rgba(254,242,242,0.4)" : "rgba(240,253,244,0.4)";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 16,
      alignItems: "center",
      padding: "11px 16px",
      background: rowBg,
      borderBottom: "1px solid rgba(217,199,182,0.3)",
    }}>
      {/* Gauche — noms + meta */}
      <div>
        {/* Nom catalogue */}
        <div style={{
          fontSize: 13, fontWeight: 700,
          letterSpacing: "0.05em", textTransform: "uppercase",
          color: "#2f3a33",
        }}>
          {a.ingredient_name}
        </div>
        {/* Nom brut fournisseur */}
        {a.supplier_label && a.supplier_label !== "—" && a.supplier_label !== a.ingredient_name && (
          <div style={{ fontSize: 11, color: "#9a8f84", marginTop: 1, fontStyle: "italic" }}>
            {a.supplier_label}
          </div>
        )}
        {/* Fournisseur + date */}
        <div style={{ fontSize: 11, color: "#6f6a61", marginTop: 2 }}>
          {a.supplier_name !== "—" ? a.supplier_name : ""}
          {a.supplier_name !== "—" && " · "}
          {fmtDateShort(a.new_offer_date)}
          {a.aberrant && (
            <span style={{
              marginLeft: 8,
              fontSize: 10, fontWeight: 700,
              color: "#D97706",
            }}>
              ⚠️ à vérifier
            </span>
          )}
        </div>
      </div>

      {/* Droite — badge % + prix */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{
          display: "inline-block",
          background: badgeBg,
          border: `1px solid ${badgeBorder}`,
          color: "#fff",
          borderRadius: 8, fontSize: 13, fontWeight: 800,
          padding: "2px 10px", marginBottom: 3,
          letterSpacing: "-0.2px",
        }}>
          {fmtPct(a.change_pct)}
        </div>
        <div style={{ fontSize: 11, color: "#6f6a61" }}>
          {fmtMoney(a.old_price)} → {fmtMoney(a.new_price)} €/{a.unit}
        </div>
      </div>
    </div>
  );
}

// ── Section pliable (hausses ou baisses) ────────────────────────────────────

function AlertSection({
  title, alerts, defaultOpen, accentColor,
}: {
  title: string;
  alerts: PriceAlert[];
  defaultOpen: boolean;
  accentColor: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!alerts.length) return null;

  return (
    <div style={{ borderTop: "1px solid rgba(217,199,182,0.4)" }}>
      {/* En-tête section */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 16px", cursor: "pointer", userSelect: "none",
          background: "rgba(255,255,255,0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            background: accentColor, color: "#fff",
            borderRadius: 6, fontSize: 11, fontWeight: 800,
            padding: "1px 7px",
          }}>
            {alerts.length}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: accentColor }}>{title}</span>
        </div>
        <span style={{
          fontSize: 11, color: "#9a8f84",
          display: "inline-block",
          transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform 0.15s",
        }}>▾</span>
      </div>

      {open && alerts.map(a => <AlertRow key={a.ingredient_id + a.direction} a={a} />)}
    </div>
  );
}

// ── Panneau principal ───────────────────────────────────────────────────────

export function PriceAlertsPanel({ userId }: { userId: string }) {
  const [alerts, setAlerts]   = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]       = useState(true);

  useEffect(() => {
    if (!userId) return;
    fetchPriceAlerts(supabase, userId)
      .then(setAlerts)
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return null;

  const hausses  = alerts.filter(a => a.direction === "up");
  const baisses  = alerts.filter(a => a.direction === "down");
  const total    = alerts.length;

  // ── Aucune alerte ──
  if (!total) return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 14px", marginBottom: 16,
      borderRadius: 12,
      background: "rgba(240,253,244,0.6)",
      border: "1px solid rgba(22,163,74,0.2)",
      fontSize: 13, color: "#16a34a", fontWeight: 600,
    }}>
      ✓ Aucune variation fournisseur ≥ {Math.round(ALERT_THRESHOLD * 100)}% détectée
    </div>
  );

  return (
    <div style={{
      marginBottom: 20,
      borderRadius: 14,
      border: "1.5px solid rgba(217,199,182,0.7)",
      background: "rgba(255,255,255,0.5)",
      overflow: "hidden",
      boxShadow: "0 2px 12px rgba(47,58,51,0.06)",
    }}>

      {/* ── En-tête principal ── */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", cursor: "pointer", userSelect: "none",
          background: "rgba(255,255,255,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#2f3a33" }}>
            Variations prix fournisseurs
          </span>
          {hausses.length > 0 && (
            <span style={{
              background: "#DC2626", color: "#fff",
              borderRadius: 6, fontSize: 11, fontWeight: 800,
              padding: "1px 7px",
            }}>
              ↑ {hausses.length} hausse{hausses.length > 1 ? "s" : ""}
            </span>
          )}
          {baisses.length > 0 && (
            <span style={{
              background: "#16a34a", color: "#fff",
              borderRadius: 6, fontSize: 11, fontWeight: 800,
              padding: "1px 7px",
            }}>
              ↓ {baisses.length} baisse{baisses.length > 1 ? "s" : ""}
            </span>
          )}
          <span style={{ fontSize: 11, color: "#9a8f84" }}>
            seuil : ±{Math.round(ALERT_THRESHOLD * 100)}% · aberrant : &gt;{Math.round(ABERRANT_THRESHOLD * 100)}%
          </span>
        </div>
        <span style={{
          fontSize: 11, color: "#9a8f84",
          display: "inline-block",
          transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform 0.15s",
        }}>▾</span>
      </div>

      {/* ── Sections hausses + baisses ── */}
      {open && (
        <>
          <AlertSection
            title="Hausses"
            alerts={hausses}
            defaultOpen={true}
            accentColor="#DC2626"
          />
          <AlertSection
            title="Baisses"
            alerts={baisses}
            defaultOpen={true}
            accentColor="#16a34a"
          />
        </>
      )}
    </div>
  );
}

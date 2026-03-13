"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { fetchApi } from "@/lib/fetchApi";

type CaData = { totalSales: number; guestsNumber: number } | null;

export default function GroupePage() {
  const [ca, setCa] = useState<CaData>(null);

  useEffect(() => {
    async function fetchCa() {
      try {
        const res = await fetchApi("/api/popina/ca-jour");
        if (!res.ok) return;
        const d = await res.json();
        setCa({ totalSales: d.totalSales ?? 0, guestsNumber: d.guestsNumber ?? 0 });
      } catch { /* silencieux */ }
    }
    fetchCa();
  }, []);

  const fmtEur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <RequireRole allowedRoles={["admin"]}>
      <div style={{ minHeight: "100dvh", background: "#f2ede4" }}>

        {/* ── Header sombre ── */}
        <div style={{
          background: "#1a1a1a",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Image
              src="/logo-ifratelli.png"
              alt="iFratelli Group"
              width={40}
              height={40}
              style={{ height: 44, width: "auto", objectFit: "contain", filter: "brightness(1.8)" }}
              priority
            />
            <div>
              <span style={{
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                fontSize: 20,
                fontWeight: 600,
                fontStyle: "italic",
                color: "#D4775A",
                lineHeight: 1.1,
              }}>
                iFratelli
              </span>
              <span style={{
                display: "block",
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: "#888",
              }}>
                GROUP
              </span>
            </div>
          </div>
          <Link href="/" style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#999",
            textDecoration: "none",
            padding: "6px 14px",
            borderRadius: 20,
            border: "1px solid #333",
            background: "rgba(255,255,255,0.05)",
          }}>
            ← Retour
          </Link>
        </div>

        <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

          {/* ── KPI consolidé ── */}
          <div style={{
            background: "#1a1a1a",
            borderRadius: 16,
            padding: "20px 24px",
            marginBottom: 20,
          }}>
            <p style={{
              margin: 0,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#888",
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            }}>
              CA GROUPE AUJOURD&apos;HUI
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              <span style={{
                fontSize: 36,
                fontWeight: 700,
                color: "#fff",
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                lineHeight: 1,
              }}>
                {ca ? `${fmtEur(ca.totalSales)} €` : "—"}
              </span>
              {ca && ca.guestsNumber > 0 && (
                <span style={{ fontSize: 13, color: "#888" }}>
                  {ca.guestsNumber} couverts
                </span>
              )}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "#555" }}>
              1 établissement actif sur 2
            </p>
          </div>

          {/* ── Établissements ── */}
          <p style={{
            margin: "0 0 10px 4px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#b0a894",
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
          }}>
            ÉTABLISSEMENTS
          </p>

          {/* Bello Mio */}
          <div style={{
            background: "#fff",
            borderRadius: 14,
            padding: "18px 20px",
            marginBottom: 10,
            borderLeft: "4px solid #D4775A",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#22c55e",
                    display: "inline-block",
                  }} />
                  <p style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#1a1a1a",
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                    letterSpacing: 0.5,
                  }}>
                    Bello Mio
                  </p>
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 12 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: "#D4775A", fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif" }}>
                    {ca ? `${fmtEur(ca.totalSales)} €` : "—"}
                  </span>
                  {ca && ca.guestsNumber > 0 && (
                    <span style={{ fontSize: 12, color: "#999", alignSelf: "flex-end", paddingBottom: 2 }}>
                      {ca.guestsNumber} couv.
                    </span>
                  )}
                </div>
              </div>
              <Link href="/" style={{
                display: "inline-flex",
                alignItems: "center",
                height: 30,
                padding: "0 14px",
                borderRadius: 20,
                background: "rgba(212,119,90,0.08)",
                border: "1px solid rgba(212,119,90,0.20)",
                color: "#D4775A",
                fontSize: 11,
                fontWeight: 700,
                textDecoration: "none",
              }}>
                Ouvrir →
              </Link>
            </div>
          </div>

          {/* Piccola Mia */}
          <div style={{
            background: "#fff",
            borderRadius: 14,
            padding: "18px 20px",
            marginBottom: 20,
            borderLeft: "4px solid #4a6741",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            opacity: 0.6,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#ccc",
                    display: "inline-block",
                  }} />
                  <p style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#1a1a1a",
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                    letterSpacing: 0.5,
                  }}>
                    Piccola Mia
                  </p>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#999" }}>
                  À configurer
                </p>
              </div>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                height: 30,
                padding: "0 14px",
                borderRadius: 20,
                background: "rgba(74,103,65,0.06)",
                border: "1px solid rgba(74,103,65,0.15)",
                color: "#aaa",
                fontSize: 11,
                fontWeight: 700,
                cursor: "not-allowed",
                opacity: 0.4,
              }}>
                Bientôt disponible
              </span>
            </div>
          </div>

          {/* ── Alertes groupe ── */}
          <p style={{
            margin: "0 0 10px 4px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#b0a894",
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
          }}>
            ALERTES GROUPE
          </p>
          <div style={{
            background: "#fff",
            borderRadius: 14,
            padding: "24px 20px",
            textAlign: "center",
            color: "#ccc",
            fontSize: 13,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            Aucune alerte pour le moment
          </div>

        </div>
      </div>
    </RequireRole>
  );
}

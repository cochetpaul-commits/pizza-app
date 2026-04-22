"use client";

import { useState } from "react";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RecettesContent } from "@/components/production/RecettesTab";
import { CatalogueContent } from "@/components/production/CatalogueTab";

type TabKey = "recettes" | "catalogue";

const TABS: { key: TabKey; label: string }[] = [
  { key: "recettes", label: "Recettes" },
  { key: "catalogue", label: "Catalogue" },
];

export default function FichesTechniquesPage() {
  const [tab, setTab] = useState<TabKey>("recettes");
  const { current: etab } = useEtablissement();
  const ec = etab?.couleur;

  return (
    <div style={{ background: "#f2ede4", minHeight: "100vh" }}>
      {/* Tab bar — centered segment control */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "#f2ede4",
        padding: "12px 16px",
        display: "flex", justifyContent: "center",
      }}>
        <div style={{
          display: "inline-flex", gap: 4, padding: 4,
          background: "#ece4d4", borderRadius: 12,
          border: "1px solid #e8e0d0",
        }}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: "7px 20px", fontSize: 12, fontWeight: 700,
                cursor: "pointer", border: "none", borderRadius: 8,
                background: active ? (ec ? ec + "20" : "#fff") : "transparent",
                color: active ? "#1a1a1a" : "#999",
                fontFamily: "inherit", whiteSpace: "nowrap",
                boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s",
              }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content — lazy render (only mount active tab) */}
      {tab === "recettes" && <RecettesContent />}
      {tab === "catalogue" && <CatalogueContent />}
    </div>
  );
}

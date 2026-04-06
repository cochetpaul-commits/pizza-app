"use client";

import { useState } from "react";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RecettesContent } from "@/components/production/RecettesTab";
import { CatalogueContent } from "@/components/production/CatalogueTab";
import { ArticlesContent } from "@/components/production/ArticlesTab";

type TabKey = "recettes" | "catalogue" | "articles";

const TABS: { key: TabKey; label: string }[] = [
  { key: "recettes", label: "Recettes" },
  { key: "catalogue", label: "Catalogue" },
  { key: "articles", label: "Articles de vente" },
];

export default function FichesTechniquesPage() {
  const [tab, setTab] = useState<TabKey>("recettes");
  const { current: etab } = useEtablissement();
  const ec = etab?.couleur;

  return (
    <div>
      {/* Tab bar — segment control */}
      <div style={{
        padding: "12px 16px", position: "sticky", top: 0,
        background: "#f2ede4", zIndex: 50,
      }}>
        <div style={{
          display: "inline-flex", gap: 4, padding: 4,
          background: "#e8e0d0", borderRadius: 12,
        }}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: "8px 20px", fontSize: 13, fontWeight: 600,
                cursor: "pointer", border: "none", borderRadius: 10,
                background: active ? (ec ? ec + "25" : "#fff") : "transparent",
                color: active ? "#1a1a1a" : "#999",
                fontFamily: "inherit", whiteSpace: "nowrap",
                boxShadow: active ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
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
      {tab === "articles" && <ArticlesContent />}
    </div>
  );
}

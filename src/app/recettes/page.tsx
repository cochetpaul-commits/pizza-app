"use client";

import { useState } from "react";
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

  return (
    <div>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        gap: 0,
        borderBottom: "1.5px solid #e0d8ce",
        marginBottom: 16,
        overflowX: "auto",
        position: "sticky",
        top: 0,
        background: "#f2ede4",
        zIndex: 50,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: tab === t.key ? 700 : 500,
              cursor: "pointer",
              border: "none",
              background: "transparent",
              color: tab === t.key ? "#D4775A" : "#999",
              borderBottom: tab === t.key ? "2.5px solid #D4775A" : "2.5px solid transparent",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — lazy render (only mount active tab) */}
      {tab === "recettes" && <RecettesContent />}
      {tab === "catalogue" && <CatalogueContent />}
      {tab === "articles" && <ArticlesContent />}
    </div>
  );
}

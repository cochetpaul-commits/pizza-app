"use client";

import { useState } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";

type Tab = "mael" | "metro";

const TABS: { key: Tab; label: string }[] = [
  { key: "mael", label: "MAËL" },
  { key: "metro", label: "METRO" },
];

export default function CommandesPage() {
  const [tab, setTab] = useState<Tab>("mael");

  return (
    <RequireRole allowedRoles={["admin", "manager", "cuisinier"]}>
      <NavBar />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontFamily: "Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
          Commandes fournisseurs
        </h1>

        {/* Onglets */}
        <div style={{ display: "flex", gap: 0, marginTop: 20, borderBottom: "2px solid #e5e5e5" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "10px 28px",
                fontFamily: "Oswald, sans-serif",
                fontSize: 15,
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? "#D4775A" : "#888",
                background: "none",
                border: "none",
                borderBottom: tab === t.key ? "3px solid #D4775A" : "3px solid transparent",
                cursor: "pointer",
                marginBottom: -2,
                transition: "all .15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div style={{ marginTop: 24 }}>
          {tab === "mael" && (
            <div style={{ padding: 32, background: "#fafafa", borderRadius: 12, textAlign: "center", color: "#999", fontFamily: "DM Sans, sans-serif" }}>
              Commandes MAËL — à venir
            </div>
          )}
          {tab === "metro" && (
            <div style={{ padding: 32, background: "#fafafa", borderRadius: 12, textAlign: "center", color: "#999", fontFamily: "DM Sans, sans-serif" }}>
              Commandes METRO — à venir
            </div>
          )}
        </div>
      </div>
    </RequireRole>
  );
}

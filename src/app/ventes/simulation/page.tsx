"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { SimulationContent } from "@/components/rh/SimulationContent";
import { SimulateurRentabiliteMS } from "@/components/rh/SimulateurRentabiliteMS";

export default function SimulationPage() {
  return (
    <Suspense fallback={null}>
      <SimulationPageInner />
    </Suspense>
  );
}

function SimulationPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: "tns" | "simulateur" | "rentabilite" =
    tabParam === "simulateur" ? "simulateur" : tabParam === "rentabilite" ? "rentabilite" : "tns";
  const [tab, setTab] = useState<"reelle" | "tns" | "simulateur" | "rentabilite">(initialTab);

  if (tab === "reelle") { router.push("/rh/masse-salariale"); return null; }

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 100px" }}>
        <div className="masse-sal-tabs" style={{ display: "flex", gap: 4, padding: 4, background: "#f0ebe2", borderRadius: 12, marginBottom: 18, border: "1px solid #e8e0d0" }}>
          {([
            { key: "reelle" as const, label: "MS reelle" },
            { key: "tns" as const, label: "Statuts TNS" },
            { key: "simulateur" as const, label: "Simulateur embauche" },
            { key: "rentabilite" as const, label: "Rentabilite MS" },
          ]).map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
              flex: 1, padding: "8px 10px", borderRadius: 10, border: "none",
              background: tab === t.key ? "#fff" : "transparent",
              color: tab === t.key ? "#1a1a1a" : "#777",
              fontSize: 12, fontWeight: 700, cursor: tab === t.key ? "default" : "pointer",
              boxShadow: tab === t.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              whiteSpace: "nowrap",
            }}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === "rentabilite" ? (
          <SimulateurRentabiliteMS />
        ) : (
          <SimulationContent activeTab={tab === "simulateur" ? "simulateur" : "tns"} />
        )}
      </div>
    </RequireRole>
  );
}

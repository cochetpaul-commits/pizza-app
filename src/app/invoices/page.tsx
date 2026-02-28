"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SUPPLIERS = [
  { key: "mael", label: "MAEL", href: "/invoices/mael" },
  { key: "metro", label: "METRO", href: "/invoices/metro" },
  { key: "vinoflo", label: "VINOFLO", href: "/invoices/vinoflo" },
  { key: "cozigou", label: "COZIGOU", href: "/invoices/cozigou" },
  { key: "carniato", label: "CARNIATO", href: "/invoices/carniato" },
  { key: "barspirits", label: "BAR SPIRITS", href: "/invoices/barspirits" },
  { key: "sum", label: "SUM", href: "/invoices/sum" },
  { key: "armor", label: "ARMOR EMBALLAGES", href: "/invoices/armor" },
];

export default function InvoicesHubPage() {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "2rem", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <button
          onClick={() => router.push("/")}
          style={{ background: "transparent", border: "1px solid #ccc", borderRadius: 6, padding: "0.4rem 1rem", fontSize: "0.875rem", cursor: "pointer" }}
        >
          ↩ Accueil
        </button>
        <button
          onClick={() => router.push("/ingredients")}
          style={{ background: "transparent", border: "1px solid #ccc", borderRadius: 6, padding: "0.4rem 1rem", fontSize: "0.875rem", cursor: "pointer" }}
        >
          ≡ Index ingrédients
        </button>
      </div>

      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Import factures fournisseurs
      </h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        Sélectionne un fournisseur pour importer sa facture et mettre à jour les prix.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        {SUPPLIERS.map((s) => (
          <button
            key={s.key}
            onClick={() => router.push(s.href)}
            style={{
              padding: "1rem 2rem",
              fontSize: "1rem",
              fontWeight: 600,
              border: "2px solid #2563eb",
              borderRadius: 8,
              background: active === s.key ? "#2563eb" : "white",
              color: active === s.key ? "white" : "#2563eb",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive(null)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p style={{ marginTop: "3rem", color: "#aaa", fontSize: "0.8rem" }}>
        D&apos;autres fournisseurs seront ajoutés ici au fur et à mesure.
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { NavBar } from "@/components/NavBar";

const SUPPLIERS = [
  { key: "mael",      label: "MAEL",             category: "Produits frais",    color: "#c0392b", href: "/invoices/mael" },
  { key: "metro",     label: "METRO",             category: "Grande distribution", color: "#27ae60", href: "/invoices/metro" },
  { key: "vinoflo",   label: "VINOFLO",           category: "Vins & boissons",   color: "#2980b9", href: "/invoices/vinoflo" },
  { key: "cozigou",   label: "COZIGOU",           category: "Épicerie fine",     color: "#e67e22", href: "/invoices/cozigou" },
  { key: "carniato",  label: "CARNIATO",          category: "Charcuterie",       color: "#8e44ad", href: "/invoices/carniato" },
  { key: "barspirits",label: "BAR SPIRITS",       category: "Spiritueux",        color: "#16a085", href: "/invoices/barspirits" },
  { key: "sum",       label: "SUM",               category: "Divers",            color: "#7f8c8d", href: "/invoices/sum" },
  { key: "masse",     label: "MASSE",              category: "Viande & foie gras", color: "#8B1A1A", href: "/invoices/masse" },
  { key: "armor",     label: "ARMOR EMBALLAGES",  category: "Emballage",         color: "#f39c12", href: "/invoices/armor", fullWidth: true },
];

export default function InvoicesHubPage() {
  const router = useRouter();

  return (
    <>
      <NavBar right={<Link href="/ingredients" className="btn">≡ Index ingrédients</Link>} />
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 40px", boxSizing: "border-box" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "#8B1A1A", textTransform: "uppercase", margin: "0 0 6px" }}>
            FACTURES
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a1a", margin: 0, fontFamily: "var(--font-dm-serif-display), Georgia, serif" }}>
            Import factures fournisseurs
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#7a6f63" }}>
            Sélectionne un fournisseur pour importer sa facture et mettre à jour les prix.
          </p>
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {SUPPLIERS.map((s) => (
            <button
              key={s.key}
              onClick={() => router.push(s.href)}
              style={{
                gridColumn: s.fullWidth ? "1 / -1" : undefined,
                display: "flex",
                alignItems: "stretch",
                background: "rgba(255,255,255,0.82)",
                border: "1px solid rgba(217,199,182,0.8)",
                borderRadius: 16,
                padding: 0,
                overflow: "hidden",
                boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                cursor: "pointer",
                textAlign: "left",
                transition: "box-shadow 0.15s, border-color 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 14px rgba(0,0,0,0.10)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(217,199,182,1)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 6px rgba(0,0,0,0.04)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(217,199,182,0.8)";
              }}
            >
              {/* Color bar */}
              <div style={{ width: 3, background: s.color, flexShrink: 0 }} />

              {/* Content */}
              <div style={{ padding: "18px 16px", flex: 1 }}>
                <div style={{
                  display: "inline-block",
                  fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                  background: `${s.color}18`, color: s.color,
                  borderRadius: 4, padding: "2px 6px", marginBottom: 8,
                }}>
                  {s.category}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", letterSpacing: 0.5 }}>
                  {s.label}
                </div>
              </div>

              {/* Arrow */}
              <div style={{ display: "flex", alignItems: "center", paddingRight: 14, color: "#bbb", fontSize: 16 }}>›</div>
            </button>
          ))}
        </div>

      </main>
    </>
  );
}

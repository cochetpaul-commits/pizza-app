"use client";

import Link from "next/link";
import { Brush, ListChecks, Package, Radio } from "lucide-react";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RequireRole } from "@/components/RequireRole";
import { T } from "@/lib/tokens";

// Backoffice HACCP — réservé group_admin.
// Permet de paramétrer les référentiels par établissement : équipements,
// produits, tâches de nettoyage, sondes LoRaWAN.

interface AdminCard {
  href: string;
  label: string;
  hint: string;
  Icon: typeof Brush;
  color: string;
}

const CARDS: AdminCard[] = [
  { href: "/haccp/admin/equipments", label: "Équipements",        hint: "Frigos, congel, vitrines, plages °C.", Icon: ListChecks, color: "#3E7BFB" },
  { href: "/haccp/admin/products",   label: "Produits référents", hint: "Catalogue traçabilité, DLC.",          Icon: Package,    color: "#E8B23A" },
  { href: "/haccp/admin/cleaning",   label: "Tâches de nettoyage", hint: "Quotidien / hebdo / mensuel.",         Icon: Brush,      color: "#22c55e" },
  { href: "/haccp/admin/probes",     label: "Sondes LoRaWAN",     hint: "Mapping deveui → équipement.",          Icon: Radio,      color: "#E2603B" }
];

export default function HaccpAdminHome() {
  const { current, isGroupView } = useEtablissement();

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <main
        style={{
          minHeight: "100vh",
          background: T.creme,
          padding: "24px 16px 60px",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif"
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <Link
            href="/haccp"
            style={{
              display: "inline-block",
              marginBottom: 16,
              fontSize: 13,
              fontWeight: 700,
              color: T.muted,
              textDecoration: "none"
            }}
          >
            ← HACCP
          </Link>

          <header style={{ marginBottom: 20 }}>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1.5,
                color: T.muted,
                textTransform: "uppercase"
              }}
            >
              HACCP · Paramètres
            </p>
            <h1
              style={{
                margin: "6px 0 4px",
                fontFamily: "var(--font-oswald), Oswald, sans-serif",
                fontWeight: 700,
                fontSize: 26,
                color: T.dark,
                letterSpacing: 0.5
              }}
            >
              {isGroupView ? "Groupe iFratelli" : (current?.nom ?? "Établissement")}
            </h1>
            <p style={{ margin: 0, color: T.muted, fontSize: 14 }}>
              Référentiels par établissement. Ce que tu paramètres ici alimente directement les modules HACCP (équipements, plages °C, tâches de nettoyage, mapping sondes).
            </p>
          </header>

          {isGroupView && (
            <div
              style={{
                background: "#fff",
                border: `1px solid ${T.border}`,
                borderRadius: 14,
                padding: "12px 14px",
                color: T.muted,
                fontSize: 13,
                marginBottom: 16
              }}
            >
              Sélectionne un établissement dans le sélecteur du haut — les
              référentiels sont propres à chaque restaurant.
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14
            }}
          >
            {CARDS.map((c) => {
              const Icon = c.Icon;
              return (
                <Link
                  key={c.href}
                  href={c.href}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <article
                    style={{
                      background: "#fff",
                      border: `1px solid ${T.border}`,
                      borderRadius: 16,
                      padding: "18px 16px",
                      boxShadow: T.tileShadow,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      cursor: "pointer",
                      transition: "transform .15s ease, box-shadow .15s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = T.tileShadowHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = T.tileShadow;
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: `${c.color}22`,
                        color: c.color,
                        display: "grid",
                        placeItems: "center"
                      }}
                    >
                      <Icon size={22} strokeWidth={2} />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.dark }}>
                      {c.label}
                    </span>
                    <span style={{ fontSize: 12, color: T.muted, lineHeight: 1.4 }}>
                      {c.hint}
                    </span>
                  </article>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </RequireRole>
  );
}

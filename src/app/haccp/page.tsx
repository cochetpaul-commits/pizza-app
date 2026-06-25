"use client";

import Link from "next/link";
import { useEtablissement } from "@/lib/EtablissementContext";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";

// Catégorie HACCP — index des 10 modules de mise en conformité sanitaire.
// Données stockées dans les tables `haccp_*` filtrées par etablissement_id
// via la fonction `user_has_etablissement_access(uuid)` déjà en place.

type ModuleDef = {
  code: string;
  label: string;
  hint: string;
  icon: string;
};

const MODULES: ModuleDef[] = [
  { code: "temperatures",  label: "Températures",          hint: "Frigos, congel, vitrines — plages de conformité.", icon: "🌡️" },
  { code: "cleaning",      label: "Plan de nettoyage",     hint: "Postes quotidien / hebdo / mensuel.",              icon: "🧹" },
  { code: "tracability",   label: "Traçabilité",           hint: "Lots de produits, photos de réception.",           icon: "🏷️" },
  { code: "reception",     label: "Contrôle à réception",  hint: "Vérif T°C, DLC, état de chaque livraison.",        icon: "📦" },
  { code: "product_temp",  label: "T°C produit",           hint: "Cuisson / refroidissement / remise en T°C.",        icon: "🔥" },
  { code: "checklist",     label: "Checklist",             hint: "Grilles d'audit ouverture/fermeture.",             icon: "📋" },
  { code: "oils",          label: "Huiles",                hint: "Friteuse, % composés polaires, changements.",       icon: "💧" },
  { code: "production",    label: "Production",            hint: "Fiches de fabrication, traçabilité ingrédients.",   icon: "🍲" },
  { code: "documents",     label: "Documents",             hint: "PMS, protocoles, attestations formations.",         icon: "📑" },
  { code: "labels",        label: "Étiqueteuse",           hint: "Étiquettes DLC secondaires, imprimante BLE.",       icon: "🖨️" }
];

export default function HaccpHome() {
  const { current, isGroupView } = useEtablissement();
  const accent = current?.slug === "piccola-mia" ? T.piccolaMia : T.belloMio;

  return (
    <RequireRole>
      <main
        style={{
          minHeight: "100vh",
          background: T.creme,
          padding: "32px 20px 64px",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif"
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <header style={{ marginBottom: 24 }}>
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
              HACCP · Hygiène & conformité
            </p>
            <h1
              style={{
                margin: "6px 0 4px",
                fontFamily: "var(--font-oswald), Oswald, sans-serif",
                fontWeight: 700,
                fontSize: 32,
                color: T.dark,
                letterSpacing: 0.5
              }}
            >
              {isGroupView ? "Groupe iFratelli" : current?.nom ?? "Établissement"}
            </h1>
            <p style={{ margin: 0, color: T.muted, fontSize: 14 }}>
              Autocontrôles, plan de nettoyage et traçabilité. Toutes les écritures
              sont horodatées et attribuées — preuves disponibles en cas de contrôle DDPP.
            </p>
          </header>

          {isGroupView && (
            <div
              style={{
                background: "#fff",
                border: `1px solid ${T.border}`,
                borderRadius: 14,
                padding: "14px 16px",
                color: T.muted,
                fontSize: 13,
                marginBottom: 18
              }}
            >
              Choisis un établissement dans le sélecteur en haut pour afficher
              ses modules HACCP.
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 14
            }}
          >
            {MODULES.map((m) => (
              <Link
                key={m.code}
                href={`/haccp/${m.code}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <article
                  style={{
                    background: "#fff",
                    border: `1px solid ${T.border}`,
                    borderRadius: 14,
                    padding: "18px 18px 20px",
                    boxShadow: T.tileShadow,
                    cursor: "pointer",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    minHeight: 140
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
                      borderRadius: 12,
                      background: `${accent}22`,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 22
                    }}
                  >
                    {m.icon}
                  </div>
                  <div>
                    <h3
                      style={{
                        margin: "0 0 4px",
                        fontSize: 15,
                        fontWeight: 700,
                        color: T.dark,
                        fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        textTransform: "uppercase",
                        letterSpacing: 0.4
                      }}
                    >
                      {m.label}
                    </h3>
                    <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.4 }}>
                      {m.hint}
                    </p>
                  </div>
                </article>
              </Link>
            ))}
          </div>

          <p
            style={{
              marginTop: 28,
              fontSize: 12,
              color: T.muted,
              textAlign: "center"
            }}
          >
            v0.1 · catégorie HACCP. Les modules s'enrichiront au fil des prochaines sessions.
          </p>
        </div>
      </main>
    </RequireRole>
  );
}

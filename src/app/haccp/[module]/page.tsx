"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEtablissement } from "@/lib/EtablissementContext";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";

// Stub des modules HACCP. Chaque module recevra son UI dédiée dans une
// prochaine session ; pour l'instant on garde une coquille cohérente avec
// le reste de pizza-app (CSS inline + T tokens) qui indique clairement
// l'état d'avancement.

const LABELS: Record<string, { label: string; hint: string }> = {
  temperatures:  { label: "Températures",         hint: "Sélection d'équipements, stepper °C, validation en lot avec plages de conformité." },
  cleaning:      { label: "Plan de nettoyage",    hint: "Tâches du jour à cocher (quotidien / hebdo / mensuel)." },
  tracability:   { label: "Traçabilité",          hint: "Saisie de lot, DLC auto depuis la base produits, photo." },
  reception:     { label: "Contrôle à réception", hint: "Fournisseur, catégories, T°C produits frais, conforme / non conforme." },
  product_temp:  { label: "T°C produit",          hint: "Cuisson ≥ +63 °C, refroidissement +63→+10 °C en < 2 h, remise en T°C." },
  checklist:     { label: "Checklist",            hint: "Grille d'audit interne ou Mérieux NutriSciences." },
  oils:          { label: "Huiles",               hint: "Languette / sonde / visuel, % CP ≤ 25 %, action suite au contrôle." },
  production:    { label: "Production",           hint: "Recette, lot, T°C cœur, DLC secondaire, traçabilité ingrédients." },
  documents:     { label: "Documents",            hint: "PMS, protocoles, bons de passage nuisibles / maintenance, formations." },
  labels:        { label: "Étiqueteuse",          hint: "DLC secondaire, lot, bandeau jour de semaine, impression BLE ou A4." }
};

export default function HaccpModuleStub() {
  const params = useParams<{ module: string }>();
  const code = params?.module ?? "";
  const info = LABELS[code] ?? { label: code, hint: "Module inconnu." };
  const { current } = useEtablissement();
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
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
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

          <article
            style={{
              background: "#fff",
              border: `1px solid ${T.border}`,
              borderRadius: 16,
              padding: "32px 28px",
              boxShadow: T.tileShadow,
              textAlign: "center"
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: 999,
                background: `${accent}22`,
                color: accent,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1,
                textTransform: "uppercase"
              }}
            >
              Module en préparation
            </span>
            <h1
              style={{
                margin: "12px 0 8px",
                fontFamily: "var(--font-oswald), Oswald, sans-serif",
                fontSize: 28,
                color: T.dark
              }}
            >
              {info.label}
            </h1>
            <p style={{ margin: 0, color: T.muted, fontSize: 14, lineHeight: 1.5 }}>
              {info.hint}
            </p>
            <p style={{ marginTop: 18, color: T.muted, fontSize: 13 }}>
              La route, les tables Supabase (<code style={{ background: T.creme, padding: "1px 6px", borderRadius: 4 }}>haccp_*</code>) et les
              policies RLS sont déjà en place. Il ne manque que l&apos;UI de saisie dédiée, à
              porter depuis le proto Vite (<code style={{ background: T.creme, padding: "1px 6px", borderRadius: 4 }}>/Users/paulcochet/bello-mio 2</code>) en
              style pizza-app.
            </p>
          </article>
        </div>
      </main>
    </RequireRole>
  );
}

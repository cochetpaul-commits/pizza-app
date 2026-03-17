"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { T } from "@/lib/tokens";
import { TileIcon } from "@/components/TileIcon";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "DM Sans, sans-serif", fontSize: 9, fontWeight: 700,
      letterSpacing: "0.18em", textTransform: "uppercase",
      color: T.mutedLight, marginBottom: 10, marginTop: 4,
    }}>{children}</div>
  );
}

function Tile({ href, iconName, title, sub, value, accent, wide }: {
  href: string; iconName?: React.ComponentProps<typeof TileIcon>["name"]; title: string; sub?: string;
  value?: string; accent?: string; wide?: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", gridColumn: wide ? "span 2" : "span 1" }}>
      <div style={{
        background: T.white, borderRadius: 16, padding: "16px 18px",
        border: `1.5px solid ${T.border}`,
        borderLeft: `3px solid ${accent || T.jaune}`,
        minHeight: 90, display: "flex", flexDirection: "column",
        justifyContent: "space-between", cursor: "pointer",
        transition: "all 0.2s", boxShadow: T.tileShadow,
      }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = T.tileShadowHover;
          e.currentTarget.style.borderColor = accent || T.jaune;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = T.tileShadow;
          e.currentTarget.style.borderColor = T.border;
          e.currentTarget.style.borderLeftColor = accent || T.jaune;
        }}
      >
        <div>
          {iconName && <div style={{ marginBottom: 8 }}><TileIcon name={iconName} size={20} color={accent || T.jauneDark} /></div>}
          <div style={{
            fontFamily: "Oswald, sans-serif", fontWeight: 600,
            fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
            color: accent || T.jauneDark,
          }}>{title}</div>
          {sub && <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: T.muted, marginTop: 3, lineHeight: 1.4 }}>{sub}</div>}
        </div>
        {value && (
          <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 28, color: T.dark, lineHeight: 1, marginTop: 8 }}>
            {value}
          </div>
        )}
      </div>
    </Link>
  );
}

type ActiveSession = { id: string; supplier_id: string; status: string; suppliers?: { name: string }[] | { name: string } | null };

export default function CuisineHubPM() {
  const { etablissements, setCurrent, current } = useEtablissement();
  const [recipesCount, setRecipesCount] = useState<number | null>(null);
  const [ingredientsCount, setIngredientsCount] = useState<number | null>(null);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);

  useEffect(() => {
    const pm = etablissements.find(e => e.slug === "piccola");
    if (pm) setCurrent(pm);
  }, [etablissements, setCurrent]);

  useEffect(() => {
    if (!current?.id) return;
    const eid = current.id;
    Promise.all([
      supabase.from("ingredients").select("id", { count: "exact", head: true }).eq("etablissement_id", eid),
      supabase.from("pizza_recipes").select("id", { count: "exact", head: true }).contains("establishments", [current.slug]),
      supabase.from("kitchen_recipes").select("id", { count: "exact", head: true }).contains("establishments", [current.slug]),
      supabase.from("prep_recipes").select("id", { count: "exact", head: true }).contains("establishments", [current.slug]),
      supabase.from("cocktails").select("id", { count: "exact", head: true }),
      supabase.from("commande_sessions").select("id, supplier_id, status, suppliers(name)")
        .eq("etablissement_id", eid).in("status", ["brouillon", "en_attente", "validee"]),
    ]).then(([ing, pz, kr, pr, co, sess]) => {
      setIngredientsCount(ing.count ?? 0);
      setRecipesCount((pz.count ?? 0) + (kr.count ?? 0) + (pr.count ?? 0) + (co.count ?? 0));
      setActiveSessions((sess.data ?? []) as ActiveSession[]);
    });
  }, [current]);

  return (
    <div style={{ minHeight: "100dvh", background: T.creme, animation: "slideUp 0.25s ease" }}>
      <AppNav />
      <div style={{ padding: "20px 16px 40px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: T.muted, letterSpacing: 2, textTransform: "uppercase" }}>Piccola Mia</div>
          <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 32, color: T.dark }}>Cuisine</div>
        </div>

        <SectionLabel>Bibliotheque</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <Tile href="/recettes"    title="Recettes"    sub="Pizze · Cuisine · Cocktails · Empatements" value={recipesCount != null ? String(recipesCount) : "…"}  />
          <Tile href="/ingredients" title="Ingredients" sub="Catalogue produits & prix"                  value={ingredientsCount != null ? String(ingredientsCount) : "…"} />
        </div>

        <SectionLabel>Approvisionnement</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {activeSessions.length > 0 ? (
            activeSessions.map((s) => (
              <Tile
                key={s.id}
                href={`/commandes?supplier_id=${s.supplier_id}`}
                iconName="commandes"
                title={(() => { const sup = s.suppliers; const n = Array.isArray(sup) ? sup[0]?.name : sup?.name; return n ?? "Commande"; })()}
                sub={s.status === "brouillon" ? "Brouillon en cours" : s.status === "en_attente" ? "En attente de validation" : "Validée"}
                accent={s.status === "en_attente" ? "#2563EB" : s.status === "validee" ? "#16a34a" : T.sauge}
              />
            ))
          ) : (
            <Tile href="/commandes" iconName="commandes" title="Commander" sub="Nouvelle commande" accent={T.sauge} wide />
          )}
          <Tile href="/mercuriale"   iconName="mercuriale"   title="Mercuriale"   sub="Prix du marche"        accent={T.sauge} />
          <Tile href="/fournisseurs" iconName="fournisseurs" title="Fournisseurs" sub="Contacts & tarifs"     accent={T.sauge} />
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { navEtablissement, NAV_EQUIPIER, NAV_GROUPE, type NavItemV2 } from "./SidebarNav";

/**
 * Recherche globale de la barre du haut (bureau) : un champ, raccourci ⌘K / Ctrl+K,
 * résultats groupés par type (écrans, produits, fiches techniques, fournisseurs,
 * employés). Chaque résultat ouvre directement la fiche.
 */

type Resultat = { type: string; id: string; titre: string; sous?: string | null; href: string };

const TYPES: Record<string, string> = {
  ecran: "Écrans", produit: "Produits", fiche: "Fiches techniques", fournisseur: "Fournisseurs", employe: "Employés",
};
const ORDRE = ["ecran", "produit", "fiche", "fournisseur", "employe"];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function GlobalSearch() {
  const router = useRouter();
  const { role, can } = useProfile();
  const { current, isGroupView } = useEtablissement();
  const [q, setQ] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [chargement, setChargement] = useState(false);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const requete = useRef(0);

  // Écrans : les entrées de la barre latérale visibles pour cet utilisateur
  const ecrans = useMemo<NavItemV2[]>(() => {
    const isManager = role === "group_admin" || role === "manager";
    const piccola = !!current?.slug?.includes("piccola");
    const liste = !isManager ? NAV_EQUIPIER : isGroupView ? NAV_GROUPE : navEtablissement(piccola ? "/piccola-mia" : "/bello-mio", piccola);
    const ok = (i: { roles?: string[]; permission?: string }) => (!i.roles || (role && i.roles.includes(role))) && (!i.permission || can(i.permission));
    const out: NavItemV2[] = [];
    for (const e of liste) {
      if (e.kind === "page" && ok(e)) out.push(e);
      if (e.kind === "group" && ok(e)) for (const it of e.items) if (ok(it)) out.push({ ...it, label: `${e.label} · ${it.label}` });
    }
    return out;
  }, [role, can, current, isGroupView]);

  // Raccourci clavier ⌘K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOuvert(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Clic en dehors
  useEffect(() => {
    if (!ouvert) return;
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [ouvert]);

  const chercher = useCallback(async (texte: string) => {
    const t = texte.trim();
    const id = ++requete.current;
    if (t.length < 2) { setResultats([]); setChargement(false); return; }
    setChargement(true);
    const etabId = !isGroupView ? current?.id : undefined;
    // Une seule requête (fonction SQL recherche_globale) au lieu de cinq : moins de connexions,
    // réponse plus rapide, surtout quand une page charge déjà beaucoup de données.
    const { data } = await supabase.rpc("recherche_globale", {
      q: t.replace(/[%_]/g, ""),
      etab: etabId ?? null,
      avec_employes: can("profil.view_team"),
    });
    if (id !== requete.current) return; // une frappe plus récente a pris le relais

    const nq = norm(t);
    const out: Resultat[] = [];
    for (const e of ecrans) if (norm(e.label).includes(nq)) out.push({ type: "ecran", id: e.href, titre: e.label, href: e.href });
    for (const r of (data ?? []) as { type: string; id: string; titre: string; sous: string | null; extra: string | null }[]) {
      if (r.type === "produit") out.push({ type: "produit", id: r.id, titre: r.titre, sous: r.sous, href: `/ingredients/${r.id}` });
      else if (r.type === "fiche") out.push({ type: "fiche", id: r.id, titre: r.titre, sous: r.sous, href: r.extra === "cocktail" ? `/recettes/cocktail/${r.id}` : `/fiche/${r.id}` });
      else if (r.type === "pizza") out.push({ type: "fiche", id: `pizza-${r.id}`, titre: r.titre, sous: "Pizza", href: `/recettes/pizza/${r.id}` });
      else if (r.type === "fournisseur") out.push({ type: "fournisseur", id: r.id, titre: r.titre, href: `/fournisseurs/${r.id}` });
      else if (r.type === "employe") out.push({ type: "employe", id: r.id, titre: r.titre, sous: r.sous, href: `/rh/employe/${r.id}` });
    }
    out.sort((a, b) => ORDRE.indexOf(a.type) - ORDRE.indexOf(b.type));
    setResultats(out);
    setIndex(0);
    setChargement(false);
  }, [can, current, isGroupView, ecrans]);

  // Frappe avec un léger délai
  useEffect(() => {
    const h = setTimeout(() => { chercher(q); }, 180);
    return () => clearTimeout(h);
  }, [q, chercher]);

  const ouvrir = (r: Resultat) => {
    setOuvert(false);
    setQ("");
    inputRef.current?.blur();
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setOuvert(false); inputRef.current?.blur(); return; }
    if (!resultats.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, resultats.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); const r = resultats[index]; if (r) ouvrir(r); }
  };

  const montrer = ouvert && q.trim().length >= 2;

  return (
    <div ref={boxRef} style={{ position: "relative", flex: "0 1 420px", minWidth: 0 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 10px 0 12px",
        borderRadius: 10, border: "1px solid rgba(0,0,0,0.10)", background: "rgba(255,255,255,0.85)",
      }}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#8d8577", flexShrink: 0 }}>
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          id="recherche-globale"
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOuvert(true); }}
          onFocus={() => setOuvert(true)}
          onKeyDown={onKeyDown}
          placeholder="Rechercher…"
          aria-label="Rechercher un écran, un produit, une fiche, un fournisseur ou un employé"
          autoComplete="off"
          style={{
            flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
            fontSize: 13, color: "#1a1a1a", fontFamily: "inherit",
          }}
        />
        <kbd style={{
          fontSize: 10.5, fontWeight: 600, color: "#8d8577", padding: "2px 6px", borderRadius: 6,
          border: "1px solid rgba(0,0,0,0.10)", background: "rgba(0,0,0,0.03)", fontFamily: "inherit", flexShrink: 0,
        }}>⌘K</kbd>
      </div>

      {montrer && (
        <div role="listbox" style={{
          position: "absolute", left: 0, right: 0, top: "calc(100% + 6px)", zIndex: 130,
          background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14,
          boxShadow: "0 12px 36px rgba(0,0,0,0.14)", maxHeight: 420, overflowY: "auto", padding: 6,
        }}>
          {chargement && resultats.length === 0 && (
            <div style={{ padding: "12px 12px", fontSize: 12.5, color: "#8d8577" }}>Recherche…</div>
          )}
          {!chargement && resultats.length === 0 && (
            <div style={{ padding: "12px 12px", fontSize: 12.5, color: "#8d8577" }}>Rien ne correspond à « {q.trim()} ».</div>
          )}
          {resultats.map((r, i) => {
            const entete = i === 0 || resultats[i - 1].type !== r.type;
            const actif = i === index;
            return (
              <React.Fragment key={`${r.type}-${r.id}`}>
                {entete && (
                  <div style={{ padding: "8px 10px 3px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8d8577" }}>
                    {TYPES[r.type] ?? r.type}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={actif}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => ouvrir(r)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px",
                    borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    background: actif ? "rgba(212,119,90,0.10)" : "transparent", color: "#1a1a1a",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 600 }}>{r.titre}</span>
                  {r.sous && <span style={{ fontSize: 11.5, color: "#8d8577", flexShrink: 0 }}>{r.sous}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

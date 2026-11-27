"use client";

import React, { useMemo, useState } from "react";
import { EtatVide } from "@/components/ui/EtatVide";
import { BORD, CHAMP, MUTED, OSWALD, h1 } from "@/components/ui/charte";
import { useBureau } from "@/hooks/useBureau";
import { useVoirMontants } from "@/lib/useVoirMontants";
import { ProduireFiche, quantiteLisible } from "@/components/fiche/ProduireFiche";
import { clairCategorie, couleurCategorie, LIBELLES_CATEGORIE, nomLisible, titreFiche } from "@/lib/ficheTechnique";
import { useDonneesCarte } from "./useDonneesCarte";
import { ficheVersProduction } from "./VueFiches";
import type { FicheCarte } from "@/app/api/carte/route";

/**
 * Page « Produire » (27/11/2026, demande de Paul, Piccola Mia d'abord, pensée pour l'iPad de l'épicerie) : les recettes
 * qui ont un ingrédient phare (l'étoile), en grosses tuiles ; une touche ouvre la recette en mode production, en pleine
 * page (réglage et pesées à gauche, instructions à droite sur grand écran). Seulement les recettes étoilées : on se
 * force à mettre une étoile sur chaque recette. Aux couleurs des fiches imprimables. Rien n'est enregistré.
 * Ouvert à l'équipe ; les montants restent réservés aux responsables.
 */
export function ProduireListe() {
  const bureau = useBureau();
  const voirMontants = useVoirMontants();
  const { donnees, erreur } = useDonneesCarte(0);
  const [q, setQ] = useState("");
  const [choisie, setChoisie] = useState<FicheCarte | null>(null);

  const fiches = useMemo(() => donnees?.fiches ?? [], [donnees]);
  const etoilees = useMemo(() => fiches
    .filter((f) => f.pivot_ingredient_id && f.lignes.some((l) => l.ingredient_id === f.pivot_ingredient_id))
    .sort((a, b) => titreFiche(a.nom).localeCompare(titreFiche(b.nom), "fr")), [fiches]);
  const sansEtoile = fiches.length - etoilees.length;
  const filtrees = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? etoilees.filter((f) => f.nom.toLowerCase().includes(t)) : etoilees;
  }, [etoilees, q]);

  const page: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 40px" : "12px 14px 32px" };

  if (choisie) {
    const { ficheProduction, famProduction, poidsCru, estPizza } = ficheVersProduction(choisie);
    return (
      <div style={page}>
        <ProduireFiche pleinePage fiche={ficheProduction} fam={famProduction} poidsCru={poidsCru} totalCost={choisie.total_cost ?? 0} voirMontants={voirMontants} estPizza={estPizza}
          habillage={{ couleur: couleurCategorie(choisie.categorie), clair: clairCategorie(choisie.categorie), categorie: LIBELLES_CATEGORIE[choisie.categorie] ?? choisie.categorie }}
          onFermer={() => { setChoisie(null); window.scrollTo(0, 0); }} />
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={h1(bureau)}>Produire</h1>
          <div style={{ color: MUTED, fontSize: 13 }}>Les recettes avec un ingrédient phare ★ : touche une recette pour la produire.</div>
        </div>
        {etoilees.length > 6 && (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une recette…" style={{ ...CHAMP, borderRadius: 20, width: bureau ? 280 : "100%", height: 44, fontSize: 16 }} />
        )}
      </div>

      {erreur && <div style={{ padding: 14, borderRadius: 12, background: "rgba(180,68,58,0.08)", color: "#b4443a", fontSize: 13 }}>{erreur}</div>}
      {!donnees && !erreur && <div style={{ padding: 30, textAlign: "center", color: MUTED }}>Chargement des recettes…</div>}
      {donnees && etoilees.length === 0 && (
        <EtatVide icone="liste" titre="Aucune recette étoilée" texte="Dans chaque fiche, touche l'étoile ☆ devant l'ingrédient phare, celui sur lequel on se cale pour produire, puis enregistre." />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {filtrees.map((f) => {
          const c = couleurCategorie(f.categorie);
          const phare = f.lignes.find((l) => l.ingredient_id === f.pivot_ingredient_id);
          const parts = Math.max(1, f.nb_parts);
          return (
            <button key={f.id} type="button" onClick={() => { setChoisie(f); window.scrollTo(0, 0); }}
              style={{ display: "grid", gridTemplateRows: "auto 1fr", padding: 0, border: `1px solid ${BORD}`, borderRadius: 16, background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit", overflow: "hidden", touchAction: "manipulation", minHeight: 150 }}>
              {/* Bandeau à la couleur de la catégorie, comme la fiche imprimable */}
              <span style={{ background: c, color: "#fff", padding: "12px 16px 10px", display: "grid", gap: 2 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, fontStyle: "italic", letterSpacing: ".06em", textTransform: "uppercase" }}>{LIBELLES_CATEGORIE[f.categorie] ?? f.categorie}</span>
                <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 24, lineHeight: 1.05, textTransform: "uppercase", overflowWrap: "anywhere" }}>{titreFiche(f.nom)}</span>
              </span>
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 16px" }}>
                <span style={{ fontSize: 14, color: MUTED, minWidth: 0 }}>
                  {phare && <b style={{ color: c, display: "block", fontSize: 15 }}>★ {nomLisible(phare.nom)}</b>}
                  {phare?.qty != null ? `${quantiteLisible(phare.qty, phare.unit ?? "g")} pour ${parts} ${parts > 1 ? "portions" : "portion"}` : ""}
                </span>
                <span style={{ flex: "0 0 auto", background: c, color: "#fff", fontWeight: 700, fontSize: 15, padding: "10px 16px", borderRadius: 12 }}>Produire</span>
              </span>
            </button>
          );
        })}
      </div>

      {donnees && sansEtoile > 0 && (
        <div style={{ fontSize: 12.5, color: MUTED, textAlign: "center", padding: "16px 8px 0" }}>
          {sansEtoile} recette{sansEtoile > 1 ? "s n'ont" : " n'a"} pas encore d&apos;ingrédient phare : l&apos;étoile ☆ se met dans la fiche.
        </div>
      )}
    </div>
  );
}

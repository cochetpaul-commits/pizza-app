"use client";

import React, { useMemo, useState } from "react";
import { VoletDroit } from "@/components/produits/BaseProduits";
import { EtatVide } from "@/components/ui/EtatVide";
import { BORD, CHAMP, MUTED, OSWALD } from "@/components/ui/charte";
import { useVoirMontants } from "@/lib/useVoirMontants";
import { ProduireFiche, quantiteLisible } from "@/components/fiche/ProduireFiche";
import { clairCategorie, couleurCategorie, LIBELLES_CATEGORIE, nomLisible, titreFiche } from "@/lib/ficheTechnique";
import type { FicheCarte } from "@/app/api/carte/route";
import { ficheVersProduction } from "./VueFiches";

/**
 * Produire (27/11/2026, demande de Paul, Piccola Mia d'abord) : depuis la page des fiches, la liste des recettes qui
 * ont un ingrédient phare (l'étoile) ; une touche ouvre la recette en mode production. Seulement les recettes
 * étoilées : on se force à mettre une étoile sur chaque recette. Aux couleurs des fiches imprimables. Rien n'est
 * enregistré. Ouvert à l'équipe ; les montants restent réservés aux responsables.
 */
export function ProduireListe({ fiches, onFermer }: { fiches: FicheCarte[]; onFermer: () => void }) {
  const voirMontants = useVoirMontants();
  const [q, setQ] = useState("");
  const [choisie, setChoisie] = useState<FicheCarte | null>(null);

  const etoilees = useMemo(() => fiches
    .filter((f) => f.pivot_ingredient_id && f.lignes.some((l) => l.ingredient_id === f.pivot_ingredient_id))
    .sort((a, b) => titreFiche(a.nom).localeCompare(titreFiche(b.nom), "fr")), [fiches]);
  const sansEtoile = fiches.length - etoilees.length;
  const filtrees = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? etoilees.filter((f) => f.nom.toLowerCase().includes(t)) : etoilees;
  }, [etoilees, q]);

  if (choisie) {
    const { ficheProduction, famProduction, poidsCru, estPizza } = ficheVersProduction(choisie);
    return (
      <ProduireFiche fiche={ficheProduction} fam={famProduction} poidsCru={poidsCru} totalCost={choisie.total_cost ?? 0} voirMontants={voirMontants} estPizza={estPizza}
        habillage={{ couleur: couleurCategorie(choisie.categorie), clair: clairCategorie(choisie.categorie), categorie: LIBELLES_CATEGORIE[choisie.categorie] ?? choisie.categorie }}
        onFermer={() => setChoisie(null)} />
    );
  }

  return (
    <VoletDroit titre="Produire" sousTitre="Les recettes avec un ingrédient phare ★ : touche une recette pour la produire." onFermer={onFermer} largeur={640}>
      <div style={{ display: "grid", gap: 10 }}>
        {etoilees.length > 6 && (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une recette…" style={{ ...CHAMP, borderRadius: 20, width: "100%" }} />
        )}
        {etoilees.length === 0 ? (
          <EtatVide icone="liste" titre="Aucune recette étoilée" texte="Dans chaque fiche, touche l'étoile ☆ devant l'ingrédient phare, celui sur lequel on se cale pour produire, puis enregistre." />
        ) : filtrees.map((f) => {
          const c = couleurCategorie(f.categorie);
          const phare = f.lignes.find((l) => l.ingredient_id === f.pivot_ingredient_id);
          const parts = Math.max(1, f.nb_parts);
          return (
            <button key={f.id} type="button" onClick={() => setChoisie(f)}
              style={{ display: "flex", alignItems: "stretch", padding: 0, border: `1px solid ${BORD}`, borderRadius: 14, background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit", overflow: "hidden", minHeight: 74 }}>
              <span style={{ width: 8, flex: "0 0 auto", background: c }} />
              <span style={{ flex: 1, minWidth: 0, padding: "12px 14px", display: "grid", gap: 3 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: c }}>{LIBELLES_CATEGORIE[f.categorie] ?? f.categorie}</span>
                <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 20, lineHeight: 1.1, textTransform: "uppercase", color: "#1a1a1a", overflowWrap: "anywhere" }}>{titreFiche(f.nom)}</span>
                {phare && (
                  <span style={{ fontSize: 13, color: MUTED }}>
                    <b style={{ color: c }}>★ {nomLisible(phare.nom)}</b>
                    {phare.qty != null ? ` · ${quantiteLisible(phare.qty, phare.unit ?? "g")} pour ${parts} ${parts > 1 ? "portions" : "portion"}` : ""}
                  </span>
                )}
              </span>
              <span style={{ display: "flex", alignItems: "center", padding: "0 16px", background: c, color: "#fff", fontWeight: 700, fontSize: 14, flex: "0 0 auto" }}>Produire</span>
            </button>
          );
        })}
        {sansEtoile > 0 && (
          <div style={{ fontSize: 12.5, color: MUTED, textAlign: "center", padding: "4px 8px" }}>
            {sansEtoile} recette{sansEtoile > 1 ? "s n'ont" : " n'a"} pas encore d&apos;ingrédient phare : l&apos;étoile ☆ se met dans la fiche.
          </div>
        )}
      </div>
    </VoletDroit>
  );
}

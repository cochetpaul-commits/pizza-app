"use client";

import Link from "next/link";
import { BON, ATTENTION, INFO, MAUVAIS, MUTED, BORD, INTERTITRE, TD, pastille } from "@/components/ui/charte";

/**
 * Ce que l'import d'une facture a changé, produit par produit (04/11/2026, demande de Paul) :
 * nouveaux produits, prix modifiés (ancien → nouveau), premiers prix, baisses à valider, fiches remises en service.
 * Un clic sur un produit ouvre sa fiche dans la Base produits.
 */
export type Changement = { type: "nouveau" | "prix" | "premier_prix" | "a_valider" | "reactive"; nom: string; ingredient_id?: string | null; ancien?: number | null; nouveau?: number | null; unite?: string | null };

const GROUPES: { type: Changement["type"]; titre: string; couleur: string; aide: string }[] = [
  { type: "nouveau", titre: "Nouveaux produits", couleur: INFO, aide: "Fiches créées par l'import, « à vérifier » dans la Base produits : catégorie, zone, conditionnement." },
  { type: "prix", titre: "Prix modifiés", couleur: ATTENTION, aide: "Le nouveau prix remplace l'ancien chez ce fournisseur ; l'ancien reste dans l'historique." },
  { type: "a_valider", titre: "Baisses à valider", couleur: MAUVAIS, aide: "Baisse de plus de 20 % : pas appliquée tant qu'elle n'est pas acceptée dans Achats › prix à valider (une promo ne remplace pas le prix habituel)." },
  { type: "premier_prix", titre: "Premier prix chez ce fournisseur", couleur: BON, aide: "Le produit n'avait pas encore de prix actif chez ce fournisseur." },
  { type: "reactive", titre: "Remis en service", couleur: BON, aide: "Fiches désactivées que la facture a réactivées." },
];

const prix = (n: number | null | undefined, u?: string | null) =>
  n == null ? "—" : `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })} €${u ? ` / ${u}` : ""}`;

export function ChangementsImport({ changements, dejaImportee }: { changements: Changement[]; dejaImportee?: boolean }) {
  if (!changements.length) {
    return (
      <div style={{ fontSize: 13, color: MUTED, marginTop: 12 }}>
        {dejaImportee ? "Facture déjà connue : aucun produit ni prix n'a changé." : "Aucun produit ni prix n'a changé : les prix de la facture étaient déjà à jour."}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 14, marginTop: 16, textAlign: "left" }}>
      {GROUPES.map((g) => {
        const liste = changements.filter((c) => c.type === g.type).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
        if (!liste.length) return null;
        return (
          <div key={g.type}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={INTERTITRE}>{g.titre}</span>
              <span style={pastille(g.couleur)}>{liste.length}</span>
            </div>
            <div style={{ border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <tbody>
                  {liste.map((c, i) => {
                    const ecart = c.ancien && c.nouveau ? (c.nouveau / c.ancien - 1) * 100 : null;
                    return (
                      <tr key={`${c.nom}-${i}`}>
                        <td style={{ ...TD, boxShadow: `inset 6px 0 0 ${g.couleur}`, fontWeight: 600 }}>
                          {c.ingredient_id
                            ? <Link href={`/ingredients?edit=${c.ingredient_id}`} style={{ color: "#1a1a1a", textDecoration: "none" }}>{c.nom}</Link>
                            : c.nom}
                        </td>
                        <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                          {c.type === "prix" || c.type === "a_valider"
                            ? <><span style={{ color: MUTED }}>{prix(c.ancien, c.unite)}</span> → <b>{prix(c.nouveau, c.unite)}</b></>
                            : c.type === "premier_prix" ? <b>{prix(c.nouveau, c.unite)}</b> : null}
                        </td>
                        <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", width: 70 }}>
                          {ecart != null && (
                            <span style={{ fontWeight: 700, color: ecart > 0 ? MAUVAIS : BON }}>{ecart > 0 ? "+" : ""}{Math.round(ecart * 10) / 10} %</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>{g.aide}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Résumé court pour l'import par lots */
export function resumeChangements(c: Changement[]): string {
  const n = (t: Changement["type"]) => c.filter((x) => x.type === t).length;
  const parts = [
    n("nouveau") && `${n("nouveau")} nouveau${n("nouveau") > 1 ? "x" : ""}`,
    n("prix") && `${n("prix")} prix modifié${n("prix") > 1 ? "s" : ""}`,
    n("a_valider") && `${n("a_valider")} à valider`,
    n("premier_prix") && `${n("premier_prix")} premier${n("premier_prix") > 1 ? "s" : ""} prix`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "aucun changement de prix";
}

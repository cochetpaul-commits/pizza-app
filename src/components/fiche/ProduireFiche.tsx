"use client";

import { useMemo, useState } from "react";
import { VoletDroit } from "@/components/produits/BaseProduits";
import { openApiFile } from "@/lib/fetchApi";
import { BON, BORD, CADRE, INTERTITRE, MUTED, OSWALD, filtre } from "@/components/ui/charte";
import type { Famille, FicheState, LigneIngredient } from "./ficheTypes";

/**
 * Produire (05/11/2026, demande de Paul) : la fiche est écrite pour N portions ; ici on la met à l'échelle
 * pour un autre nombre de portions, un poids de préparation (sauces, pestos, en kilos ou litres), ou une quantité
 * de l'ingrédient phare (l'étoile de la liste). Tout se recalcule, les étapes restent, et on imprime au bon format.
 * Rien n'est modifié sur la fiche.
 */
type Mode = "portions" | "poids" | "phare";

const nombre = (n: number, dec = 0) => n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: dec });
export function quantiteLisible(q: number, unite: string): string {
  const u = unite.toLowerCase();
  if (u === "g") return q >= 1000 ? `${nombre(q / 1000, 2)} kg` : `${nombre(Math.round(q))} g`;
  if (u === "kg") return `${nombre(q, 2)} kg`;
  if (u === "cl") return q >= 100 ? `${nombre(q / 100, 2)} L` : `${nombre(q, 1)} cl`;
  if (u === "ml") return q >= 1000 ? `${nombre(q / 1000, 2)} L` : `${nombre(Math.round(q))} ml`;
  if (u === "l") return `${nombre(q, 2)} L`;
  return `${nombre(q, 1)} ${unite}`;
}
const nomLigne = (l: LigneIngredient) => l.ingredient?.nom_court || l.ingredient?.nom_produit || "Ingrédient";

export function ProduireFiche({ fiche, fam, poidsCru, totalCost, voirMontants, estPizza, onFermer }: {
  fiche: FicheState; fam: Famille; poidsCru: number; totalCost: number; voirMontants: boolean; estPizza: boolean; onFermer: () => void;
}) {
  const lignes = useMemo(() => fiche.lignes.filter((l) => l.ingredient_id && l.quantite > 0), [fiche.lignes]);
  const phare = useMemo(() => (fiche.pivot_ingredient_id ? lignes.find((l) => l.ingredient_id === fiche.pivot_ingredient_id) ?? null : null), [lignes, fiche.pivot_ingredient_id]);
  const base = Math.max(1, fiche.portions);
  const [mode, setMode] = useState<Mode>(phare ? "phare" : "portions");
  const [portions, setPortions] = useState<string>(String(base));
  const [poidsKg, setPoidsKg] = useState<string>(poidsCru > 0 ? (poidsCru / 1000).toFixed(2).replace(".", ",") : "1");
  const [qtePhare, setQtePhare] = useState<string>(phare ? String(phare.quantite) : "");
  const num = (s: string) => { const n = Number(s.replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };

  const facteur = mode === "portions"
    ? (num(portions) ?? base) / base
    : mode === "poids"
      ? (poidsCru > 0 && num(poidsKg) ? (num(poidsKg) as number) * 1000 / poidsCru : 1)
      : phare && num(qtePhare) ? (num(qtePhare) as number) / phare.quantite : 1;
  const portionsFinales = base * facteur;
  const etiquette = (n: number) => (Math.abs(n - 1) < 0.001 ? fam.portions_label : fam.portions_label_pluriel);

  const champ = (v: string, set: (s: string) => void, unite: string, pas: number) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button type="button" onClick={() => set(String(Math.max(pas, (num(v) ?? 0) - pas)))} style={{ ...BOUTON, width: 40 }}>−</button>
      <input value={v} onChange={(e) => set(e.target.value)} inputMode="decimal" onFocus={(e) => e.target.select()} aria-label="Quantité à produire"
        style={{ width: 96, textAlign: "center", fontFamily: OSWALD, fontWeight: 700, fontSize: 30, border: "none", borderBottom: `1px solid ${BORD}`, outline: "none", background: "transparent", fontVariantNumeric: "tabular-nums" }} />
      <button type="button" onClick={() => set(String((num(v) ?? 0) + pas))} style={{ ...BOUTON, width: 40 }}>+</button>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{unite}</span>
    </span>
  );
  const raccourcis = (valeurs: number[], set: (s: string) => void, courant: number | null) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {valeurs.map((v) => <button key={v} type="button" onClick={() => set(String(v))} style={filtre(courant === v)}>{v}</button>)}
    </div>
  );

  return (
    <VoletDroit titre={`Produire · ${fiche.nom || "fiche"}`} sousTitre={`La fiche est écrite pour ${base} ${etiquette(base)}${poidsCru > 0 ? ` · ${quantiteLisible(poidsCru, "g")} cru` : ""}`} onFermer={onFermer} largeur={600}
      pied={<div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={onFermer} style={BOUTON}>Fermer</button>
        {fiche.id && <button type="button" onClick={() => openApiFile(`/api/recettes/pdf?id=${fiche.id}&facteur=${facteur.toFixed(4)}`)} style={{ ...BOUTON, background: "#1a1a1a", color: "#f2ede4", border: "none" }}>Imprimer pour {nombre(portionsFinales, 1)} {etiquette(portionsFinales)}</button>}
      </div>}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setMode("portions")} style={filtre(mode === "portions")}>Par {fam.portions_label}</button>
          {poidsCru > 0 && <button type="button" onClick={() => setMode("poids")} style={filtre(mode === "poids")}>Par poids</button>}
          <button type="button" onClick={() => setMode("phare")} style={filtre(mode === "phare")} disabled={!phare} title={phare ? undefined : "Choisis d'abord un ingrédient phare avec l'étoile ☆ dans la liste"}>★ Ingrédient phare</button>
        </div>

        <div style={{ ...CADRE, padding: 16, display: "grid", gap: 10, justifyItems: "center" }}>
          {mode === "portions" && (
            <>
              <span style={INTERTITRE}>Je veux faire</span>
              {champ(portions, setPortions, etiquette(num(portions) ?? 0), 1)}
              {raccourcis([6, 10, 12, 20, 30, 40, 50, 100], setPortions, num(portions))}
            </>
          )}
          {mode === "poids" && (
            <>
              <span style={INTERTITRE}>Je veux produire</span>
              {champ(poidsKg, setPoidsKg, "kg", 0.5)}
              {raccourcis([1, 2, 3, 5, 10], setPoidsKg, num(poidsKg))}
              <span style={{ fontSize: 12.5, color: MUTED, textAlign: "center" }}>Poids cru, somme des ingrédients. Pour une sauce liquide, 1 L ≈ 1 kg.</span>
            </>
          )}
          {mode === "phare" && (phare ? (
            <>
              <span style={INTERTITRE}>★ {nomLigne(phare)} · j&apos;en ai</span>
              {champ(qtePhare, setQtePhare, phare.unite, phare.unite.toLowerCase() === "g" ? 100 : phare.unite.toLowerCase() === "cl" ? 10 : 1)}
              <span style={{ fontSize: 12.5, color: MUTED, textAlign: "center" }}>La fiche en prévoit {quantiteLisible(phare.quantite, phare.unite)} pour {base} {etiquette(base)}. Le reste suit en proportion.</span>
            </>
          ) : (
            <span style={{ fontSize: 13.5, color: MUTED, textAlign: "center" }}>Aucun ingrédient phare : touche l&apos;étoile ☆ devant un ingrédient de la liste, puis enregistre la fiche.</span>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13.5 }}>
          <span>Soit <b style={{ fontFamily: OSWALD, fontSize: 18 }}>{nombre(portionsFinales, 1)}</b> {etiquette(portionsFinales)} · × {nombre(facteur, 2)}</span>
          <span style={{ color: MUTED }}>{poidsCru > 0 ? `${quantiteLisible(poidsCru * facteur, "g")} cru` : ""}{voirMontants && totalCost > 0 ? ` · ${nombre(totalCost * facteur, 2)} € matière` : ""}</span>
        </div>

        <div>
          <span style={INTERTITRE}>Pesées</span>
          <div style={{ ...CADRE, padding: 4, marginTop: 6 }}>
            {estPizza && fiche.paton_poids > 0 && (
              <Ligne nom="Pâton" base={`${base} × ${fiche.paton_poids} g`} valeur={quantiteLisible(fiche.paton_poids * portionsFinales, "g")} />
            )}
            {lignes.map((l) => (
              <Ligne key={l.key} nom={`${l.ingredient_id === fiche.pivot_ingredient_id ? "★ " : ""}${nomLigne(l)}`} base={quantiteLisible(l.quantite, l.unite)} valeur={quantiteLisible(l.quantite * facteur, l.unite)} fort={l.ingredient_id === fiche.pivot_ingredient_id} />
            ))}
            {lignes.length === 0 && <div style={{ padding: 12, fontSize: 13, color: MUTED }}>Aucun ingrédient avec une quantité.</div>}
          </div>
        </div>

        {fiche.etapes.filter(Boolean).length > 0 && (
          <div>
            <span style={INTERTITRE}>Étapes</span>
            <ol style={{ margin: "6px 0 0", paddingLeft: 20, display: "grid", gap: 6, fontSize: 14 }}>
              {fiche.etapes.filter(Boolean).map((e, i) => <li key={i}>{e}</li>)}
            </ol>
          </div>
        )}
      </div>
    </VoletDroit>
  );
}

const BOUTON: React.CSSProperties = { height: 40, padding: "0 14px", borderRadius: 12, border: `1px solid ${BORD}`, background: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a" };

function Ligne({ nom, base, valeur, fort }: { nom: string; base: string; valeur: string; fort?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "baseline", padding: "9px 12px", borderBottom: "1px solid #f3efe7", background: fort ? `${BON}12` : undefined, borderRadius: 8 }}>
      <span style={{ fontSize: 15, fontWeight: fort ? 700 : 600 }}>{nom}</span>
      <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>{base}</span>
      <b style={{ fontFamily: OSWALD, fontSize: 24, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", minWidth: 90, textAlign: "right" }}>{valeur}</b>
    </div>
  );
}

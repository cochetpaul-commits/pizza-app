/**
 * Prix des ingrédients pour les fiches (sorti de FicheWizard le 25/11/2026) : la fiche ouverte et le
 * recalcul en masse des coûts utilisent exactement la même règle.
 * Ordre : dernière offre fournisseur, puis prix d'achat saisi, puis cost_per_unit ; conversions densité,
 * poids pièce et volume pièce ; unité de base (g, cl ou pièce) choisie d'après le prix disponible.
 */
import { offerRowToCpu, enrichCpuWithConversions, type CpuByUnit } from "@/lib/offerPricing";
import type { LatestOffer } from "@/types/ingredients";
import type { IngredientRef } from "@/components/fiche/ficheTypes";

const UNITES_PIECE = ["piece", "pièce", "unite", "unité", "pc", "pcs", "tasse", "bouteille"];
export const estParPiece = (label: unknown) => UNITES_PIECE.includes(String(label ?? "").toLowerCase().trim());

export function construireMercuriale(ingList: Record<string, unknown>[], offerRows: Record<string, unknown>[]): {
  cpuMap: Record<string, CpuByUnit>;
  offerByIng: Record<string, LatestOffer>;
  mercs: IngredientRef[];
} {
  // Build CPU map from supplier offers
  const cpuMap: Record<string, CpuByUnit> = {};
  const offerByIng: Record<string, LatestOffer> = {};
  for (const o of offerRows) {
    const iid = String(o.ingredient_id ?? "");
    if (!iid) continue;
    cpuMap[iid] = offerRowToCpu(o);
    offerByIng[iid] = o as unknown as LatestOffer;
  }

  // Build mercuriale from ingredients + offers
  // Enrich CPU with ingredient meta (density, piece weight)
  for (const i of ingList) {
    const id = i.id as string;
    // Fallback: purchase_price
    const cpuOffre = cpuMap[id];
    if (!cpuOffre || (!cpuOffre.g && !cpuOffre.ml && !cpuOffre.pcs)) {
      const pp = Number(i.purchase_price) || 0;
      const pu = Number(i.purchase_unit) || 1;
      const pul = String(i.purchase_unit_label ?? "").toLowerCase().trim();
      if (pp > 0 && pu > 0) {
        const perUnit = pp / pu;
        if (pul === "kg") cpuMap[id] = { g: perUnit / 1000 };
        else if (pul === "g") cpuMap[id] = { g: perUnit };
        else if (pul === "l" || pul === "litre") cpuMap[id] = { ml: perUnit / 1000 };
        else if (pul === "cl") cpuMap[id] = { ml: perUnit / 10 };
        else if (pul === "ml") cpuMap[id] = { ml: perUnit };
        else if (estParPiece(pul)) cpuMap[id] = { pcs: perUnit };
        else cpuMap[id] = { g: perUnit / 1000 }; // default: treat as kg
      }
    }
    // Fallback: cost_per_unit (generated column, €/g)
    if (!cpuMap[id] || (!cpuMap[id].g && !cpuMap[id].ml && !cpuMap[id].pcs)) {
      const costPU = Number(i.cost_per_unit) || 0;
      if (costPU > 0) cpuMap[id] = { g: costPU };
    }
    // Conversions (densité, poids pièce), aussi sur le prix d'achat de repli : une recette maison
    // au kilo avec un poids par portion se compte alors à la pièce (1 tasse = 14 g de café)
    let cpu = cpuMap[id];
    if (cpu) {
      cpu = enrichCpuWithConversions({
        piece_weight_g: (i.piece_weight_g as number) ?? null,
        density_kg_per_l: (i.density_g_per_ml as number) ?? null,
      }, cpu);
      // Derive ml from pcs + piece_volume_ml (e.g. bottle 750ml at 3.73€ → 0.00497 €/ml)
      const pvml = Number(i.piece_volume_ml) || 0;
      if (pvml > 0 && cpu.pcs != null && cpu.pcs > 0 && (cpu.ml == null || cpu.ml <= 0)) {
        cpu = { ...cpu, ml: cpu.pcs / pvml };
      }
      cpuMap[id] = cpu;
    }
  }

  const mercs: IngredientRef[] = ingList.map((i) => {
    const id = i.id as string;
    let allergens: string[] = [];
    try { allergens = typeof i.allergens === "string" ? JSON.parse(i.allergens as string) : ((i.allergens as string[]) ?? []); } catch { /* */ }
    const cpu = cpuMap[id] ?? {};
    // Determine base unit from best available price
    let base: "g" | "cl" | "pc" = "g";
    let prixBase = cpu.g ?? 0;
    if (cpu.ml != null && cpu.ml > 0 && (!cpu.g || cpu.g <= 0)) { base = "cl"; prixBase = cpu.ml * 10; } // €/ml → €/cl
    else if (cpu.pcs != null && cpu.pcs > 0 && (!cpu.g || cpu.g <= 0) && (!cpu.ml || cpu.ml <= 0)) { base = "pc"; prixBase = cpu.pcs; }
    // Override with density detection from category
    const cat = String(i.category ?? "");
    if (["vins", "spiritueux", "biere", "soft", "liqueurs", "sirops"].includes(cat) && cpu.ml != null && cpu.ml > 0) {
      base = "cl"; prixBase = cpu.ml * 10;
    }
    if (i.source === "recette_maison" && estParPiece(i.purchase_unit_label) && cpu.pcs != null && cpu.pcs > 0) {
      base = "pc"; prixBase = cpu.pcs;
    }
    return {
      id,
      nom_court: (i.name as string).replace(/\s+\d+[.,/]?\d*\s*(KG|G|GR|CL|ML|L|PCS|PIECES?|UNITE?S?|X)\b/gi, "").replace(/\s*~+\s*$/g, "").trim(),
      nom_produit: i.name as string,
      prix_base: prixBase,
      unite_base: base,
      allergenes: allergens,
      cpu,
      source: (i.source as string) ?? null,
    };
  });
  return { cpuMap, offerByIng, mercs };
}

import type { Ingredient, LatestOffer } from "@/types/ingredients";
import { n2, fmtMoney } from "@/lib/offers";

type IngredientPriceFields = Pick<
  Ingredient,
  "piece_weight_g" | "piece_volume_ml" | "cost_per_kg" | "cost_per_unit" | "purchase_price" | "purchase_unit_label"
>;

/** Returns a short unit label: "btl" for bouteille, "sac" for sachet, etc. */
function unitLabel(ingredient?: { purchase_unit_label?: string | null } | null): string {
  const l = (ingredient?.purchase_unit_label ?? "").toLowerCase();
  if (l.includes("bouteille") || l === "btl" || l === "bt") return "btl";
  if (l.includes("carton")) return "crt";
  if (l.includes("sachet")) return "sac";
  if (l.includes("barquette")) return "barq";
  if (l.includes("boite") || l.includes("boîte")) return "bte";
  if (l.includes("bidon")) return "bid";
  if (l.includes("pot")) return "pot";
  if (l.includes("fut") || l.includes("fût")) return "fût";
  if (l.includes("bac")) return "bac";
  if (l) return l.slice(0, 4);
  return "pc";
}

/** Format volume/weight info: "75cl", "1kg", "500g", etc. */
function fmtContent(volMl: number | null | undefined, weightG: number | null | undefined): string {
  if (volMl != null && volMl > 0) {
    if (volMl >= 1000) return `${n2(volMl / 1000)}L`;
    return `${Math.round(volMl)}cl`;
  }
  if (weightG != null && weightG > 0) {
    if (weightG >= 1000) return `${n2(weightG / 1000)}kg`;
    return `${Math.round(weightG)}g`;
  }
  return "";
}

function fromOffer(ingredient: Pick<Ingredient, "piece_volume_ml" | "purchase_unit_label">, o: LatestOffer): string | null {
  const pk = o.price_kind;
  const ul = unitLabel(ingredient);
  const content = fmtContent(ingredient.piece_volume_ml, o.piece_weight_g);

  if (pk === "unit") {
    if (!o.unit || o.unit_price == null || !(o.unit_price > 0)) return null;
    if (o.unit === "kg") return `${fmtMoney(o.unit_price)} €/kg`;
    if (o.unit === "l") return `${fmtMoney(o.unit_price)} €/L`;
    if (o.unit === "pc") {
      // Show price per purchase unit + content info (e.g. "1,50 € btl 75cl")
      return `${fmtMoney(o.unit_price)} € ${ul}${content ? ` ${content}` : ""}`;
    }
    return null;
  }

  if (pk === "pack_simple") {
    if (o.pack_price == null || !o.pack_total_qty || !o.pack_unit) return null;
    const per = o.pack_price / o.pack_total_qty;
    const baseUnit = o.pack_unit === "kg" ? "kg" : "L";
    return `${fmtMoney(per)} €/${baseUnit}`;
  }

  if (pk === "pack_composed") {
    if (o.pack_price == null || !o.pack_count || !o.pack_each_unit) return null;
    if (o.pack_each_unit === "pc") {
      const perPc = o.pack_price / o.pack_count;
      return `${fmtMoney(perPc)} € ${ul}${content ? ` ${content}` : ""}`;
    }
    if (!o.pack_each_qty || o.pack_each_qty <= 0) return null;
    const per = o.pack_price / (o.pack_count * o.pack_each_qty);
    return `${fmtMoney(per)} €/${o.pack_each_unit === "kg" ? "kg" : "L"}`;
  }

  return null;
}

function fromLegacy(x: IngredientPriceFields): string {
  const cpk = x.cost_per_kg;
  if (cpk != null && Number.isFinite(cpk) && cpk > 0) return `${fmtMoney(cpk)} €/kg`;

  const cpu = x.cost_per_unit;
  const lbl = (x.purchase_unit_label ?? "").toLowerCase().trim();

  const content = fmtContent(x.piece_volume_ml, x.piece_weight_g);

  if (cpu != null && Number.isFinite(cpu) && cpu > 0) {
    if (lbl === "kg") return `${fmtMoney(cpu)} €/kg`;
    if (lbl === "l") return `${fmtMoney(cpu)} €/L`;
    if (lbl === "g") return `${fmtMoney(cpu * 1000)} €/kg`;
    if (lbl === "ml") return `${fmtMoney(cpu * 1000)} €/L`;
    if (lbl === "pc") {
      if (x.purchase_price != null) {
        const ul = unitLabel(x);
        return `${fmtMoney(x.purchase_price)} € ${ul}${content ? ` ${content}` : ""}`;
      }
    }
  }

  // Fallback : purchase_price directement (quand cost_per_unit GENERATED est null)
  const pp = x.purchase_price;
  if (pp != null && Number.isFinite(pp) && pp > 0) {
    if (lbl === "kg") return `${fmtMoney(pp)} €/kg`;
    if (lbl === "l") return `${fmtMoney(pp)} €/L`;
    if (lbl === "g") return `${fmtMoney(pp * 1000)} €/kg`;
    if (lbl === "ml") return `${fmtMoney(pp * 1000)} €/L`;
    if (lbl === "pc") {
      const ul = unitLabel(x);
      return `${fmtMoney(pp)} € ${ul}${content ? ` ${content}` : ""}`;
    }
    // Label inconnu — affiche en €/kg par defaut
    return `${fmtMoney(pp)} €/kg`;
  }

  return "Prix ND";
}

/**
 * Returns a single-line price string: "9,30 €/kg", "2,50 €/pc", "Prix ND", etc.
 * Prefers offer data, falls back to legacy ingredient price.
 */
export function formatIngredientPrice(
  ingredient: IngredientPriceFields,
  offer: LatestOffer | null | undefined
): string {
  if (offer) {
    const s = fromOffer(ingredient, offer);
    if (s) return s;
  }
  return fromLegacy(ingredient);
}

/**
 * Compute a price label from simplified CPU data (used in recipe forms).
 * cpu: { g: €/g, ml: €/ml, pcs: €/pcs }  meta: { piece_weight_g }
 * Returns "SUPPLIER · 9,30 €/kg" or "Prix ND".
 */
export function formatCpuLabel(
  cpu: { g?: number; ml?: number; pcs?: number },
  meta: { density_kg_per_l?: number | null; piece_weight_g?: number | null },
  pieceVolumeMl: number | null | undefined,
  supplierName: string | null
): string {
  let priceStr: string;
  if (cpu.g && cpu.g > 0) {
    priceStr = `${fmtMoney(cpu.g * 1000)} €/kg`;
  } else if (cpu.ml && cpu.ml > 0) {
    priceStr = `${fmtMoney(cpu.ml * 1000)} €/L`;
  } else if (cpu.pcs && cpu.pcs > 0) {
    const pw = meta.piece_weight_g;
    const vol = pieceVolumeMl;
    if (pw && pw > 0) {
      priceStr = `${fmtMoney((cpu.pcs / pw) * 1000)} €/kg`;
    } else if (vol && vol > 0) {
      const eurL = (cpu.pcs / vol) * 1000;
      priceStr = `${fmtMoney(eurL)} €/L`;
    } else {
      priceStr = `${fmtMoney(cpu.pcs)} €/pc`;
    }
  } else {
    return "Prix ND";
  }
  return supplierName ? `${supplierName} · ${priceStr}` : priceStr;
}

/**
 * Returns "SUPPLIER · 9,30 €/kg" for SmartSelect or compact display.
 * Omits supplier prefix if supplierName is null/empty.
 */
export function formatIngredientPriceLine(
  ingredient: IngredientPriceFields,
  offer: LatestOffer | null | undefined,
  supplierName?: string | null
): string {
  const price = formatIngredientPrice(ingredient, offer);
  if (!supplierName || price === "Prix ND") return price;
  return `${supplierName} · ${price}`;
}

/** Prix ramené au kg ou au litre, si calculable et pas déjà exprimé ainsi. */
function derivePerKgOrL(
  ingredient: IngredientPriceFields,
  offer: LatestOffer | null | undefined
): string | null {
  // Prix unitaire à la pièce + poids/volume connu → €/kg ou €/L
  const pcPrice =
    offer?.price_kind === "unit" && offer.unit === "pc" && offer.unit_price != null
      ? offer.unit_price
      : (ingredient.purchase_unit_label ?? "").toLowerCase() === "pc" && ingredient.purchase_price != null
        ? ingredient.purchase_price
        : null;
  if (pcPrice == null || !(pcPrice > 0)) return null;
  const w = offer?.piece_weight_g ?? ingredient.piece_weight_g;
  if (w && w > 0) return `${fmtMoney((pcPrice / w) * 1000)} €/kg`;
  const v = ingredient.piece_volume_ml;
  if (v && v > 0) return `${fmtMoney((pcPrice / v) * 1000)} €/L`;
  return null;
}

/**
 * Paramètres produit pour les recettes (charte affichage produit),
 * en morceaux séparés pour l'affichage en pastilles :
 * - prix : prix d'achat + contenu ("1,89 € pc 400g")
 * - perKg : équivalent au kilo/litre si calculable ("4,73 €/kg")
 * - cond : conditionnement ("crt 12 × 1 pc")
 */
export function recipeParamsParts(
  ingredient: IngredientPriceFields,
  offer: LatestOffer | null | undefined
): { prix: string | null; perKg: string | null; cond: string | null } {
  const achat = formatIngredientPrice(ingredient, offer);
  const prix = achat !== "Prix ND" ? achat : null;
  const perKg = prix && !/€\/(kg|L)/.test(prix) ? derivePerKgOrL(ingredient, offer) : null;
  let cond: string | null = null;
  if (offer?.pack_count && offer.pack_count > 0) {
    const eachQty = offer.pack_each_qty ?? 1;
    const eachUnit = offer.pack_each_unit ?? "pc";
    cond = `crt ${offer.pack_count} × ${n2(eachQty)} ${eachUnit}`;
  }
  return { prix, perKg, cond };
}

/**
 * Ligne de paramètres produit pour les recettes :
 * "prix d'achat · contenu · prix/kg · conditionnement"
 */
export function formatRecipeParamsLine(
  ingredient: IngredientPriceFields,
  offer: LatestOffer | null | undefined
): string {
  const p = recipeParamsParts(ingredient, offer);
  const parts = [p.prix, p.perKg, p.cond].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : "Prix ND";
}

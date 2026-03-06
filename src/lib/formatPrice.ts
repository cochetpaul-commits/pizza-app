import type { Ingredient, LatestOffer } from "@/types/ingredients";
import { n2, fmtMoney } from "@/lib/offers";

type IngredientPriceFields = Pick<
  Ingredient,
  "piece_weight_g" | "piece_volume_ml" | "cost_per_kg" | "cost_per_unit" | "purchase_price" | "purchase_unit_label"
>;

function fromOffer(ingredient: Pick<Ingredient, "piece_volume_ml">, o: LatestOffer): string | null {
  const pk = o.price_kind;

  if (pk === "unit") {
    if (!o.unit || o.unit_price == null || !(o.unit_price > 0)) return null;
    if (o.unit === "kg") return `${fmtMoney(o.unit_price)} €/kg`;
    if (o.unit === "l") return `${fmtMoney(o.unit_price)} €/L`;
    if (o.unit === "pc") {
      const pw = n2(o.piece_weight_g);
      if (pw > 0) return `${fmtMoney((o.unit_price / pw) * 1000)} €/kg`;
      const volMl = ingredient.piece_volume_ml;
      if (volMl != null && volMl > 0) {
        const eurL = (o.unit_price / volMl) * 1000;
        const eurCl = (o.unit_price / volMl) * 10;
        return `${fmtMoney(o.unit_price)} €/pc · ${fmtMoney(eurL)} €/L · ${fmtMoney(eurCl)} €/cl`;
      }
      return `${fmtMoney(o.unit_price)} €/pc`;
    }
    return null;
  }

  if (pk === "pack_simple") {
    if (o.pack_price == null || !o.pack_total_qty || !o.pack_unit) return null;
    const per = o.pack_price / o.pack_total_qty;
    return `${fmtMoney(per)} €/${o.pack_unit === "kg" ? "kg" : "L"}`;
  }

  if (pk === "pack_composed") {
    if (o.pack_price == null || !o.pack_count || !o.pack_each_unit) return null;
    if (o.pack_each_unit === "pc") {
      const pw = n2(o.piece_weight_g);
      if (pw <= 0) return null;
      return `${fmtMoney(((o.pack_price / o.pack_count) / pw) * 1000)} €/kg`;
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

  if (cpu != null && Number.isFinite(cpu) && cpu > 0) {
    if (lbl === "g") return `${fmtMoney(cpu * 1000)} €/kg`;
    if (lbl === "ml") return `${fmtMoney(cpu * 1000)} €/L`;
    if (lbl === "pc") {
      const pw = n2(x.piece_weight_g);
      if (pw > 0 && x.purchase_price != null) return `${fmtMoney((x.purchase_price / pw) * 1000)} €/kg`;
      const volMl = x.piece_volume_ml;
      if (volMl != null && volMl > 0 && x.purchase_price != null) {
        const eurL = (x.purchase_price / volMl) * 1000;
        const eurCl = (x.purchase_price / volMl) * 10;
        return `${fmtMoney(x.purchase_price)} €/pc · ${fmtMoney(eurL)} €/L · ${fmtMoney(eurCl)} €/cl`;
      }
      if (x.purchase_price != null) return `${fmtMoney(x.purchase_price)} €/pc`;
    }
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
      const eurCl = (cpu.pcs / vol) * 10;
      priceStr = `${fmtMoney(eurL)} €/L · ${fmtMoney(eurCl)} €/cl`;
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

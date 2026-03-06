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
        if (volMl >= 1000) return `${fmtMoney((o.unit_price / volMl) * 1000)} €/L`;
        return `${fmtMoney(o.unit_price)} €/pc · ${fmtMoney((o.unit_price / volMl) * 10)} €/cl`;
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
        if (volMl >= 1000) return `${fmtMoney((x.purchase_price / volMl) * 1000)} €/L`;
        return `${fmtMoney(x.purchase_price)} €/pc · ${fmtMoney((x.purchase_price / volMl) * 10)} €/cl`;
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

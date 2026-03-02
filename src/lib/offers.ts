import type { Ingredient, LatestOffer } from "@/types/ingredients";

export function normalizeSupplierId(x: string): string | null {
  const v = (x ?? "").trim();
  return v ? v : null;
}

export function parseNum(x: string): number | null {
  if (x == null) return null;
  const s = String(x).trim().replace(/\s+/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function n2(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export function fmtQty(x: number): string {
  const s = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(x); return s.replace(",", ".");
}

export function fmtMoney(x: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(x);
}

export function fmtLegacyPriceLine(x: Ingredient): { main: string; sub: string } {
  const cpk = x.cost_per_kg;
  if (cpk != null && Number.isFinite(cpk)) {
    const w = n2(x.piece_weight_g);
    const base = x.purchase_price != null ? `base: ${fmtMoney(x.purchase_price)} €/pc` : "base: —";
    if (w > 0 && x.purchase_price != null) {
      return { main: `${fmtMoney(cpk)} € /kg`, sub: `${base} • ${fmtQty(w)} g/pc` };
    }
    return { main: `${fmtMoney(cpk)} € /kg`, sub: base };
  }

  const cpu = x.cost_per_unit;
  const lbl = (x.purchase_unit_label ?? "").toLowerCase().trim();

  if (cpu != null && Number.isFinite(cpu)) {
    if (lbl === "g") {
      const perKg = cpu * 1000;
      return {
        main: `${fmtMoney(perKg)} € /kg`,
        sub: x.purchase_price != null ? `base: ${fmtMoney(x.purchase_price)} €` : "—",
      };
    }
    if (lbl === "ml") {
      const perL = cpu * 1000;
      return {
        main: `${fmtMoney(perL)} € /L`,
        sub: x.purchase_price != null ? `base: ${fmtMoney(x.purchase_price)} €` : "—",
      };
    }
    if (lbl === "pc") {
      const main = x.purchase_price != null ? `${fmtMoney(x.purchase_price)} €/pc` : `${fmtMoney(cpu)} €/pc`;
      const w = n2(x.piece_weight_g);
      if (w > 0 && x.purchase_price != null) {
        const eurPerKg = (x.purchase_price / w) * 1000;
        return { main, sub: `≈ ${fmtMoney(eurPerKg)} €/kg • ${fmtQty(w)} g/pc` };
      }
      const volMl = x.piece_volume_ml;
      if (volMl != null && volMl > 0 && x.purchase_price != null) {
        if (volMl >= 1000) {
          const eurPerL = (x.purchase_price / volMl) * 1000;
          return { main: `${fmtMoney(eurPerL)} € /L`, sub: `${main} · ${fmtVolume(volMl)}/pc` };
        } else {
          const eurPerCl = (x.purchase_price / volMl) * 10;
          return { main, sub: `${fmtMoney(eurPerCl)} €/cl · ${fmtVolume(volMl)}/pc` };
        }
      }
      return { main, sub: "offre fournisseur" };
    }
  }

  return { main: "—", sub: "prix non renseigné" };
}

/**
 * Formate un volume en ml :
 *   ≥ 1000 ml → L   ex: 1500 → "1,5 L"
 *   100–999ml → cl  ex: 700  → "70 cl"
 *   < 100 ml  → ml  ex: 50   → "50 ml"
 */
export function fmtVolume(ml: number): string {
  if (ml >= 1000) return `${fmtQty(ml / 1000)} L`;
  if (ml >= 100) return `${fmtQty(ml / 10)} cl`;
  return `${fmtQty(ml)} ml`;
}

export function fmtOfferPriceLine(
  o: LatestOffer,
  extras?: { piece_volume_ml?: number | null }
): { main: string; sub: string } {
  const pk = o.price_kind;

  if (pk === "unit") {
    if (o.unit === "kg" && o.unit_price != null) return { main: `${fmtMoney(o.unit_price)} € /kg`, sub: "offre fournisseur" };

    if (o.unit === "l" && o.unit_price != null) {
      const d = o.density_kg_per_l != null ? ` • densité: ${fmtQty(o.density_kg_per_l)} kg/L` : "";
      return { main: `${fmtMoney(o.unit_price)} € /L`, sub: `offre fournisseur${d}` };
    }

    if (o.unit === "pc" && o.unit_price != null) {
      const pw = n2(o.piece_weight_g);
      if (pw > 0) {
        // Produit pesé (ex: coquillettes 500g) → afficher €/kg
        const eurPerKg = (o.unit_price / pw) * 1000;
        return { main: `${fmtMoney(eurPerKg)} € /kg`, sub: `offre: ${fmtMoney(o.unit_price)} €/pc • ${fmtQty(pw)} g/pc` };
      }

      const volMl = extras?.piece_volume_ml ?? null;
      if (volMl != null && volMl > 0) {
        // Bouteille / contenant : afficher €/pc + €/cl (ou €/L si >= 1L)
        if (volMl >= 1000) {
          // Ex: huile 1L → main = €/L, sub = €/pc
          const eurPerL = (o.unit_price / volMl) * 1000;
          return {
            main: `${fmtMoney(eurPerL)} € /L`,
            sub: `${fmtMoney(o.unit_price)} €/pc · ${fmtVolume(volMl)}/pc`,
          };
        } else {
          // Ex: amaretto 70cl → main = €/pc, sub = €/cl
          const eurPerCl = (o.unit_price / volMl) * 10;
          return {
            main: `${fmtMoney(o.unit_price)} €/pc`,
            sub: `${fmtMoney(eurPerCl)} €/cl · ${fmtVolume(volMl)}/pc`,
          };
        }
      }

      // Pièce sans poids ni volume (ex: emballage, article divers)
      return { main: `${fmtMoney(o.unit_price)} €/pc`, sub: "offre fournisseur" };
    }

    return { main: "—", sub: "offre incomplète" };
  }

  if (pk === "pack_simple") {
    if (o.pack_price == null || o.pack_total_qty == null || o.pack_total_qty <= 0 || o.pack_unit == null) {
      return { main: "—", sub: "offre incomplète" };
    }
    const per = o.pack_price / o.pack_total_qty;
    const unit = o.pack_unit === "kg" ? "kg" : "L";
    const d = o.pack_unit === "l" && o.density_kg_per_l != null ? ` • densité: ${fmtQty(o.density_kg_per_l)} kg/L` : "";
    return { main: `${fmtMoney(per)} € /${unit}`, sub: `pack: ${fmtMoney(o.pack_price)} € / ${fmtQty(o.pack_total_qty)} ${unit}${d}` };
  }

  if (pk === "pack_composed") {
    if (o.pack_price == null || o.pack_count == null || o.pack_count <= 0 || o.pack_each_unit == null) {
      return { main: "—", sub: "offre incomplète" };
    }

    if (o.pack_each_unit === "pc") {
      const pw = n2(o.piece_weight_g);
      if (pw <= 0) return { main: "—", sub: "poids pièce manquant" };
      const perPc = o.pack_price / o.pack_count;
      const eurPerKg = (perPc / pw) * 1000;
      return {
        main: `${fmtMoney(eurPerKg)} € /kg`,
        sub: `pack: ${fmtMoney(o.pack_price)} € / ${fmtQty(o.pack_count)} pcs • offre: ${fmtMoney(perPc)} €/pc • ${fmtQty(pw)} g/pc`,
      };
    }

    if (o.pack_each_qty == null || o.pack_each_qty <= 0) return { main: "—", sub: "quantité par élément manquante" };
    const total = o.pack_count * o.pack_each_qty;
    const unit = o.pack_each_unit === "kg" ? "kg" : "L";
    const per = o.pack_price / total;
    const d = o.pack_each_unit === "l" && o.density_kg_per_l != null ? ` • densité: ${fmtQty(o.density_kg_per_l)} kg/L` : "";
    return {
      main: `${fmtMoney(per)} € /${unit}`,
      sub: `pack: ${fmtMoney(o.pack_price)} € / ${fmtQty(o.pack_count)} × ${fmtQty(o.pack_each_qty)} ${unit} (= ${fmtQty(total)} ${unit})${d}`,
    };
  }

  return { main: "—", sub: "offre inconnue" };
}

export function offerHasPrice(o: LatestOffer | undefined): boolean {
  if (!o) return false;

  if (o.price_kind === "unit") {
    return o.unit != null && o.unit_price != null && Number.isFinite(o.unit_price) && o.unit_price > 0;
  }

  if (o.price_kind === "pack_simple") {
    return (
      o.pack_price != null &&
      Number.isFinite(o.pack_price) &&
      o.pack_price > 0 &&
      o.pack_total_qty != null &&
      Number.isFinite(o.pack_total_qty) &&
      o.pack_total_qty > 0 &&
      o.pack_unit != null
    );
  }

  if (o.price_kind === "pack_composed") {
    if (!(o.pack_price != null && Number.isFinite(o.pack_price) && o.pack_price > 0)) return false;
    if (!(o.pack_count != null && Number.isFinite(o.pack_count) && o.pack_count > 0)) return false;
    if (o.pack_each_unit == null) return false;

    if (o.pack_each_unit === "pc") {
      return o.piece_weight_g != null && Number.isFinite(o.piece_weight_g) && o.piece_weight_g > 0;
    }

    return o.pack_each_qty != null && Number.isFinite(o.pack_each_qty) && o.pack_each_qty > 0;
  }

  return false;
}

export function legacyHasPrice(x: Ingredient): boolean {
  const cpu = x.cost_per_unit;
  if (cpu != null && Number.isFinite(cpu) && cpu > 0) return true;

  const pp = x.purchase_price;
  const pu = x.purchase_unit;
  if (pp != null && Number.isFinite(pp) && pp > 0 && pu != null && Number.isFinite(pu) && pu > 0) return true;

  return false;
}

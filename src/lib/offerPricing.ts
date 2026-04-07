export type OfferUnit = "kg" | "g" | "l" | "ml" | "pc" | "pcs" | string;

export type CpuByUnit = {
  g?: number;    // €/g
  ml?: number;   // €/ml
  pcs?: number;  // €/pcs
};

function n2(v: unknown) {
  const x = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

export function offerToCpu(unit: OfferUnit, unitPrice: unknown): CpuByUnit {
  const p = n2(unitPrice);
  if (!(p > 0)) return {};

  const u = String(unit || "").trim().toLowerCase();

  if (u === "kg") return { g: p / 1000 };
  if (u === "g") return { g: p };

  if (u === "l") return { ml: p / 1000 };
  if (u === "ml") return { ml: p };

  if (
    u === "pc" ||
    u === "pcs" ||
    u === "pce" ||
    u === "piece" ||
    u === "pièce" ||
    u === "pieces" ||
    u === "pièces" ||
    u === "un" ||
    u === "u" ||
    u === "unit" ||
    u === "units" ||
    u === "unite" ||
    u === "unité" ||
    u === "unites" ||
    u === "unités"
  ) {
    return { pcs: p };
  }

  return {};
}

function cpuFromPack(row: Record<string, unknown>): CpuByUnit {
  const packPrice = n2(row["pack_price"]);
  if (!(packPrice > 0)) return {};

  const packTotalQty = n2(row["pack_total_qty"]);
  const packUnit = String(row["pack_unit"] ?? "").trim();

  const packCount = n2(row["pack_count"]);
  const packEachQty = n2(row["pack_each_qty"]);
  const packEachUnit = String(row["pack_each_unit"] ?? "").trim();

  if (packTotalQty > 0 && packUnit) {
    const perUnit = packPrice / packTotalQty;
    return offerToCpu(packUnit, perUnit);
  }

  if (packCount > 0 && packEachQty > 0 && packEachUnit) {
    const totalQty = packCount * packEachQty;
    const perUnit = packPrice / totalQty;
    return offerToCpu(packEachUnit, perUnit);
  }

  // Pack composé en pièces sans qty unitaire : prix/pc = pack_price / pack_count
  // (la conversion vers €/g se fera ensuite via piece_weight_g dans enrichCpuWithConversions)
  if (packCount > 0 && (packEachUnit === "pc" || packEachUnit === "pcs" || !packEachUnit)) {
    return { pcs: packPrice / packCount };
  }

  return {};
}

export function enrichCpuWithConversions(row: Record<string, unknown>, cpu: CpuByUnit): CpuByUnit {
  const out: CpuByUnit = { ...cpu };

  const pieceWeightG = n2(row["piece_weight_g"]);
  if (out.pcs != null && !(out.g != null) && pieceWeightG > 0) {
    out.g = out.pcs / pieceWeightG;
  }

  const densityKgPerL = n2(row["density_kg_per_l"]);
  if (densityKgPerL > 0) {
    if (out.g != null && !(out.ml != null)) {
      out.ml = out.g * densityKgPerL;
    } else if (out.ml != null && !(out.g != null)) {
      out.g = out.ml / densityKgPerL;
    }
  }

  return out;
}

export function offerRowToCpu(row: Record<string, unknown>): CpuByUnit {
  const unit = String(row["unit"] ?? "").trim().toLowerCase();
  const unitPrice = row["unit_price"];

  const packUnits = new Set(["pack", "colis", "carton", "caisse", "case", "boite", "box", "lot"]);

  if (packUnits.has(unit)) {
    const fromPack = cpuFromPack(row);
    const enriched = enrichCpuWithConversions(row, fromPack);
    const empty = !enriched.g && !enriched.ml && !enriched.pcs;
    return empty ? {} : enriched;
  }

  const direct = offerToCpu(unit, unitPrice);
  const enrichedDirect = enrichCpuWithConversions(row, direct);
  const emptyDirect = !enrichedDirect.g && !enrichedDirect.ml && !enrichedDirect.pcs;
  if (!emptyDirect) return enrichedDirect;

  const fromPack = cpuFromPack(row);
  const enrichedPack = enrichCpuWithConversions(row, fromPack);
  const emptyPack = !enrichedPack.g && !enrichedPack.ml && !enrichedPack.pcs;
  return emptyPack ? {} : enrichedPack;
}

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

  return {};
}

export function offerRowToCpu(row: Record<string, unknown>): CpuByUnit {
  const unit = String(row["unit"] ?? "").trim().toLowerCase();
  const unitPrice = row["unit_price"];

  const packUnits = new Set(["pack", "colis", "carton", "caisse", "case", "boite", "box", "lot"]);

  if (packUnits.has(unit)) {
    const fromPack = cpuFromPack(row);
    const empty = !fromPack.g && !fromPack.ml && !fromPack.pcs;
    return empty ? {} : fromPack;
  }

  const direct = offerToCpu(unit, unitPrice);
  const emptyDirect = !direct.g && !direct.ml && !direct.pcs;
  if (!emptyDirect) return direct;

  return cpuFromPack(row);
}

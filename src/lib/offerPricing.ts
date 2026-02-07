export type OfferUnit = "kg" | "g" | "l" | "ml" | "pc" | "pcs" | string;

export type CpuByUnit = {
  g?: number;    // €/g
  ml?: number;   // €/ml
  pcs?: number;  // €/pcs
};

export function offerToCpu(unit: OfferUnit, unitPrice: unknown): CpuByUnit {
  const p = typeof unitPrice === "number" ? unitPrice : Number(unitPrice);
  if (!Number.isFinite(p) || p <= 0) return {};

  const u = String(unit || "").trim().toLowerCase();

  if (u === "kg") return { g: p / 1000 };
  if (u === "g") return { g: p };

  if (u === "l") return { ml: p / 1000 };
  if (u === "ml") return { ml: p };

  if (u === "pc" || u === "pcs") return { pcs: p };

  return {};
}

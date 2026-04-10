/**
 * Supplier color system.
 * Priority: DB color (supplier.color) > fixed map > hash fallback.
 */

import { PALETTE_HEX } from "@/lib/colors";

const FIXED_COLORS: Record<string, string> = {
  metro:        "#8B1A1A",
  mael:         "#C0392B",
  cozigou:      "#D4775A",
  carniato:     "#E67E22",
  vinoflo:      "#D4AC0D",
  "bar spirits":"#7CB342",
  sum:          "#26A69A",
  armor:        "#4EAAB0",
  masse:        "#2E86C1",
  sdpf:         "#5B6AAF",
  lmdw:         "#7D3C98",
};

/** Normalize a supplier name to a lookup key */
function normalize(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Get the color for a supplier.
 * If `dbColor` is provided (from suppliers.color column), use it.
 * Otherwise fall back to fixed map or hash-based palette color.
 */
export function getSupplierColor(name: string, dbColor?: string | null): string {
  if (dbColor) return dbColor;
  const key = normalize(name);
  if (FIXED_COLORS[key]) return FIXED_COLORS[key];
  // Deterministic hash → palette color
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return PALETTE_HEX[Math.abs(hash) % PALETTE_HEX.length];
}

/**
 * Build a name→color map for a list of suppliers.
 * Pass objects with optional color field for DB-backed colors.
 */
export function buildSupplierColorMap(
  suppliers: { name: string; color?: string | null }[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of suppliers) {
    map[s.name] = getSupplierColor(s.name, s.color);
  }
  return map;
}

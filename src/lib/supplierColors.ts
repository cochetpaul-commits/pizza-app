/**
 * Fixed color mapping for suppliers.
 * Every supplier always gets the same color across all pages.
 */

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

/** Fallback palette for suppliers not in the fixed map */
const FALLBACK_COLORS = [
  "#C8CC78", "#95A5A6", "#E74C3C", "#1ABC9C", "#9B59B6",
  "#F39C12", "#3498DB", "#2C3E50", "#E91E63", "#00BCD4",
];

/** Normalize a supplier name to a lookup key */
function normalize(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * Get the color for a supplier by name.
 * Known suppliers always return the same color.
 * Unknown suppliers get a deterministic fallback based on name hash.
 */
export function getSupplierColor(name: string): string {
  const key = normalize(name);
  if (FIXED_COLORS[key]) return FIXED_COLORS[key];
  // Deterministic hash for unknown suppliers
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

/**
 * Build a name→color map for a list of supplier names.
 */
export function buildSupplierColorMap(names: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const n of names) {
    map[n] = getSupplierColor(n);
  }
  return map;
}

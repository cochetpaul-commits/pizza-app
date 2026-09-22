import { CATEGORIES, CAT_LABELS, type Category } from "@/types/ingredients";

/**
 * Feuille Excel « base produits » : une ligne par produit, une colonne par
 * paramètre. Sert à l'export (tri / correction dans Excel) et à la
 * réimportation. Les en-têtes sont la clé : ne pas les renommer.
 */
export const SHEET_PRODUITS = "Produits";
export const SHEET_LISTES = "Listes";

export const UNITES_BASE = ["g", "kg", "l", "pc"] as const;
export const OUI = "oui", NON = "non";

/** Colonnes dans l'ordre du fichier. `edit:false` = information, ignorée à l'import. */
export const COLS = [
  { key: "id", header: "ID (ne pas modifier)", edit: false },
  { key: "name", header: "Nom", edit: true },
  { key: "is_active", header: "Actif (oui/non)", edit: true },
  { key: "establishments", header: "Établissements (Bello Mio / Piccola Mia / les deux)", edit: true },
  { key: "category", header: "Catégorie", edit: true },
  { key: "sub_category", header: "Sous-catégorie", edit: true },
  { key: "fournisseur", header: "Fournisseur (info)", edit: false },
  { key: "prix_kg", header: "Prix au kg / L (info)", edit: false },
  { key: "purchase_price", header: "Prix d'achat HT", edit: true },
  { key: "purchase_unit_label", header: "Unité d'achat (kg, L, bouteille, carton…)", edit: true },
  { key: "purchase_unit", header: "Contenu de l'unité d'achat (ex. 6 pour un carton de 6)", edit: true },
  { key: "order_unit_label", header: "Conditionnement de commande", edit: true },
  { key: "order_quantity", header: "Qté par conditionnement", edit: true },
  { key: "default_unit", header: "Unité de base (g/kg/l/pc)", edit: true },
  { key: "piece_weight_g", header: "Poids d'une pièce (g)", edit: true },
  { key: "piece_volume_ml", header: "Volume d'une pièce (ml)", edit: true },
  { key: "density_g_per_ml", header: "Densité (g/ml)", edit: true },
  { key: "storage_zone", header: "Zone de stockage", edit: true },
  { key: "storage_zone_2", header: "Zone de stockage 2", edit: true },
  { key: "stock_min", header: "Stock mini", edit: true },
  { key: "stock_objectif", header: "Stock objectif", edit: true },
  { key: "stock_max", header: "Stock maxi", edit: true },
  { key: "favori_commande", header: "Favori commande (oui/non)", edit: true },
  { key: "status", header: "Statut (à vérifier / validé)", edit: true },
  { key: "allergens", header: "Allergènes (séparés par ;)", edit: true },
  { key: "popina_name", header: "Nom Popina", edit: true },
  { key: "import_name", header: "Libellé facture (info)", edit: false },
] as const;

export type ColKey = (typeof COLS)[number]["key"];
export const EDITABLE: ColKey[] = COLS.filter((c) => c.edit).map((c) => c.key);
export const HEADER_TO_KEY: Record<string, ColKey> = Object.fromEntries(COLS.map((c) => [c.header.trim().toLowerCase(), c.key])) as Record<string, ColKey>;

export const ETAB_LABEL: Record<string, string> = { bellomio: "Bello Mio", piccola: "Piccola Mia" };
export const CATEGORY_HELP = CATEGORIES.map((c) => `${c} = ${CAT_LABELS[c as Category] ?? c}`);

/* ── conversions cellule ⇄ base ── */
export const boolOut = (b: unknown) => (b ? OUI : NON);
export function boolIn(v: unknown): boolean | undefined {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (["oui", "o", "yes", "y", "1", "true", "vrai", "x"].includes(s)) return true;
  if (["non", "n", "no", "0", "false", "faux"].includes(s)) return false;
  return undefined;
}
export function numIn(v: unknown): number | null | "invalide" {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s/g, "").replace(",", ".").replace(/€|kg|g|l|ml/gi, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : "invalide";
}
export function estabsOut(arr: unknown): string {
  const a = Array.isArray(arr) ? (arr as string[]) : [];
  if (!a.length) return "";
  return a.map((e) => ETAB_LABEL[e] ?? e).join(" ; ");
}
export function estabsIn(v: unknown): string[] | undefined | "invalide" {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return undefined;
  const out = new Set<string>();
  if (/deux|tous|both|all/.test(s)) { out.add("bellomio"); out.add("piccola"); }
  if (/bello/.test(s)) out.add("bellomio");
  if (/piccola/.test(s)) out.add("piccola");
  if (!out.size) return "invalide";
  return [...out].sort();
}
export function allergensOut(v: unknown): string {
  try {
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(arr) ? arr.join(" ; ") : "";
  } catch { return typeof v === "string" ? v : ""; }
}
export function allergensIn(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const arr = s.split(/[;,/|]/).map((x) => x.trim()).filter(Boolean);
  return JSON.stringify(arr);
}
export function statusOut(s: unknown): string { return s === "validated" ? "validé" : "à vérifier"; }
export function statusIn(v: unknown): "validated" | "to_check" | undefined | "invalide" {
  const s = String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!s) return undefined;
  if (/^valid/.test(s) || s === "ok") return "validated";
  if (/verif|check|controle/.test(s)) return "to_check";
  return "invalide";
}
export const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

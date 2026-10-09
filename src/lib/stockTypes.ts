/** Stock théorique (réponse de /api/stock) et mouvements (/api/stock/movements), partagés par la Base produits et les commandes. */

export type StockItem = {
  ingredient_id: string;
  name: string;
  category: string | null;
  unit: string | null;
  stock: number;
  receptions: number;
  ventes: number;
  stock_min: number | null;
  stock_objectif: number | null;
  /** Sous le minimum (stock_min renseigné et stock ≤ minimum) */
  alerte: boolean;
};

export type StockMovement = {
  id: string;
  type: string;
  quantity: number;
  unit: string | null;
  reference_type: string | null;
  note: string | null;
  created_at: string;
};

export const MOUVEMENT_LIBELLES: Record<string, string> = {
  reception: "Réception",
  vente: "Vente",
  inventaire: "Inventaire",
  ajustement: "Ajustement",
};

export const MOUVEMENT_COULEURS: Record<string, string> = {
  reception: "#4a6741",
  vente: "#D4775A",
  inventaire: "#2563EB",
  ajustement: "#8B6914",
};

export function fmtQte(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString("fr-FR");
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function dateInventaire(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

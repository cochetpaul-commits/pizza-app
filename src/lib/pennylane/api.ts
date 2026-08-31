/**
 * Client Pennylane (API externe v2) — lecture seule.
 * Base: https://app.pennylane.com/api/external/v2/
 *
 * Sert au calcul de marge / EBE : les factures fournisseurs de Pennylane
 * sont exhaustives (toutes les factures y arrivent via Google Drive) et
 * portent le HT, alors que les factures scannées dans l'app ne couvrent
 * que les fournisseurs de la mercuriale.
 *
 * Nécessite PENNYLANE_API_KEY (Pennylane → Paramètres → API).
 * Un seul dossier est connecté aujourd'hui : SARL SASHA (Bello Mio).
 */

const BASE_URL = "https://app.pennylane.com/api/external/v2/";

export function pennylaneConfigured(): boolean {
  return !!process.env.PENNYLANE_API_KEY;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * GET Pennylane avec réessai : l'API limite le débit (429) et demande
 * d'attendre quelques secondes — sans ce retry, une synchro d'un mois
 * complet échoue au milieu.
 */
async function plGet<T = unknown>(path: string, tentative = 0): Promise<T> {
  const key = process.env.PENNYLANE_API_KEY;
  if (!key) throw new Error("PENNYLANE_API_KEY manquante");
  const res = await fetch(BASE_URL + path, {
    headers: { Authorization: `Bearer ${key.trim()}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 429 && tentative < 5) {
    const txt = await res.text().catch(() => "");
    const m = /retry in (\d+)/i.exec(txt);
    const attente = (m ? Number(m[1]) : 2) * 1000 + tentative * 500;
    await sleep(attente);
    return plGet<T>(path, tentative + 1);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Pennylane ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

export type PlSupplierInvoice = {
  id: number;
  date: string;
  label: string | null;
  invoice_number?: string | null;
  filename?: string | null;
  /** Fichier d'origine (PDF ou photo) — sert à la récupération automatique */
  public_file_url?: string | null;
  currency_amount_before_tax: string;
  currency_amount: string;
  archived_at: string | null;
  supplier?: { id: number };
};

export type PlCategory = { id: number; label: string; direction: string };

type Paged<T> = { items: T[]; has_more: boolean; next_cursor: string | null };

/** Toutes les factures fournisseurs d'une période (pagination suivie). */
export async function getSupplierInvoices(from: string, to: string): Promise<PlSupplierInvoice[]> {
  const filter = encodeURIComponent(JSON.stringify([
    { field: "date", operator: "gteq", value: from },
    { field: "date", operator: "lteq", value: to },
  ]));
  const out: PlSupplierInvoice[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 30; page++) {
    const q = `supplier_invoices?filter=${filter}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const data: Paged<PlSupplierInvoice> = await plGet(q);
    out.push(...(data.items ?? []));
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  // Les factures archivées sont des doublons/erreurs : on les écarte
  return out.filter(i => !i.archived_at);
}

/** Catégories analytiques d'une facture (une facture peut en avoir plusieurs). */
export async function getInvoiceCategories(invoiceId: number): Promise<{ label: string; weight: number }[]> {
  try {
    const data = await plGet<Paged<{ label?: string; category?: { label?: string }; weight?: string }>>(
      `supplier_invoices/${invoiceId}/categories`,
    );
    return (data.items ?? []).map(c => ({
      label: c.label ?? c.category?.label ?? "En attente de catégorisation",
      weight: Number(c.weight) || 1,
    }));
  } catch {
    return [];
  }
}

export type PlTransaction = {
  id: number;
  date: string;
  label: string;
  amount: string;
  categories?: { label?: string; weight?: string }[];
  matched_invoices?: unknown;
};

/**
 * Transactions bancaires d'une période, avec leurs catégories.
 * Sert à capter les charges SANS facture fournisseur (salaires, URSSAF,
 * loyer prélevé…). Les transactions déjà rapprochées à une facture sont
 * exclues à l'usage pour ne pas compter deux fois.
 */
export async function getTransactions(from: string, to: string): Promise<PlTransaction[]> {
  const filter = encodeURIComponent(JSON.stringify([
    { field: "date", operator: "gteq", value: from },
    { field: "date", operator: "lteq", value: to },
  ]));
  const out: PlTransaction[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 30; page++) {
    const q = `transactions?filter=${filter}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const data: Paged<PlTransaction> = await plGet(q);
    out.push(...(data.items ?? []));
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return out;
}

export async function getSuppliers(): Promise<{ id: number; name: string }[]> {
  const out: { id: number; name: string }[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const q = `suppliers?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const data: Paged<{ id: number; name: string }> = await plGet(q);
    out.push(...(data.items ?? []));
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return out;
}

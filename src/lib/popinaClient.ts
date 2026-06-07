// src/lib/popinaClient.ts
// Utilitaire serveur uniquement — ne pas importer côté client

export const POPINA_BASE = "https://api.popina.com/v1";
export const LOCATION_ID = "d7442cfe-0305-4885-be9c-4853b9a3a2c2";

/** Date YYYY-MM-DD en heure de Paris, offsetDays = -N pour les jours précédents */
export function getParisDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
}

/** ISO datetime → "YYYY-MM-DD" en heure de Paris */
export function toParisDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));
}

// ── Reports ──────────────────────────────────────────────────────────────

export type PopinaReport = {
  id: string;
  startedAt?: string;
  finalizedAt?: string;
  totalSales: number;   // centimes
  guestsNumber: number;
  reportNumber?: number;
  deviceName?: string;
  orders?: string[];    // array d'IDs d'orders
  reportProducts?: Array<{
    productName: string;
    productQuantity: number;
    productSales: number; // centimes
    productCategory?: string;
  }>;
};

/**
 * GET /v1/reports?locationId=…&from=…&to=…
 * ⚠️ from/to filtre large : il faut refiltrer côté code via toParisDay(startedAt)
 */
export async function fetchReports(
  apiKey: string,
  from: string,
  to: string,
): Promise<PopinaReport[]> {
  const url = `${POPINA_BASE}/reports?locationId=${LOCATION_ID}&from=${from}&to=${to}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Popina /reports ${res.status} ${res.statusText}`);
  const json = await res.json();
  const items = Array.isArray(json) ? json
              : Array.isArray(json?.data) ? json.data
              : [];
  return items as PopinaReport[];
}

/** Filtre les reports renvoyés par fetchReports pour ne garder que ceux du jour Paris demandé */
export function reportsForParisDay(reports: PopinaReport[], parisDay: string): PopinaReport[] {
  return reports.filter((r) => toParisDay(r.startedAt) === parisDay);
}

// ── Orders ───────────────────────────────────────────────────────────────

export type PopinaOrderItem = {
  description: string;
  category?: string;
  subCategory?: string;
  quantity: number;
  total: number;        // centimes
  unitPrice: number;    // centimes
  isCanceled?: boolean;
  isTransferred?: boolean;
  isLoss?: boolean;
  cancelReason?: string | null;
  transferReason?: string | null;
  lossReason?: string | null;
  tier?: string;
  tax?: { taxName?: string; taxRate?: number; taxAmount?: number; taxableAmount?: number };
  modifiers?: Array<{ name: string }>;
  itemCatalogId?: string;
};

export type PopinaPayment = {
  paymentName: string;
  paymentAmount: number; // centimes
  paymentCatalogId?: string;
};

export type PopinaOrder = {
  id: string;
  reportId?: string;
  openedAt?: string;
  closedAt?: string;
  guests?: number;
  orderPlace?: string;
  orderNumber?: string;
  operatorName?: string;
  total?: number;        // centimes
  totalTax?: number;
  totalDiscount?: number;
  items?: PopinaOrderItem[];
  payments?: PopinaPayment[];
  isCanceled?: boolean;
  isTransferred?: boolean;
};

/** GET /v1/orders/{id} */
export async function fetchOrderDetail(apiKey: string, orderId: string): Promise<PopinaOrder> {
  const url = `${POPINA_BASE}/orders/${orderId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Popina /orders/${orderId} ${res.status}`);
  return (await res.json()) as PopinaOrder;
}

/**
 * Pour un jour Paris donné :
 * 1. Pull reports (range élargie d'une journée de chaque côté)
 * 2. Filtre les reports du jour
 * 3. Pull en parallèle le détail de chaque orderId (limité à 20 simultanés)
 */
export async function fetchAllOrdersForDay(
  apiKey: string,
  parisDay: string,
): Promise<{ reports: PopinaReport[]; orders: PopinaOrder[] }> {
  // Élargir la fenêtre pour être sûr d'attraper les reports du jour
  const from = shiftDay(parisDay, -1);
  const to = shiftDay(parisDay, 1);

  const allReports = await fetchReports(apiKey, from, to);
  const reports = reportsForParisDay(allReports, parisDay);

  const orderIds = reports.flatMap((r) => r.orders ?? []);
  const orders = await runConcurrent(orderIds, 20, (id) => fetchOrderDetail(apiKey, id));

  return { reports, orders };
}

// ── helpers ──────────────────────────────────────────────────────────────

function shiftDay(day: string, delta: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

async function runConcurrent<T, R>(
  inputs: T[],
  limit: number,
  fn: (x: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(inputs.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= inputs.length) return;
      out[i] = await fn(inputs[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, worker));
  return out;
}

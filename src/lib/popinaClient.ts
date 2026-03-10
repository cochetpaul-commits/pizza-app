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

export type PopinaProduct = {
  name: string;
  quantity: number;
  totalSales: number; // centimes
};

export type PopinaReport = {
  startedAt?: string;
  finalizedAt?: string;
  totalSales: number;   // centimes
  guestsNumber: number;
  reportProducts: Array<{
    productName: string;
    productQuantity: number;
    productSales: number; // centimes
  }>;
};

/**
 * Appelle GET /v1/reports?locationId=…&from=…&to=…
 * Popina répond { data: [...] }
 * En cas d'erreur, renvoie [].
 */
export async function fetchReports(
  apiKey: string,
  from: string,
  to: string
): Promise<PopinaReport[]> {
  const url = `${POPINA_BASE}/reports?locationId=${LOCATION_ID}&from=${from}&to=${to}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    // Popina wraps results in { data: [...] }
    const items = Array.isArray(json) ? json
                : Array.isArray(json?.data) ? json.data
                : json ? [json]
                : [];
    return items as PopinaReport[];
  } catch {
    return [];
  }
}

/** Agrège un tableau de reportProducts en dédupliquant par nom */
export function aggregateProducts(reports: PopinaReport[]): PopinaProduct[] {
  const map = new Map<string, PopinaProduct>();
  for (const r of reports) {
    for (const p of r.reportProducts ?? []) {
      const key = p.productName ?? "Inconnu";
      const prev = map.get(key);
      if (prev) {
        prev.quantity += p.productQuantity ?? 0;
        prev.totalSales += p.productSales ?? 0;
      } else {
        map.set(key, {
          name: key,
          quantity: p.productQuantity ?? 0,
          totalSales: p.productSales ?? 0,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalSales - a.totalSales);
}

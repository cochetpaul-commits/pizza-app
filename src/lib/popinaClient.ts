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
  date?: string;
  totalSales: number;   // centimes
  guestsNumber: number;
  reportProducts: PopinaProduct[];
};

/**
 * Appelle GET /v1/reports?locationId=…&from=…&to=…
 * Renvoie un tableau de rapports (un par jour si la période couvre plusieurs jours,
 * ou un seul objet si la période est d'un jour).
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
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data as PopinaReport[];
    if (data && typeof data === "object") return [data as PopinaReport];
    return [];
  } catch {
    return [];
  }
}

/** Aggrège un tableau de reportProducts en dédupliquant par nom */
export function aggregateProducts(reports: PopinaReport[]): PopinaProduct[] {
  const map = new Map<string, PopinaProduct>();
  for (const r of reports) {
    for (const p of r.reportProducts ?? []) {
      const key = p.name ?? "Inconnu";
      const prev = map.get(key);
      if (prev) {
        prev.quantity += p.quantity ?? 0;
        prev.totalSales += p.totalSales ?? 0;
      } else {
        map.set(key, { name: key, quantity: p.quantity ?? 0, totalSales: p.totalSales ?? 0 });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalSales - a.totalSales);
}

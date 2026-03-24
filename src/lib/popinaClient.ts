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
  roomName?: string;
  reportProducts: Array<{
    productName: string;
    productQuantity: number;
    productSales: number; // centimes
    productCategory?: string;
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
  to: string,
  locationId: string = LOCATION_ID,
): Promise<PopinaReport[]> {
  const url = `${POPINA_BASE}/reports?locationId=${locationId}&from=${from}&to=${to}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[Popina] reports ${res.status}: ${body.slice(0, 200)}`);
      return [];
    }
    const json = await res.json();
    // Popina wraps results in { data: [...] }
    const items = Array.isArray(json) ? json
                : Array.isArray(json?.data) ? json.data
                : json ? [json]
                : [];
    return items as PopinaReport[];
  } catch (err) {
    console.error("[Popina] reports fetch error:", err);
    return [];
  }
}

// ── Orders ───────────────────────────────────────────────────────────────

export type PopinaOrder = {
  openedAt?: string;
  closedAt?: string;
  totalSales?: number;  // centimes
  guestsNumber?: number;
  orderPlace?: string;
  orderItems?: Array<{
    productName?: string;
    productQuantity?: number;
    productSales?: number;
    productCategory?: string;
  }>;
};

/**
 * GET /v1/orders?locationId=…&date=YYYY-MM-DD
 * Renvoie [] en cas d'erreur.
 */
export async function fetchOrders(
  apiKey: string,
  date: string,
  locationId: string = LOCATION_ID,
): Promise<PopinaOrder[]> {
  const url = `${POPINA_BASE}/orders?locationId=${locationId}&date=${date}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[Popina] orders ${res.status}: ${body.slice(0, 200)}`);
      return [];
    }
    const json = await res.json();
    const items = Array.isArray(json) ? json
                : Array.isArray(json?.data) ? json.data
                : json ? [json]
                : [];
    return items as PopinaOrder[];
  } catch (err) {
    console.error("[Popina] orders fetch error:", err);
    return [];
  }
}

// ── ISO week helpers ──────────────────────────────────────────────────────

/** YYYY-MM-DD → ISO week string "YYYY-WW" */
export function dateToISOWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

/** ISO week "YYYY-WW" → Monday UTC Date */
export function isoWeekToMonday(weekStr: string): Date {
  const [y, w] = weekStr.split("-").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const week1Mon = new Date(Date.UTC(y, 0, 4 - dow + 1));
  const monday = new Date(week1Mon);
  monday.setUTCDate(week1Mon.getUTCDate() + (w - 1) * 7);
  return monday;
}

/** UTC Date → "YYYY-MM-DD" */
export function fmtDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
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

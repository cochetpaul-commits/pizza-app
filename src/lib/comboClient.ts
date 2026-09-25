// Ne pas activer tant que la tâche programmée Q1 envoie le CA à Combo.
// src/lib/comboClient.ts
// Client API Combo (Partner API) — serveur uniquement, ne pas importer côté client.
// Doc : https://partner.combohr.com  (Authorization: Bearer <COMBO_API_KEY>)

export const COMBO_BASE = "https://partner.combohr.com";

// location_id "partenaire" Combo (≠ id UI). Récupérés via GET /api/v1/locations.
export const COMBO_LOCATION = {
  bello: "a0b6d3e9-1964-410d-aeaa-91fa07279420",
  piccola: "66bab9ec-3e11-4972-aa88-b3fd55bb3bb2",
} as const;

export type ComboRevenue = {
  location_id: string;
  location_name: string;
  date: string;
  estimated_amount: number;
  actual_amount: number;
  automated_update?: boolean;
};

/**
 * POST /api/v1/revenues — crée ou met à jour le CA d'un jour (idempotent).
 * `amount` = CA réel (HT, comme la ligne "Ventes réelles (HT)" de Combo).
 * Renvoie la revenue mise à jour.
 */
export async function postComboRevenue(
  apiKey: string,
  locationId: string,
  date: string,        // "YYYY-MM-DD" (ISO 8601)
  amountHT: number,    // CA HT réel, décimal
): Promise<ComboRevenue> {
  const res = await fetch(`${COMBO_BASE}/api/v1/revenues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      location_id: locationId,
      date,
      amount: Number(amountHT.toFixed(2)),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Combo POST /revenues ${res.status} ${res.statusText} ${body}`.trim());
  }
  return (await res.json()) as ComboRevenue;
}

/** GET /api/v1/revenues?week={ISO week} — lecture du CA (budget + réel) d'une semaine. */
export async function getComboRevenues(apiKey: string, isoWeek: string): Promise<ComboRevenue[]> {
  const res = await fetch(`${COMBO_BASE}/api/v1/revenues?week=${encodeURIComponent(isoWeek)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Combo GET /revenues ${res.status} ${res.statusText}`);
  return (await res.json()) as ComboRevenue[];
}

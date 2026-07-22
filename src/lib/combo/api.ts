/**
 * Combo HR API client
 * Base: https://partner.combohr.com/api/v1/
 * Auth: Bearer token
 */

const BASE_URL = "https://partner.combohr.com/api/v1/";

function getKey(): string {
  const key = process.env.COMBO_KEY;
  if (!key) throw new Error("COMBO_KEY env var missing");
  return key.trim();
}

export async function comboGet<T = unknown>(endpoint: string): Promise<T> {
  const url = BASE_URL + endpoint;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getKey()}`,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Combo API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Types ──

export type ComboLocation = {
  id: string;
  name: string;
  teams: { id: string; name: string }[];
};

export type ComboContract = {
  id: string;
  original_contract_id: string;
  firstname: string;
  lastname: string;
  email: string | null;
  mobile_phone: string | null;
  function: string | null;
  role: string; // employee | manager | owner | main_owner
  contract_type: string; // CDI | CDD | seasonal
  contract_time: number; // heures/semaine
  start_date: string;
  end_date: string | null;
  location_id: string;
  employee_number: string | null;
  monthly_gross_salary: number;
  hourly_gross_salary: number;
  hourly_gross_rate: number;
  street_address: string | null;
  zip: string | null;
  city: string | null;
  social_security_number: string | null;
};

export type ComboShift = {
  starts_at: string; // ISO datetime with timezone
  ends_at: string;
  break_duration: number; // minutes
  note: string | null;
  firstname: string;
  lastname: string;
  employee_number: string | null;
  location_id: string;
  location_name: string;
  team_name: string | null;
  team_id: string | null;
  label_name: string | null;
};

// ── Endpoints ──

export async function getLocations(): Promise<ComboLocation[]> {
  return comboGet("locations");
}

export async function getContracts(locationId: string, day?: string): Promise<ComboContract[]> {
  const d = day ?? new Date().toISOString().slice(0, 10);
  return comboGet(`contracts?location_id=${locationId}&day=${d}`);
}

export async function getPlannings(locationId: string, startDate: string, endDate: string): Promise<ComboShift[]> {
  // end_date is EXCLUSIVE in Combo API, so add 1 day
  const end = new Date(endDate + "T12:00:00");
  end.setDate(end.getDate() + 1);
  const endExcl = end.toISOString().slice(0, 10);
  return comboGet(`plannings?location_id=${locationId}&start_date=${startDate}&end_date=${endExcl}`);
}

// ── Location IDs ──
export const COMBO_LOCATIONS: Record<string, string> = {
  bello_mio: "a0b6d3e9-1964-410d-aeaa-91fa07279420",
  piccola: "66bab9ec-3e11-4972-aa88-b3fd55bb3bb2",
};

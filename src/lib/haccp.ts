import { supabase } from "@/lib/supabaseClient";

// Helpers HACCP — accès Supabase typé et calculs de conformité.
// Toutes les fonctions ciblent les tables `haccp_*` filtrées par
// `user_has_etablissement_access(etablissement_id)` côté RLS.

export type ModuleCode =
  | "temperatures"
  | "cleaning"
  | "tracability"
  | "reception"
  | "product_temp"
  | "checklist"
  | "oils"
  | "production"
  | "documents"
  | "labels";

export interface Equipment {
  id: string;
  etablissement_id: string;
  name: string;
  zone: string;
  kind: "fridge" | "freezer" | "coldroom" | "display";
  min_c: number;
  max_c: number;
  default_c: number;
}

export interface Product {
  id: string;
  etablissement_id: string;
  name: string;
  supplier: string | null;
  barcode: string | null;
  shelf_life_days: number;
}

export interface CleaningTask {
  id: string;
  etablissement_id: string;
  label: string;
  zone: string;
  detail: string | null;
  frequency: "day" | "week" | "month";
}

export interface ReadingInput {
  etablissement_id: string;
  module: ModuleCode;
  subject: string;
  value?: number | null;
  unit?: string | null;
  conform: boolean;
  at?: string;
  by_name: string;
  note?: string | null;
  meta?: Record<string, unknown> | null;
  source?: "manual" | "probe" | "import";
}

// ── Lectures ────────────────────────────────────────────────────────────────

export async function fetchEquipments(etablissementId: string): Promise<Equipment[]> {
  const { data, error } = await supabase
    .from("haccp_equipments")
    .select("*")
    .eq("etablissement_id", etablissementId)
    .order("name");
  if (error) console.warn("[haccp] fetchEquipments", error.message);
  return (data ?? []) as Equipment[];
}

export async function fetchProducts(etablissementId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from("haccp_products")
    .select("*")
    .eq("etablissement_id", etablissementId)
    .order("name");
  if (error) console.warn("[haccp] fetchProducts", error.message);
  return (data ?? []) as Product[];
}

export async function fetchCleaningTasks(etablissementId: string): Promise<CleaningTask[]> {
  const { data, error } = await supabase
    .from("haccp_cleaning_tasks")
    .select("*")
    .eq("etablissement_id", etablissementId)
    .order("frequency");
  if (error) console.warn("[haccp] fetchCleaningTasks", error.message);
  return (data ?? []) as CleaningTask[];
}

// ── Écritures ───────────────────────────────────────────────────────────────

export async function addReading(reading: ReadingInput): Promise<void> {
  const row = {
    at: new Date().toISOString(),
    source: "manual" as const,
    ...reading
  };
  const { error } = await supabase.from("haccp_readings").insert(row);
  if (error) throw new Error(`Insert reading: ${error.message}`);
}

export async function addReadings(readings: ReadingInput[]): Promise<void> {
  if (readings.length === 0) return;
  const rows = readings.map((r) => ({
    at: new Date().toISOString(),
    source: "manual" as const,
    ...r
  }));
  const { error } = await supabase.from("haccp_readings").insert(rows);
  if (error) throw new Error(`Insert readings: ${error.message}`);
}

// ── Conformité ──────────────────────────────────────────────────────────────

export const isConform = (equipment: Equipment, value: number) =>
  value >= Number(equipment.min_c) && value <= Number(equipment.max_c);

export const rangeLabel = (eq: Equipment) => {
  if (eq.kind === "freezer") return `≤ ${fmtC(eq.max_c)}`;
  return `${fmtC(eq.min_c)} à ${fmtC(eq.max_c)}`;
};

export const fmtC = (v: number) =>
  `${v > 0 ? "+" : ""}${Number(v).toFixed(1).replace(".", ",")} °C`;

// ── User courant ────────────────────────────────────────────────────────────

/** Nom à inscrire dans `by_name`. Préfère display_name du profile, sinon email. */
export async function currentUserName(): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  const email = u.user?.email ?? "—";
  if (!u.user?.id) return email;
  const { data: p } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", u.user.id)
    .maybeSingle();
  return (p?.display_name as string | undefined) ?? email;
}

import type { SupabaseClient } from "@supabase/supabase-js";

export const ALERT_THRESHOLD = 0.05;
export const ABERRANT_THRESHOLD = 0.50;

export interface PriceAlert {
  ingredient_id: string;
  ingredient_name: string;
  supplier_label: string;
  supplier_name: string;
  old_price: number;
  new_price: number;
  unit: string;
  change_pct: number;
  direction: "up" | "down";
  aberrant: boolean;
  new_offer_date: string;
}

type RawOffer = {
  ingredient_id: string;
  supplier_id: string;
  unit: string;
  unit_price: number;
  supplier_label: string | null;
  created_at: string;
};

export async function fetchPriceAlerts(
  supabase: SupabaseClient,
  userId: string,
  threshold = ALERT_THRESHOLD
): Promise<PriceAlert[]> {
  const { data: active, error: e1 } = await supabase
    .from("supplier_offers")
    .select("ingredient_id, supplier_id, unit, unit_price, supplier_label, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .not("unit_price", "is", null);

  if (e1) throw new Error(e1.message);
  if (!active?.length) return [];

  const ingredientIds = [...new Set((active as RawOffer[]).map(r => r.ingredient_id))];

  const { data: previous, error: e2 } = await supabase
    .from("supplier_offers")
    .select("ingredient_id, supplier_id, unit, unit_price, supplier_label, created_at")
    .eq("user_id", userId)
    .eq("is_active", false)
    .in("ingredient_id", ingredientIds)
    .not("unit_price", "is", null)
    .order("created_at", { ascending: false });

  if (e2) throw new Error(e2.message);

  const prevMap = new Map<string, RawOffer>();
  for (const r of (previous ?? []) as RawOffer[]) {
    const key = `${r.ingredient_id}__${r.supplier_id}`;
    if (!prevMap.has(key)) prevMap.set(key, r);
  }

  const { data: ingredients, error: e3 } = await supabase
    .from("ingredients")
    .select("id, name, supplier")
    .eq("user_id", userId)
    .in("id", ingredientIds);

  if (e3) throw new Error(e3.message);

  const ingMap = new Map<string, { name: string; supplier: string }>();
  for (const i of (ingredients ?? []) as Array<{ id: string; name: string; supplier: string }>) {
    ingMap.set(i.id, { name: i.name, supplier: i.supplier ?? "—" });
  }

  const supplierIds = [...new Set((active as RawOffer[]).map(r => r.supplier_id))];
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .in("id", supplierIds);

  const supMap = new Map<string, string>();
  for (const s of (suppliers ?? []) as Array<{ id: string; name: string }>) {
    supMap.set(s.id, s.name);
  }

  const alerts: PriceAlert[] = [];

  for (const curr of (active ?? []) as RawOffer[]) {
    const key = `${curr.ingredient_id}__${curr.supplier_id}`;
    const prev = prevMap.get(key);
    if (!prev) continue;
    if (prev.unit !== curr.unit) continue;

    const changePct = (curr.unit_price - prev.unit_price) / prev.unit_price;
    if (Math.abs(changePct) < threshold) continue;

    const ing = ingMap.get(curr.ingredient_id);

    alerts.push({
      ingredient_id:   curr.ingredient_id,
      ingredient_name: ing?.name ?? curr.ingredient_id,
      supplier_label:  curr.supplier_label ?? prev.supplier_label ?? "—",
      supplier_name:   supMap.get(curr.supplier_id) ?? ing?.supplier ?? "—",
      old_price:       prev.unit_price,
      new_price:       curr.unit_price,
      unit:            curr.unit,
      change_pct:      changePct,
      direction:       changePct > 0 ? "up" : "down",
      aberrant:        Math.abs(changePct) > ABERRANT_THRESHOLD,
      new_offer_date:  curr.created_at,
    });
  }

  alerts.sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === "up" ? -1 : 1;
    return Math.abs(b.change_pct) - Math.abs(a.change_pct);
  });

  return alerts;
}

// src/lib/priceAlerts.ts
// Détecte les hausses de prix fournisseurs >= ALERT_THRESHOLD
// Logique : compare la dernière offre active vs la précédente inactive (même fournisseur)

import type { SupabaseClient } from "@supabase/supabase-js";

export const ALERT_THRESHOLD = 0.05;
export const ABERRANT_THRESHOLD = 0.50; // 5%

export interface PriceAlert {
  ingredient_id: string;
  ingredient_name: string;
  supplier_name: string;
  old_price: number;
  new_price: number;
  unit: string;
  change_pct: number;        // ex: 0.12 = +12%
  new_offer_date: string;    // ISO date
}

export async function fetchPriceAlerts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  threshold = ALERT_THRESHOLD
): Promise<PriceAlert[]> {

  // 1. Toutes les offres actives (prix courant)
  const { data: active, error: e1 } = await supabase
    .from("supplier_offers")
    .select("ingredient_id, supplier_id, unit, unit_price, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .not("unit_price", "is", null);

  if (e1) throw new Error(e1.message);
  if (!active?.length) return [];

  const ingredientIds = [...new Set(active.map((r: {ingredient_id: string}) => r.ingredient_id))];

  // 2. Offres inactives les plus récentes pour ces ingrédients (prix précédent)
  const { data: previous, error: e2 } = await supabase
    .from("supplier_offers")
    .select("ingredient_id, supplier_id, unit, unit_price, created_at")
    .eq("user_id", userId)
    .eq("is_active", false)
    .in("ingredient_id", ingredientIds)
    .not("unit_price", "is", null)
    .order("created_at", { ascending: false });

  if (e2) throw new Error(e2.message);

  // 3. Garder seulement la précédente offre par (ingredient_id, supplier_id)
  const prevMap = new Map<string, { unit_price: number; unit: string; created_at: string }>();
  for (const r of (previous ?? []) as Array<{ingredient_id: string; supplier_id: string; unit: string; unit_price: number; created_at: string}>) {
    const key = `${r.ingredient_id}__${r.supplier_id}`;
    if (!prevMap.has(key)) prevMap.set(key, r);
  }

  // 4. Fetch noms ingrédients + fournisseurs
  const { data: ingredients, error: e3 } = await supabase
    .from("ingredients")
    .select("id, name, supplier")
    .eq("user_id", userId)
    .in("id", ingredientIds);

  if (e3) throw new Error(e3.message);

  const ingMap = new Map<string, { name: string; supplier: string }>();
  for (const i of (ingredients ?? []) as Array<{id: string; name: string; supplier: string}>) {
    ingMap.set(i.id, { name: i.name, supplier: i.supplier });
  }

  // 5. Comparer et filtrer les hausses >= threshold
  const alerts: PriceAlert[] = [];

  for (const curr of (active ?? []) as Array<{ingredient_id: string; supplier_id: string; unit: string; unit_price: number; created_at: string}>) {
    const key = `${curr.ingredient_id}__${curr.supplier_id}`;
    const prev = prevMap.get(key);
    if (!prev) continue;
    if (prev.unit !== curr.unit) continue; // unités différentes, pas comparable

    const changePct = (curr.unit_price - prev.unit_price) / prev.unit_price;
    if (changePct < threshold) continue;

    const ing = ingMap.get(curr.ingredient_id);

    alerts.push({
      ingredient_id: curr.ingredient_id,
      ingredient_name: ing?.name ?? curr.ingredient_id,
      supplier_name: ing?.supplier ?? "—",
      old_price: prev.unit_price,
      new_price: curr.unit_price,
      unit: curr.unit,
      change_pct: changePct,
      new_offer_date: curr.created_at,
    });
  }

  // Trier par hausse décroissante
  alerts.sort((a, b) => b.change_pct - a.change_pct);

  return alerts;
}

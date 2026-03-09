import useSWR from "swr";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts, type PriceAlert } from "@/lib/priceAlerts";
import type { Ingredient, LatestOffer, Supplier } from "@/types/ingredients";

const INGREDIENT_COLS = "id,name,import_name,category,allergens,is_active,default_unit,purchase_price,purchase_unit,purchase_unit_label,purchase_unit_name,density_g_per_ml,piece_weight_g,piece_volume_ml,supplier_id,source_prep_recipe_name,source,recipe_id,status,status_note,validated_at,validated_by,cost_per_unit,cost_per_kg";

// v_latest_offers : vue indexée (1 ligne par ingrédient, fast)
const VIEW_COLS = "ingredient_id,supplier_id,unit,unit_price,pack_price,pack_total_qty,pack_unit,pack_count,pack_each_qty,pack_each_unit,density_kg_per_l,piece_weight_g";
// supplier_offers : 3 colonnes extra absentes de la vue (small secondary query)
const EXTRA_COLS = "ingredient_id,price_kind,establishment,updated_at";

type IngredientsBundle = {
  items: Ingredient[];
  suppliers: Supplier[];
  offers: LatestOffer[];
  alertMap: Map<string, PriceAlert>;
};

async function fetcher(): Promise<IngredientsBundle> {
  // Run all queries in parallel
  const [supRes, ingRes, viewRes, extraRes, userRes] = await Promise.all([
    supabase.from("suppliers").select("id,name,is_active").order("name", { ascending: true }),
    supabase.from("ingredients").select(INGREDIENT_COLS).order("name", { ascending: true }),
    // Fast indexed view — one row per ingredient
    supabase.from("v_latest_offers").select(VIEW_COLS),
    // Only the 3 extra columns not exposed by the view
    supabase.from("supplier_offers").select(EXTRA_COLS).eq("is_active", true),
    supabase.auth.getUser(),
  ]);

  if (supRes.error) throw new Error(supRes.error.message);
  if (ingRes.error) throw new Error(ingRes.error.message);
  if (viewRes.error) throw new Error(viewRes.error.message);
  // extraRes errors are non-fatal — just skip the extra columns

  // Merge: start from view rows, patch in extra columns by ingredient_id
  const extraMap = new Map<string, { price_kind?: string; establishment?: string; updated_at?: string }>();
  if (!extraRes.error) {
    for (const e of extraRes.data ?? []) {
      extraMap.set(e.ingredient_id, { price_kind: e.price_kind, establishment: e.establishment, updated_at: e.updated_at });
    }
  }
  const offers = (viewRes.data ?? []).map((row) => {
    const extra = extraMap.get(row.ingredient_id) ?? {};
    return { ...row, ...extra } as LatestOffer;
  });

  // Alerts fetched after auth (needs user.id), but still non-blocking for main data
  const alertMap = new Map<string, PriceAlert>();
  const user = userRes.data?.user;
  if (user) {
    try {
      const alerts = await fetchPriceAlerts(supabase, user.id, 0.05);
      for (const a of alerts) alertMap.set(a.ingredient_id, a);
    } catch { /* silent */ }
  }

  return {
    items: (ingRes.data ?? []) as Ingredient[],
    suppliers: (supRes.data ?? []) as Supplier[],
    offers,
    alertMap,
  };
}

export function useIngredientsData() {
  const { data, error, isLoading, mutate } = useSWR<IngredientsBundle>(
    "ingredients-index",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000, // don't refetch within 30s
    },
  );

  return {
    items: data?.items ?? [],
    suppliers: data?.suppliers ?? [],
    offers: data?.offers ?? [],
    alertMap: data?.alertMap ?? new Map<string, PriceAlert>(),
    loading: isLoading,
    error,
    mutate,
  };
}

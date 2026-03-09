import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts, type PriceAlert } from "@/lib/priceAlerts";
import type { Ingredient, LatestOffer, Supplier } from "@/types/ingredients";

const PAGE_SIZE = 100;

const INGREDIENT_COLS =
  "id,name,import_name,category,allergens,is_active,default_unit,purchase_price,purchase_unit,purchase_unit_label,purchase_unit_name,density_g_per_ml,piece_weight_g,piece_volume_ml,supplier_id,source_prep_recipe_name,source,recipe_id,status,status_note,validated_at,validated_by,cost_per_unit,cost_per_kg";

const VIEW_COLS =
  "ingredient_id,supplier_id,unit,unit_price,pack_price,pack_total_qty,pack_unit,pack_count,pack_each_qty,pack_each_unit,density_kg_per_l,piece_weight_g";

async function fetchOffersForIds(ids: string[]): Promise<LatestOffer[]> {
  if (ids.length === 0) return [];

  const [viewRes, extraRes] = await Promise.all([
    supabase.from("v_latest_offers").select(VIEW_COLS).in("ingredient_id", ids),
    supabase
      .from("supplier_offers")
      .select("ingredient_id,price_kind,establishment,updated_at")
      .eq("is_active", true)
      .in("ingredient_id", ids)
      .order("updated_at", { ascending: false }),
  ]);

  // Build extra map: only first row per ingredient_id (latest, due to DESC order)
  const extraMap = new Map<string, { price_kind?: string; establishment?: string; updated_at?: string }>();
  for (const e of extraRes.data ?? []) {
    if (!extraMap.has(e.ingredient_id)) {
      extraMap.set(e.ingredient_id, {
        price_kind: e.price_kind,
        establishment: e.establishment,
        updated_at: e.updated_at,
      });
    }
  }

  return (viewRes.data ?? []).map((row) => ({
    ...row,
    ...(extraMap.get(row.ingredient_id) ?? {}),
  })) as LatestOffer[];
}

async function fetchPage(page: number): Promise<{ items: Ingredient[]; offers: LatestOffer[]; hasMore: boolean }> {
  const from = page * PAGE_SIZE;
  const { data, error } = await supabase
    .from("ingredients")
    .select(INGREDIENT_COLS)
    .order("name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw new Error(error.message);
  const items = (data ?? []) as Ingredient[];
  const offers = await fetchOffersForIds(items.map((i) => i.id));
  return { items, offers, hasMore: items.length === PAGE_SIZE };
}

async function searchIngredients(q: string): Promise<{ items: Ingredient[]; offers: LatestOffer[] }> {
  const { data, error } = await supabase
    .from("ingredients")
    .select(INGREDIENT_COLS)
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  const items = (data ?? []) as Ingredient[];
  const offers = await fetchOffersForIds(items.map((i) => i.id));
  return { items, offers };
}

export function useIngredientsData(searchQuery: string) {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [offers, setOffers] = useState<LatestOffer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [alertMap, setAlertMap] = useState<Map<string, PriceAlert>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const pageRef = useRef(0);
  const fetchIdRef = useRef(0);

  // Suppliers + alerts: load once (independent of pagination)
  useEffect(() => {
    supabase
      .from("suppliers")
      .select("id,name,is_active")
      .order("name", { ascending: true })
      .then(({ data, error: err }) => {
        if (!err) setSuppliers((data ?? []) as Supplier[]);
      });

    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        fetchPriceAlerts(supabase, data.user.id, 0.05)
          .then((alerts) => {
            const m = new Map<string, PriceAlert>();
            for (const a of alerts) m.set(a.ingredient_id, a);
            setAlertMap(m);
          })
          .catch(() => {});
      }
    });
  }, []);

  const doLoad = useCallback(async (q: string, fetchId: number) => {
    setLoading(true);
    setError(null);
    pageRef.current = 0;

    try {
      if (q) {
        const bundle = await searchIngredients(q);
        if (fetchIdRef.current !== fetchId) return;
        setItems(bundle.items);
        setOffers(bundle.offers);
        setHasMore(false);
      } else {
        const bundle = await fetchPage(0);
        if (fetchIdRef.current !== fetchId) return;
        setItems(bundle.items);
        setOffers(bundle.offers);
        setHasMore(bundle.hasMore);
        pageRef.current = 1;
      }
    } catch (e) {
      if (fetchIdRef.current !== fetchId) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (fetchIdRef.current === fetchId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = ++fetchIdRef.current;
    doLoad(searchQuery, id);
  }, [searchQuery, doLoad]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const bundle = await fetchPage(pageRef.current);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...bundle.items.filter((i) => !seen.has(i.id))];
      });
      setOffers((prev) => {
        const seen = new Set(prev.map((o) => o.ingredient_id));
        return [...prev, ...bundle.offers.filter((o) => !seen.has(o.ingredient_id))];
      });
      setHasMore(bundle.hasMore);
      pageRef.current += 1;
    } catch (e) {
      console.error("loadMore error:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  const mutate = useCallback(() => {
    const id = ++fetchIdRef.current;
    doLoad(searchQuery, id);
  }, [searchQuery, doLoad]);

  return {
    items,
    suppliers,
    offers,
    alertMap,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
    mutate,
  };
}

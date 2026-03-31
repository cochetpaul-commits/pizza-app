import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts, type PriceAlert } from "@/lib/priceAlerts";
import type { Ingredient, LatestOffer, Supplier } from "@/types/ingredients";

const PAGE_SIZE = 100;

/** Map establishment slugs (DB) → offer establishment keys */
function slugToOfferEstab(slug: string): string | null {
  if (slug.includes("bello")) return "bellomio";
  if (slug.includes("piccola")) return "piccola";
  return null;
}

const INGREDIENT_COLS =
  "id,name,import_name,category,allergens,is_active,default_unit,purchase_price,purchase_unit,purchase_unit_label,purchase_unit_name,density_g_per_ml,piece_weight_g,piece_volume_ml,supplier_id,source_prep_recipe_name,source,recipe_id,status,status_note,validated_at,validated_by,cost_per_unit,cost_per_kg,etablissement_id,order_unit_label,order_quantity,storage_zone,parent_ingredient_id,rendement,is_derived,establishments";

const OFFER_COLS =
  "ingredient_id,supplier_id,price_kind,unit,unit_price,pack_price,pack_total_qty,pack_unit,pack_count,pack_each_qty,pack_each_unit,density_kg_per_l,piece_weight_g,establishment,updated_at";

async function fetchOffersForIds(ids: string[], estab?: string | null): Promise<LatestOffer[]> {
  if (ids.length === 0) return [];

  // Query supplier_offers directly instead of v_latest_offers view
  // to avoid stale data from a potentially materialized view
  let query = supabase
    .from("supplier_offers")
    .select(OFFER_COLS)
    .eq("is_active", true)
    .in("ingredient_id", ids)
    .order("updated_at", { ascending: false });

  // Filter by establishment to avoid showing cross-establishment prices
  // Include NULL for legacy offers created before multi-etab migration
  if (estab) {
    query = query.or(`establishment.in.(${estab},both),establishment.is.null`);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  // Keep only the latest active offer per ingredient_id
  const seen = new Set<string>();
  const offers: LatestOffer[] = [];
  for (const row of data ?? []) {
    if (!seen.has(row.ingredient_id)) {
      seen.add(row.ingredient_id);
      offers.push(row as LatestOffer);
    }
  }

  return offers;
}

async function fetchPage(page: number, etabId?: string | null, etabSlug?: string | null): Promise<{ items: Ingredient[]; offers: LatestOffer[]; hasMore: boolean }> {
  const from = page * PAGE_SIZE;
  let query = supabase
    .from("ingredients")
    .select(INGREDIENT_COLS)
    .order("name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  // Filter: ingredient belongs to the current establishment via `establishments` array
  // OR via legacy `etablissement_id` (for ingredients not yet migrated to multi-etab)
  const myEstab = etabSlug ? slugToOfferEstab(etabSlug) : null;
  if (myEstab && etabId) {
    query = query.or(`establishments.cs.{"${myEstab}"},etablissement_id.eq.${etabId},establishments.is.null`);
  } else if (etabId) {
    query = query.eq("etablissement_id", etabId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  const items = (data ?? []) as Ingredient[];
  const offers = await fetchOffersForIds(items.map((i) => i.id), myEstab);

  return { items, offers, hasMore: items.length === PAGE_SIZE };
}

async function searchIngredients(q: string, etabId?: string | null, etabSlug?: string | null): Promise<{ items: Ingredient[]; offers: LatestOffer[] }> {
  let query = supabase
    .from("ingredients")
    .select(INGREDIENT_COLS)
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true });

  const myEstab = etabSlug ? slugToOfferEstab(etabSlug) : null;
  if (myEstab && etabId) {
    query = query.or(`establishments.cs.{"${myEstab}"},etablissement_id.eq.${etabId},establishments.is.null`);
  } else if (etabId) {
    query = query.eq("etablissement_id", etabId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  const items = (data ?? []) as Ingredient[];
  const offers = await fetchOffersForIds(items.map((i) => i.id), myEstab);

  return { items, offers };
}

export function useIngredientsData(searchQuery: string, etablissementId?: string | null, etablissementSlug?: string | null) {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [offers, setOffers] = useState<LatestOffer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierAliases, setSupplierAliases] = useState<Map<string, Set<string>>>(new Map());
  const [alertMap, setAlertMap] = useState<Map<string, PriceAlert>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const pageRef = useRef(0);
  const fetchIdRef = useRef(0);
  const etabRef = useRef(etablissementId);
  etabRef.current = etablissementId;
  const etabSlugRef = useRef(etablissementSlug);
  etabSlugRef.current = etablissementSlug;

  // Suppliers + alerts: load once (independent of pagination)
  useEffect(() => {
    const supQuery = supabase
      .from("suppliers")
      .select("id,name,is_active")
      .order("name", { ascending: true });
    // Ne PAS filtrer par etablissement_id — les ingrédients peuvent référencer
    // des fournisseurs de n'importe quel établissement (multi-etab)
    supQuery.then(({ data, error: err }) => {
        if (!err) {
          // Deduplicate suppliers by name (case+accent insensitive) — keep the first entry as canonical
          const seen = new Map<string, Supplier>();
          const aliases = new Map<string, Set<string>>();
          for (const s of (data ?? []) as Supplier[]) {
            const key = s.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
            if (!seen.has(key)) {
              seen.set(key, s);
              aliases.set(s.id, new Set([s.id]));
            } else {
              // Add this duplicate's ID to the canonical entry's alias set
              const canonical = seen.get(key)!;
              aliases.get(canonical.id)!.add(s.id);
            }
          }
          setSuppliers(Array.from(seen.values()));
          setSupplierAliases(aliases);
        }
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
  }, [etablissementId]);

  const doLoad = useCallback(async (q: string, fetchId: number) => {
    setLoading(true);
    setError(null);
    pageRef.current = 0;

    try {
      // Fetch total count (independent of pagination/search)
      const countQuery = supabase.from("ingredients").select("id", { count: "exact", head: true });
      const countEstab = etabSlugRef.current ? slugToOfferEstab(etabSlugRef.current) : null;
      if (countEstab && etabRef.current) {
        countQuery.or(`establishments.cs.{"${countEstab}"},etablissement_id.eq.${etabRef.current},establishments.is.null`);
      } else if (etabRef.current) {
        countQuery.eq("etablissement_id", etabRef.current);
      }
      countQuery.then(({ count }) => {
        if (fetchIdRef.current === fetchId) setTotalCount(count);
      });

      if (q) {
        const bundle = await searchIngredients(q, etabRef.current, etabSlugRef.current);
        if (fetchIdRef.current !== fetchId) return;
        setItems(bundle.items);
        setOffers(bundle.offers);
        setHasMore(false);
      } else {
        const bundle = await fetchPage(0, etabRef.current, etabSlugRef.current);
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
  }, [searchQuery, etablissementId, doLoad]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const bundle = await fetchPage(pageRef.current, etabRef.current, etabSlugRef.current);
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
    supplierAliases,
    offers,
    alertMap,
    loading,
    loadingMore,
    hasMore,
    totalCount,
    loadMore,
    error,
    mutate,
  };
}

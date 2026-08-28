import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts, type PriceAlert } from "@/lib/priceAlerts";
import type { Ingredient, LatestOffer, Supplier } from "@/types/ingredients";

const PAGE_SIZE = 1000;

/** Map establishment slugs (DB) → offer establishment keys */
function slugToOfferEstab(slug: string): string | null {
  if (slug.includes("bello")) return "bellomio";
  if (slug.includes("piccola")) return "piccola";
  return null;
}

const INGREDIENT_COLS =
  "id,name,import_name,popina_name,popina_dose_cl,category,sub_category,allergens,is_active,default_unit,purchase_price,purchase_unit,purchase_unit_label,purchase_unit_name,density_g_per_ml,piece_weight_g,piece_volume_ml,supplier_id,source_prep_recipe_name,source,recipe_id,status,status_note,validated_at,validated_by,cost_per_unit,cost_per_kg,etablissement_id,order_unit_label,order_quantity,storage_zone,parent_ingredient_id,rendement,is_derived,establishments,stock_min,stock_objectif,stock_max";

const OFFER_COLS =
  "ingredient_id,supplier_id,price_kind,unit,unit_price,pack_price,pack_total_qty,pack_unit,pack_count,pack_each_qty,pack_each_unit,density_kg_per_l,piece_weight_g,establishment,updated_at";

async function fetchAllActiveOffers(ids: string[]): Promise<LatestOffer[]> {
  if (ids.length === 0) return [];

  // Batch IDs to avoid URL length limits (Supabase rejects >100 IDs in .in())
  const BATCH = 80;
  const allData: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("supplier_offers")
      .select(OFFER_COLS)
      .eq("is_active", true)
      .in("ingredient_id", batch)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    allData.push(...(data ?? []));
  }

  return allData.map(r => r as LatestOffer);
}

/** Keep only the latest active offer per ingredient_id */
function pickLatestOffers(all: LatestOffer[]): LatestOffer[] {
  const seen = new Set<string>();
  const offers: LatestOffer[] = [];
  for (const r of all) {
    if (!seen.has(r.ingredient_id)) {
      seen.add(r.ingredient_id);
      offers.push(r);
    }
  }
  return offers;
}

type FetchResult = { items: Ingredient[]; offers: LatestOffer[]; allOffers: LatestOffer[]; hasMore: boolean };

async function fetchPage(page: number, etabId?: string | null, etabSlug?: string | null): Promise<FetchResult> {
  const from = page * PAGE_SIZE;
  let query = supabase
    .from("ingredients")
    .select(INGREDIENT_COLS)
    .order("name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  // Filter: ingredient belongs to the current establishment via `establishments` array only
  const myEstab = etabSlug ? slugToOfferEstab(etabSlug) : null;
  if (myEstab) {
    query = query.or(`establishments.cs.{"${myEstab}"},establishments.is.null`);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  const items = (data ?? []) as Ingredient[];
  const allOffers = await fetchAllActiveOffers(items.map((i) => i.id));
  const offers = pickLatestOffers(allOffers);

  return { items, offers, allOffers, hasMore: items.length === PAGE_SIZE };
}

async function searchIngredients(q: string, etabId?: string | null, etabSlug?: string | null): Promise<{ items: Ingredient[]; offers: LatestOffer[]; allOffers: LatestOffer[] }> {
  // RPC recherche_ingredients : insensible aux accents/casse/ponctuation
  // et à l'ordre des mots — le ilike brut ratait « CÔTES DE VEAU » pour
  // « cotes veau » et « SU'ENTU » pour « suentu ».
  let query = supabase
    .rpc("recherche_ingredients", { q })
    .select(INGREDIENT_COLS)
    .order("name", { ascending: true });

  const myEstab = etabSlug ? slugToOfferEstab(etabSlug) : null;
  if (myEstab) {
    query = query.or(`establishments.cs.{"${myEstab}"},establishments.is.null`);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  const items = (data ?? []) as Ingredient[];
  const allOffers = await fetchAllActiveOffers(items.map((i) => i.id));
  const offers = pickLatestOffers(allOffers);

  return { items, offers, allOffers };
}

export function useIngredientsData(searchQuery: string, etablissementId?: string | null, etablissementSlug?: string | null) {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [offers, setOffers] = useState<LatestOffer[]>([]);
  const [allOffers, setAllOffers] = useState<LatestOffer[]>([]);
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
  const loadingRef = useRef(false); // un chargement principal est en cours
  const queryRef = useRef("");     // recherche en cours ("" = liste complète paginée)
  const etabRef = useRef(etablissementId);
  etabRef.current = etablissementId;
  const etabSlugRef = useRef(etablissementSlug);
  etabSlugRef.current = etablissementSlug;

  // Suppliers + alerts: load once, filtered by establishment
  useEffect(() => {
    // Tous les établissements : un même nom de fournisseur (ex. Carniato chez
    // Bello Mio ET Piccola Mia) = une seule entrée dont les alias couvrent les
    // deux fiches — sinon les produits rattachés à la fiche de l'autre resto
    // n'apparaissaient pas dans le filtre fournisseur.
    supabase
      .from("suppliers")
      .select("id,name,is_active,etablissement_id")
      .order("name", { ascending: true })
      .then(({ data, error: err }) => {
        if (!err) {
          type SupRow = Supplier & { etablissement_id?: string | null };
          const byName = new Map<string, SupRow[]>();
          for (const s of (data ?? []) as SupRow[]) {
            const key = s.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
            const arr = byName.get(key) ?? [];
            arr.push(s);
            byName.set(key, arr);
          }
          const list: Supplier[] = [];
          const aliases = new Map<string, Set<string>>();
          for (const rows of byName.values()) {
            if (etablissementId && !rows.some(r => r.etablissement_id === etablissementId)) continue;
            const canonical = (etablissementId ? rows.find(r => r.etablissement_id === etablissementId) : null) ?? rows[0];
            aliases.set(canonical.id, new Set(rows.map(r => r.id)));
            list.push(canonical);
          }
          list.sort((a, b) => a.name.localeCompare(b.name, "fr"));
          setSuppliers(list);
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
    loadingRef.current = true;
    queryRef.current = q;
    setError(null);
    pageRef.current = 0;
    // Pendant une recherche il n'y a plus de pages à charger : sinon le
    // sentinel (visible dès que la liste se réduit) relançait fetchPage(0)
    // et ajoutait toute la base par-dessus les résultats.
    setHasMore(false);

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
        setAllOffers(bundle.allOffers);
        setHasMore(false);
      } else {
        const bundle = await fetchPage(0, etabRef.current, etabSlugRef.current);
        if (fetchIdRef.current !== fetchId) return;
        setItems(bundle.items);
        setOffers(bundle.offers);
        setAllOffers(bundle.allOffers);
        setHasMore(bundle.hasMore);
        pageRef.current = 1;
      }
    } catch (e) {
      if (fetchIdRef.current !== fetchId) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (fetchIdRef.current === fetchId) { setLoading(false); loadingRef.current = false; }
    }
  }, []);

  useEffect(() => {
    const id = ++fetchIdRef.current;
    doLoad(searchQuery, id);
  }, [searchQuery, etablissementId, doLoad]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    if (loadingRef.current || queryRef.current) return; // chargement en cours ou recherche active
    // Jeton : si une recherche ou un rechargement démarre pendant ce fetch,
    // on jette le résultat — sinon une page entière de produits venait
    // s'ajouter par-dessus les résultats de recherche.
    const fetchId = fetchIdRef.current;
    setLoadingMore(true);
    try {
      const bundle = await fetchPage(pageRef.current, etabRef.current, etabSlugRef.current);
      if (fetchIdRef.current !== fetchId) return;
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...bundle.items.filter((i) => !seen.has(i.id))];
      });
      setOffers((prev) => {
        const seen = new Set(prev.map((o) => o.ingredient_id));
        return [...prev, ...bundle.offers.filter((o) => !seen.has(o.ingredient_id))];
      });
      setAllOffers((prev) => [...prev, ...bundle.allOffers]);
      setHasMore(bundle.hasMore);
      pageRef.current += 1;
    } catch (e) {
      console.error("loadMore error:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  const mutate = useCallback(async () => {
    const id = ++fetchIdRef.current;
    await doLoad(searchQuery, id);
  }, [searchQuery, doLoad]);

  /** Reload a single ingredient + its offer without refetching the whole list */
  const mutateOne = useCallback(async (ingredientId: string) => {
    const { data: row, error: err } = await supabase
      .from("ingredients")
      .select(INGREDIENT_COLS)
      .eq("id", ingredientId)
      .single();
    if (err || !row) {
      // Ingredient deleted or error — fall back to full reload
      const id = ++fetchIdRef.current;
      await doLoad(searchQuery, id);
      return;
    }
    const updated = row as Ingredient;
    const newAllOffers = await fetchAllActiveOffers([ingredientId]);
    const newOffers = pickLatestOffers(newAllOffers);

    setItems((prev) => prev.map((i) => (i.id === ingredientId ? updated : i)));
    setOffers((prev) => {
      const without = prev.filter((o) => o.ingredient_id !== ingredientId);
      return newOffers.length > 0 ? [...without, ...newOffers] : without;
    });
    setAllOffers((prev) => {
      const without = prev.filter((o) => o.ingredient_id !== ingredientId);
      return [...without, ...newAllOffers];
    });
  }, [searchQuery, doLoad]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setOffers((prev) => prev.filter((o) => o.ingredient_id !== id));
    setAllOffers((prev) => prev.filter((o) => o.ingredient_id !== id));
  }, []);

  return {
    items,
    suppliers,
    supplierAliases,
    offers,
    allOffers,
    alertMap,
    loading,
    loadingMore,
    hasMore,
    totalCount,
    loadMore,
    error,
    mutate,
    mutateOne,
    removeItem,
  };
}

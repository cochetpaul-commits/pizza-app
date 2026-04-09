"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { RequireRole } from "@/components/RequireRole";
import { StepperInput } from "@/components/StepperInput";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import { useEtablissement } from "@/lib/EtablissementContext";
import { IngredientAvatar } from "@/components/IngredientAvatar";
import type { Category } from "@/types/ingredients";
import { FloatingActions, FAIconPdf, FAIconMail, FAIconTrash, FAIconCheck, FAIconPause } from "@/components/layout/FloatingActions";
import type { FloatingAction } from "@/components/layout/FloatingActions";
import { BottomSheet } from "@/components/layout/BottomSheet";

// ── Types ────────────────────────────────────────────────────────────────────

type DeliveryRule = { day: string; cutoff: string; delivery_day: string };
type Supplier = { id: string; name: string; franco_minimum: number | null; delivery_schedule: DeliveryRule[] | null };

type Ligne = {
  id: string;
  ingredient_id: string | null;
  quantite: number;
  unite: string | null;
  prix_unitaire_ht: number | null;
  total_ligne_ht: number | null;
  ingredients?: { name: string; category: string | null; default_unit: string | null } | null;
};


type Session = {
  id: string;
  supplier_id: string;
  status: string;
  notes: string | null;
  total_ht: number;
  created_at: string;
  lignes: Ligne[];
};

type CatalogItem = {
  id: string;
  name: string;
  category: string | null;
  default_unit: string | null;
  order_unit: string | null;
  order_unit_label: string | null;
  order_quantity: number | null;
  prix_commande: number | null;
  favori_commande?: boolean;
  pack_count: number | null;
  pack_each_qty: number | null;
};

type HistItem = {
  id: string;
  status: string;
  created_at: string;
  total_ht: number;
  nb_articles: number;
};

// ── Catégories ordonnées ─────────────────────────────────────────────────────

const CAT_ORDER = [
  "cremerie_fromage", "charcuterie_viande", "maree",
  "legumes_herbes", "fruit", "epicerie_salee", "epicerie_sucree",
  "alcool_spiritueux", "boisson", "preparation", "sauce",
  "antipasti", "emballage", "autre",
];

function catLabel(cat: string | null): string {
  const map: Record<string, string> = {
    cremerie_fromage: "CRÉMERIE / FROMAGE",
    charcuterie_viande: "CHARCUTERIE / VIANDE",
    maree: "MARÉE",
    alcool_spiritueux: "ALCOOL / SPIRITUEUX",
    boisson: "BOISSONS",
    legumes_herbes: "LÉGUMES / HERBES",
    fruit: "FRUITS",
    epicerie_salee: "ÉPICERIE SALÉE",
    epicerie_sucree: "ÉPICERIE SUCRÉE",
    preparation: "PRÉPARATION",
    sauce: "SAUCE",
    antipasti: "ANTIPASTI",
    emballage: "EMBALLAGE",
    autre: "AUTRE",
  };
  return map[cat ?? "autre"] ?? (cat?.toUpperCase() ?? "AUTRE");
}

const CAT_COLORS: Record<string, string> = {
  cremerie_fromage: "#D97706",
  charcuterie_viande: "#DC2626",
  maree: "#0284C7",
  alcool_spiritueux: "#7C3AED",
  boisson: "#0D9488",
  legumes_herbes: "#16A34A",
  fruit: "#EA580C",
  epicerie_salee: "#1E40AF",
  epicerie_sucree: "#92400E",
  preparation: "#C026D3",
  sauce: "#9D174D",
  antipasti: "#CA8A04",
  emballage: "#78716C",
  autre: "#6B7280",
};

function catIndex(cat: string | null): number {
  const idx = CAT_ORDER.indexOf(cat ?? "autre");
  return idx === -1 ? 999 : idx;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const tile: React.CSSProperties = {
  background: "#fff",
  padding: "8px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  borderBottom: "1px solid #f0ebe2",
};

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "11px 16px",
  border: "none",
  background: "transparent",
  color: "#1a1a1a",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  textAlign: "left",
  cursor: "pointer",
  borderBottom: "1px solid rgba(0,0,0,0.04)",
};


// ── Helpers ──────────────────────────────────────────────────────────────────

function groupCatalog(items: CatalogItem[]): Record<string, { favoris: CatalogItem[]; others: CatalogItem[] }> {
  const result: Record<string, { favoris: CatalogItem[]; others: CatalogItem[] }> = {};
  for (const item of items) {
    const cat = item.category ?? "autre";
    if (!result[cat]) result[cat] = { favoris: [], others: [] };
    if (item.favori_commande) {
      result[cat].favoris.push(item);
    } else {
      result[cat].others.push(item);
    }
  }
  for (const cat of Object.keys(result)) {
    result[cat].favoris.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    result[cat].others.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }
  return result;
}

function starBtnStyle(isFav: boolean): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 15,
    padding: 0,
    lineHeight: 1,
    opacity: isFav ? 1 : 0.25,
    filter: isFav ? "none" : "grayscale(100%)",
    flexShrink: 0,
  };
}

type OfferRow = {
  price_kind: string | null;
  unit: string | null;
  unit_price: number | null;
  pack_price: number | null;
  pack_unit: string | null;
  pack_count: number | null;
  pack_each_qty: number | null;
  pack_each_unit: string | null;
  pack_total_qty: number | null;
};

/** Derive a human-friendly ordering unit label from supplier_offers data */
function deriveOrderUnit(offer: OfferRow | null): string | null {
  if (!offer) return null;
  if (offer.pack_count && offer.pack_each_qty && offer.pack_each_unit) {
    return `${offer.pack_count}×${offer.pack_each_qty}${offer.pack_each_unit}`;
  }
  if (offer.pack_total_qty && offer.pack_unit) {
    return `${offer.pack_total_qty}${offer.pack_unit}`;
  }
  if (offer.unit) return offer.unit;
  return null;
}

/** Compute the price for one "order unit".
 *  If order_quantity is set (e.g. 2.5 for "bac 2.5kg"), multiply unit_price × order_quantity.
 *  Otherwise fall back to pack_price or unit_price from the offer.
 */
function computeOrderUnitPrice(offer: OfferRow | null, orderQty: number | null): number | null {
  if (!offer) return null;
  const kind = offer.price_kind ?? "unit";

  // If the ingredient has an explicit order_quantity, use unit_price × quantity
  if (orderQty && orderQty > 0 && offer.unit_price) {
    return offer.unit_price * orderQty;
  }

  if (kind === "pack_composed") {
    if (offer.pack_price) return offer.pack_price;
    if (offer.unit_price && offer.pack_count && offer.pack_each_qty) {
      return offer.unit_price * offer.pack_count * offer.pack_each_qty;
    }
    return null;
  }

  if (kind === "pack_simple") {
    if (offer.pack_price) return offer.pack_price;
    if (offer.unit_price && offer.pack_total_qty) {
      return offer.unit_price * offer.pack_total_qty;
    }
    return null;
  }

  // Unit pricing: only return unit_price if unit is "pc" (pièce = on commande à l'unité)
  // For kg/L, unit_price is a rate (€/kg, €/L) — sans order_quantity on ne peut pas
  // calculer le prix réel de la commande
  if (offer.unit === "pc") return offer.unit_price ?? null;
  return null;
}

// ── Supplier color from name (deterministic) ────────────────────────────────
const SUPPLIER_COLORS = [
  "#D4775A", "#4a6741", "#2563EB", "#7C3AED", "#D97706",
  "#0D9488", "#DC2626", "#0284C7", "#C026D3", "#EA580C",
  "#16A34A", "#9D174D", "#1E40AF", "#92400E",
];
function supplierColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return SUPPLIER_COLORS[Math.abs(h) % SUPPLIER_COLORS.length];
}

// ── Status config ────────────────────────────────────────────────────────────

const statusLabel: Record<string, string> = {
  brouillon: "Brouillon",
  en_attente: "En attente de validation",
  validee: "Validée",
  recue: "Reçue",
  annulee: "Annulée",
};

const statusColor: Record<string, string> = {
  brouillon: "#A0845C",
  en_attente: "#2563EB",
  validee: "#4a6741",
  recue: "#16a34a",
  annulee: "#999",
};

const statusBannerBg: Record<string, string> = {
  brouillon: "#FFF8F0",
  en_attente: "#EFF6FF",
  validee: "#e8ede6",
  recue: "#e8ede6",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function CommandesPageWrapper() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>}>
      <CommandesPage />
    </Suspense>
  );
}

function CommandesPage() {
  const { current: etab } = useEtablissement();
  const searchParams = useSearchParams();

  // All suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierAliases, setSupplierAliases] = useState<Map<string, Set<string>>>(new Map());
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [draftSupplierIds, setDraftSupplierIds] = useState<Set<string>>(new Set());

  // Current supplier state
  const [session, setSession] = useState<Session | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number | "">>({});
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");

  // Unit mode: carton vs individual (per ingredient)
  const [unitModes, setUnitModes] = useState<Record<string, "individual" | "carton">>({});

  // Confirmation banner
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Email sending state
  const [sendingEmail, setSendingEmail] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Historique
  const [histOpen, setHistOpen] = useState(false);
  const [historique, setHistorique] = useState<HistItem[]>([]);

  // Global recent orders for dashboard
  const [recentOrders, setRecentOrders] = useState<{
    id: string; supplier_name: string; status: string;
    created_at: string; total_ht: number;
  }[]>([]);

  // Pending receptions (validated orders awaiting reception)
  const [pendingReceptions, setPendingReceptions] = useState<{
    id: string; supplier_id: string; supplier_name: string;
    created_at: string; nb_articles: number; total_ht: number;
  }[]>([]);

  // Active sessions across all suppliers (brouillon + en_attente)
  const [activeSessions, setActiveSessions] = useState<{
    id: string; supplier_id: string; supplier_name: string;
    status: string; created_at: string; nb_articles: number; total_ht: number;
  }[]>([]);

  // Loading
  const [loading, setLoading] = useState(true);
  const [loadingSupplier, setLoadingSupplier] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);

  // ── Load all suppliers ──────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      // Load ALL suppliers (not filtered by etablissement) so we can build aliases
      const { data } = await supabase
        .from("suppliers")
        .select("id, name, franco_minimum, delivery_schedule")
        .eq("is_active", true)
        .order("name");
      // Deduplicate by name (accent+case insensitive) with alias tracking
      const seen = new Map<string, Supplier>();
      const aliases = new Map<string, Set<string>>();
      for (const s of (data ?? []) as Supplier[]) {
        const key = s.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, s);
          aliases.set(s.id, new Set([s.id]));
        } else {
          const canonical = seen.get(key)!;
          aliases.get(canonical.id)!.add(s.id);
        }
      }
      const list = Array.from(seen.values());

      // Load draft sessions with at least 1 ligne to show pastilles
      if (etab?.id) {
        const { data: drafts } = await supabase
          .from("commande_sessions")
          .select("supplier_id, commande_lignes(count)")
          .eq("etablissement_id", etab.id)
          .eq("status", "brouillon");
        const draftIds = new Set(
          (drafts ?? [])
            .filter((d: { supplier_id: string; commande_lignes: { count: number }[] }) =>
              d.commande_lignes?.[0]?.count > 0)
            .map((d: { supplier_id: string }) => d.supplier_id),
        );
        const canonicalDraftIds = new Set<string>();
        for (const did of draftIds) {
          let found = false;
          for (const [canonical, aliasSet] of aliases.entries()) {
            if (aliasSet.has(did)) { canonicalDraftIds.add(canonical); found = true; break; }
          }
          if (!found) canonicalDraftIds.add(did);
        }
        setDraftSupplierIds(canonicalDraftIds);
        list.sort((a, b) => {
          const aHas = canonicalDraftIds.has(a.id) ? 0 : 1;
          const bHas = canonicalDraftIds.has(b.id) ? 0 : 1;
          if (aHas !== bHas) return aHas - bHas;
          return a.name.localeCompare(b.name, "fr");
        });

        // Load pending receptions (validated orders)
        const { data: validees } = await supabase
          .from("commande_sessions")
          .select("id, supplier_id, created_at, total_ht, commande_lignes(count)")
          .eq("etablissement_id", etab.id)
          .eq("status", "validee")
          .order("created_at", { ascending: false });
        const supplierMap = new Map(list.map((s) => [s.id, s.name]));
        // Also map alias IDs to canonical names
        for (const [canonical, aliasSet] of aliases.entries()) {
          const name = supplierMap.get(canonical);
          if (name) for (const aid of aliasSet) supplierMap.set(aid, name);
        }
        setPendingReceptions(
          (validees ?? []).map((v: { id: string; supplier_id: string; created_at: string; total_ht: number; commande_lignes: { count: number }[] }) => ({
            id: v.id,
            supplier_id: v.supplier_id,
            supplier_name: supplierMap.get(v.supplier_id) ?? "Fournisseur",
            created_at: v.created_at,
            nb_articles: v.commande_lignes?.[0]?.count ?? 0,
            total_ht: v.total_ht ?? 0,
          }))
        );

        // Load active sessions (brouillon + en_attente) across all suppliers
        const { data: actives } = await supabase
          .from("commande_sessions")
          .select("id, supplier_id, status, created_at, total_ht, commande_lignes(count)")
          .eq("etablissement_id", etab.id)
          .in("status", ["brouillon", "en_attente"])
          .order("created_at", { ascending: false });
        setActiveSessions(
          (actives ?? [])
            .filter((a: { commande_lignes: { count: number }[] }) => a.commande_lignes?.[0]?.count > 0)
            .map((a: { id: string; supplier_id: string; status: string; created_at: string; total_ht: number; commande_lignes: { count: number }[] }) => ({
              id: a.id,
              supplier_id: a.supplier_id,
              supplier_name: supplierMap.get(a.supplier_id) ?? "Fournisseur",
              status: a.status,
              created_at: a.created_at,
              nb_articles: a.commande_lignes?.[0]?.count ?? 0,
              total_ht: a.total_ht ?? 0,
            }))
        );

        // Load recent orders (recue) for dashboard historique
        const { data: recentData } = await supabase
          .from("commande_sessions")
          .select("id, supplier_id, status, created_at, total_ht")
          .eq("etablissement_id", etab.id)
          .eq("status", "recue")
          .order("created_at", { ascending: false })
          .limit(8);
        setRecentOrders(
          (recentData ?? []).map((r: { id: string; supplier_id: string; status: string; created_at: string; total_ht: number }) => ({
            id: r.id,
            supplier_name: supplierMap.get(r.supplier_id) ?? "Fournisseur",
            status: r.status,
            created_at: r.created_at,
            total_ht: r.total_ht ?? 0,
          }))
        );
      }

      setSuppliers(list);
      setSupplierAliases(aliases);
      // Pre-select from URL param only — otherwise show placeholder "Fournisseur"
      const urlSupplierId = searchParams.get("supplier_id");
      if (urlSupplierId && list.some((s) => s.id === urlSupplierId)) {
        setSelectedSupplierId(urlSupplierId);
      }
      setLoading(false);
    }
    init();
  }, [etab?.id, searchParams]);

  // ── Load session + catalog when supplier changes ──────────────────────

  const loadForSupplier = useCallback(async (supplierId: string) => {
    setLoadingSupplier(true);
    setHistOpen(false);

    // Load active session via API
    const res = await fetchApi(`/api/commandes/active?supplier_id=${supplierId}`);
    const data = await res.json();
    const sess = data.session as Session | null;
    setSession(sess);

    // Apply quantities + notes from session
    setNotes(sess?.notes ?? "");
    if (sess?.lignes) {
      const q: Record<string, number | ""> = {};
      for (const l of sess.lignes) {
        if (l.ingredient_id) q[l.ingredient_id] = l.quantite;
      }
      setQuantities(q);
    } else {
      setQuantities({});
    }

    // Load catalog: ingredients linked to this supplier (via offers or supplier_id)
    // Use all alias IDs for this supplier (handles duplicates across establishments)
    const aliasIds = supplierAliases.get(supplierId);
    const supplierIds = aliasIds ? Array.from(aliasIds) : [supplierId];
    const etabKey = etab?.slug?.includes("bello") ? "bellomio" : etab?.slug?.includes("piccola") ? "piccola" : null;

    // Fetch offers for ALL alias IDs of this supplier
    const offerMap = new Map<string, { ingredient_id: string; price_kind: string | null; unit: string | null; unit_price: number | null; pack_price: number | null; pack_unit: string | null; pack_count: number | null; pack_each_qty: number | null; pack_each_unit: string | null; pack_total_qty: number | null; establishment: string | null }>();
    const offerIngIds: string[] = [];
    for (const sid of supplierIds) {
      const { data: offerData, error: offerErr } = await supabase
        .from("supplier_offers")
        .select("ingredient_id, price_kind, unit, unit_price, pack_price, pack_unit, pack_count, pack_each_qty, pack_each_unit, pack_total_qty, establishment")
        .eq("supplier_id", sid)
        .eq("is_active", true);
      if (offerErr) console.error("[commandes] offers query error:", offerErr.message);
      for (const o of offerData ?? []) {
        if (o.ingredient_id && !offerMap.has(o.ingredient_id)) {
          offerIngIds.push(o.ingredient_id);
          offerMap.set(o.ingredient_id, o);
        }
      }
    }

    // Fetch ingredients directly linked to any alias supplier_id
    const directIds: string[] = [];
    for (const sid of supplierIds) {
      let directIngQ = supabase
        .from("ingredients")
        .select("id")
        .eq("supplier_id", sid);
      if (etabKey) directIngQ = directIngQ.or(`establishments.cs.{"${etabKey}"},establishments.is.null`);
      const { data: directIngs, error: directErr } = await directIngQ;
      if (directErr) console.error("[commandes] direct ingredients query error:", directErr.message);
      for (const i of directIngs ?? []) directIds.push((i as { id: string }).id);
    }

    const allIds = [...new Set([...offerIngIds, ...directIds])];

    let items: CatalogItem[] = [];
    if (allIds.length > 0) {
      // Try with favori_commande, fallback without if column doesn't exist
      const selectCols = "id, name, category, default_unit, favori_commande, order_unit_label, order_quantity";
      let ingDataQ = supabase
        .from("ingredients")
        .select(selectCols)
        .in("id", allIds)
        .order("category")
        .order("name");
      if (etabKey) ingDataQ = ingDataQ.or(`establishments.cs.{"${etabKey}"},establishments.is.null`);
      let { data: ingData, error: ingErr } = await ingDataQ;

      // Fallback: retry without favori_commande if the column doesn't exist yet
      if (ingErr) {
        console.warn("[commandes] ingredient query error, retrying without favori_commande:", ingErr.message);
        let fallbackQ = supabase
          .from("ingredients")
          .select("id, name, category, default_unit, order_unit_label, order_quantity")
          .in("id", allIds)
          .order("category")
          .order("name");
        if (etabKey) fallbackQ = fallbackQ.or(`establishments.cs.{"${etabKey}"},establishments.is.null`);
        const fallback = await fallbackQ;
        ingData = (fallback.data ?? []).map((r) => ({ ...r, favori_commande: false })) as typeof ingData;
        ingErr = fallback.error;
      }

      if (ingErr) console.error("[commandes] ingredient query error:", ingErr.message);

      items = (ingData ?? []).map((ing: { id: string; name: string; category: string | null; default_unit: string | null; favori_commande?: boolean; order_unit_label?: string | null; order_quantity?: number | null }) => {
        const offer = (offerMap.get(ing.id) ?? null) as OfferRow | null;
        const oq = ing.order_quantity ?? null;
        return {
          ...ing,
          favori_commande: ing.favori_commande ?? false,
          order_unit_label: ing.order_unit_label ?? null,
          order_quantity: oq,
          order_unit: ing.order_unit_label ?? deriveOrderUnit(offer) ?? ing.default_unit,
          prix_commande: computeOrderUnitPrice(offer, oq),
          pack_count: offer?.pack_count ?? null,
          pack_each_qty: offer?.pack_each_qty ?? null,
        };
      });
    }
    setCatalog(items);
    setLoadingSupplier(false);
  }, [etab, supplierAliases]);

  useEffect(() => {
    if (selectedSupplierId) {
      void loadForSupplier(selectedSupplierId);
      // Pre-load historique for KPI card
      void (async () => {
        const aliasIds = supplierAliases.get(selectedSupplierId);
        const ids = aliasIds ? Array.from(aliasIds) : [selectedSupplierId];
        const allHist: HistItem[] = [];
        for (const sid of ids) {
          const res = await fetchApi(`/api/commandes/historique?supplier_id=${sid}&limit=10`);
          const data = await res.json();
          allHist.push(...(data.historique ?? []));
        }
        allHist.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setHistorique(allHist.slice(0, 10));
      })();
    }
  }, [selectedSupplierId, loadForSupplier, supplierAliases]);

  // ── Set accordion defaults ────────────────────────────────────────────

  useEffect(() => {
    if (!catalog.length) return;
    const opens: Record<string, boolean> = {};
    const g = groupCatalog(catalog);
    for (const cat of Object.keys(g)) {
      const hasFav = g[cat].favoris.length > 0;
      const hasSel = [...g[cat].favoris, ...g[cat].others].some((i) => Number(quantities[i.id] ?? 0) > 0);
      opens[cat] = hasFav || hasSel;
    }
    setOpenCats(opens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, session?.id]);

  // ── Create session ────────────────────────────────────────────────────

  // ── Save ligne ────────────────────────────────────────────────────────

  async function saveLigne(sessionId: string, ingredientId: string, qty: number | "", unite: string | null, prixUnitaire: number | null) {
    await fetchApi("/api/commandes/ligne", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        ingredient_id: ingredientId,
        quantite: qty === "" ? 0 : Math.floor(qty as number),
        unite: unite ?? undefined,
        prix_unitaire_ht: prixUnitaire ?? undefined,
      }),
    });
  }

  async function handleQtyChange(ingredientId: string, val: number | "") {
    const qty = val === "" ? "" : Math.floor(val as number);
    const item = catalog.find((c) => c.id === ingredientId);
    const mode = unitModes[ingredientId] ?? "individual";
    const packCount = item?.pack_count ?? 0;
    const actualQty = (mode === "carton" && packCount > 0 && qty !== "")
      ? qty * packCount
      : qty;
    setQuantities((prev) => ({ ...prev, [ingredientId]: actualQty }));

    // Auto-create session on first qty > 0
    let sid = session?.id;
    if (!sid && actualQty !== "" && Number(actualQty) > 0 && selectedSupplierId && !creatingSession) {
      setCreatingSession(true);
      try {
        const res = await fetchApi("/api/commandes/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supplier_id: selectedSupplierId }),
        });
        const data = await res.json();
        if (data.session) {
          const newSess = { ...data.session, lignes: [] } as Session;
          setSession(newSess);
          sid = newSess.id;
          setDraftSupplierIds((prev) => new Set([...prev, selectedSupplierId!]));
        }
      } finally {
        setCreatingSession(false);
      }
    }

    if (sid) {
      saveLigne(sid, ingredientId, actualQty, item?.order_unit ?? item?.default_unit ?? null, item?.prix_commande ?? null);
    }
  }

  /** Get displayed quantity (reverse of carton multiplication) */
  function getDisplayQty(ingredientId: string): number | "" {
    const raw = quantities[ingredientId] ?? "";
    if (raw === "") return "";
    const mode = unitModes[ingredientId] ?? "individual";
    const item = catalog.find((c) => c.id === ingredientId);
    const packCount = item?.pack_count ?? 0;
    if (mode === "carton" && packCount > 0) {
      return Math.round(Number(raw) / packCount);
    }
    return Number(raw);
  }

  /** Toggle unit mode for an item */
  function toggleUnitMode(ingredientId: string) {
    const item = catalog.find((c) => c.id === ingredientId);
    const packCount = item?.pack_count ?? 0;
    if (packCount <= 0) return;

    const currentMode = unitModes[ingredientId] ?? "individual";
    const newMode = currentMode === "individual" ? "carton" : "individual";
    const currentRawQty = Number(quantities[ingredientId] ?? 0);

    setUnitModes((prev) => ({ ...prev, [ingredientId]: newMode }));

    // Recalculate stored quantity
    if (currentRawQty > 0) {
      let newRaw: number;
      if (newMode === "carton") {
        // Was individual -> now carton: stored qty stays the same (already in individual units)
        // But we need to round to nearest carton
        newRaw = Math.round(currentRawQty / packCount) * packCount;
      } else {
        // Was carton -> now individual: stored qty stays the same
        newRaw = currentRawQty;
      }
      setQuantities((prev) => ({ ...prev, [ingredientId]: newRaw }));
      if (session) {
        saveLigne(session.id, ingredientId, newRaw, item?.order_unit ?? item?.default_unit ?? null, item?.prix_commande ?? null);
      }
    }
  }

  // ── Toggle favorite ───────────────────────────────────────────────────

  async function toggleFavori(ingredientId: string, currentVal: boolean) {
    setCatalog((prev) =>
      prev.map((i) => (i.id === ingredientId ? { ...i, favori_commande: !currentVal } : i))
    );
    try {
      const res = await fetchApi("/api/commandes/favori", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredient_id: ingredientId, favori: !currentVal }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
    } catch {
      setCatalog((prev) =>
        prev.map((i) => (i.id === ingredientId ? { ...i, favori_commande: currentVal } : i))
      );
    }
  }

  // ── Status transitions ────────────────────────────────────────────────

  async function reloadSession() {
    if (!selectedSupplierId) return;
    await loadForSupplier(selectedSupplierId);
  }

  async function validerSession(sessionId: string) {
    setSaving(true);
    // Save notes before validating
    await fetchApi("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "validee", notes: notes.trim() || undefined }),
    });
    await reloadSession();
    setSaving(false);
    setDraftSupplierIds((prev) => { const next = new Set(prev); if (selectedSupplierId) next.delete(selectedSupplierId); return next; });
    setConfirmation("Commande validee");
    setTimeout(() => setConfirmation(null), 4000);
  }

  async function retourBrouillon(sessionId: string) {
    setSaving(true);
    await fetchApi("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "brouillon" }),
    });
    await reloadSession();
    setSaving(false);
    if (selectedSupplierId) setDraftSupplierIds((prev) => new Set([...prev, selectedSupplierId]));
    setConfirmation("Commande renvoyee en brouillon");
    setTimeout(() => setConfirmation(null), 4000);
  }

  async function recevoirSession(sessionId: string) {
    setSaving(true);
    await fetchApi("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "recue" }),
    });
    await reloadSession();
    setSaving(false);
    setConfirmation("Commande marquée comme reçue");
    setTimeout(() => setConfirmation(null), 4000);
  }

  async function recevoirPending(sessionId: string) {
    setSaving(true);
    await fetchApi("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "recue" }),
    });
    setPendingReceptions((prev) => prev.filter((r) => r.id !== sessionId));
    // If this was the currently viewed session, reload it
    if (session?.id === sessionId) await reloadSession();
    setSaving(false);
    setConfirmation("Commande marquee comme recue");
    setTimeout(() => setConfirmation(null), 4000);
  }

  async function downloadPdfById(sessionId: string, supplierName: string) {
    const res = await fetchApi(`/api/commandes/pdf?session_id=${sessionId}`);
    if (!res.ok) { alert("Erreur lors de la generation du PDF"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commande-${supplierName.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function validerActiveSession(sessionId: string) {
    setSaving(true);
    await fetchApi("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "validee" }),
    });
    // Move from activeSessions to pendingReceptions
    const sess = activeSessions.find((s) => s.id === sessionId);
    if (sess) {
      setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setPendingReceptions((prev) => [{ ...sess, status: "validee" }, ...prev]);
    }
    // Remove from draft supplier ids
    if (sess) {
      setDraftSupplierIds((prev) => {
        const next = new Set(prev);
        // Only remove if no other active session for this supplier
        const otherDraft = activeSessions.some((s) => s.id !== sessionId && s.supplier_id === sess.supplier_id && s.status === "brouillon");
        if (!otherDraft) next.delete(sess.supplier_id);
        return next;
      });
    }
    if (session?.id === sessionId) await reloadSession();
    setSaving(false);
    setConfirmation("Commande validee");
    setTimeout(() => setConfirmation(null), 4000);
  }

  async function sendEmailForSession(sessionId: string) {
    await sendEmailOnly(sessionId);
  }

  // ── PDF download ──────────────────────────────────────────────────────

  async function downloadPdf(sessionId: string) {
    const name = suppliers.find((s) => s.id === selectedSupplierId)?.name ?? "fournisseur";
    const res = await fetchApi(`/api/commandes/pdf?session_id=${sessionId}`);
    if (!res.ok) { alert("Erreur lors de la génération du PDF"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commande-${name.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Envoi mail via Resend (serveur, zero friction) ──────────────────

  async function sendEmailOnly(sessionId: string) {
    setSendingEmail(true);
    try {
      const res = await fetchApi("/api/commandes/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfirmation(`Mail envoye a ${data.recipients?.join(", ")}`);
        await reloadSession();
      } else {
        alert(data.error ?? "Erreur envoi mail");
      }
    } catch (err) {
      console.error("[commandes] send email error:", err);
      alert("Erreur lors de l'envoi du mail");
    }
    setSendingEmail(false);
    setTimeout(() => setConfirmation(null), 6000);
  }

  // ── Pause: quit the current draft without deleting it ───────────────
  // The brouillon stays in DB; user can resume later via the supplier drawer.

  function pauseSession() {
    setSession(null);
    setSelectedSupplierId(null);
    setQuantities({});
    setNotes("");
    setConfirmation("Commande mise en pause");
    setTimeout(() => setConfirmation(null), 3000);
  }

  // ── Delete session ──────────────────────────────────────────────────

  async function deleteSession() {
    if (!session) return;
    if (!confirm("Supprimer cette commande ? Cette action est irréversible.")) return;
    setSaving(true);
    await supabase.from("commande_lignes").delete().eq("session_id", session.id);
    await supabase.from("commande_sessions").delete().eq("id", session.id);
    setSession(null);
    setQuantities({});
    setNotes("");
    if (selectedSupplierId) {
      setDraftSupplierIds((prev) => { const next = new Set(prev); next.delete(selectedSupplierId); return next; });
    }
    setSaving(false);
    setConfirmation("Commande supprimée");
    setTimeout(() => setConfirmation(null), 4000);
  }

  // ── Historique ────────────────────────────────────────────────────────

  async function loadHistorique() {
    if (!selectedSupplierId) return;
    const aliasIds = supplierAliases.get(selectedSupplierId);
    const ids = aliasIds ? Array.from(aliasIds) : [selectedSupplierId];
    const allHist: HistItem[] = [];
    for (const sid of ids) {
      const res = await fetchApi(`/api/commandes/historique?supplier_id=${sid}&limit=10`);
      const data = await res.json();
      allHist.push(...(data.historique ?? []));
    }
    allHist.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setHistorique(allHist.slice(0, 10));
    setHistOpen(true);
  }

  async function dupliquerSession(histSessionId: string) {
    if (!selectedSupplierId) return;
    setSaving(true);

    const res = await fetchApi("/api/commandes/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier_id: selectedSupplierId }),
    });
    const { session: newSession } = await res.json();
    if (!newSession) { setSaving(false); return; }

    const sessRes = await fetchApi(`/api/commandes/session?id=${histSessionId}`);
    const { session: oldSession } = await sessRes.json();

    for (const l of oldSession?.lignes ?? []) {
      if (l.quantite > 0) {
        await fetchApi("/api/commandes/ligne", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: newSession.id,
            ingredient_id: l.ingredient_id,
            quantite: l.quantite,
            unite: l.unite,
            prix_unitaire_ht: l.prix_unitaire_ht,
          }),
        });
      }
    }

    await reloadSession();
    setSaving(false);
    setHistOpen(false);
    setConfirmation("Commande dupliquée en brouillon");
    setTimeout(() => setConfirmation(null), 4000);
  }

  // ── Computed ──────────────────────────────────────────────────────────

  // ── Computed (early, needed by delivery estimate) ───────────────────

  const currentSupplier = suppliers.find((s) => s.id === selectedSupplierId);

  // ── Delivery estimate ───────────────────────────────────────────────

  function getDeliveryEstimate(): string | null {
    const schedule = currentSupplier?.delivery_schedule;
    if (!schedule || schedule.length === 0) return null;

    const DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    const DAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    const now = new Date();
    const _todayName = DAY_NAMES[now.getDay()];
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // Find the next matching rule
    for (let offset = 0; offset < 7; offset++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + offset);
      const dayName = DAY_NAMES[checkDate.getDay()];

      const rule = schedule.find((r) => r.day.toLowerCase() === dayName);
      if (!rule) continue;

      // If today, check cutoff
      if (offset === 0 && currentTime >= rule.cutoff) continue;

      // Find delivery day
      const deliveryDayIdx = DAY_NAMES.indexOf(rule.delivery_day.toLowerCase());
      if (deliveryDayIdx === -1) continue;

      const cutoffLabel = offset === 0 ? `avant ${rule.cutoff}` : `${DAY_LABELS[checkDate.getDay()]} avant ${rule.cutoff}`;
      return `Commande ${cutoffLabel} → livraison ${rule.delivery_day}`;
    }
    return null;
  }

  const activeCount = Object.values(quantities).filter((v) => v !== "" && Number(v) > 0).length;
  const supplierLabel = currentSupplier?.name ?? "";
  const readOnly = session?.status === "validee" || session?.status === "recue";

  // Franco calculation
  const francoMin = currentSupplier?.franco_minimum ?? null;
  const orderTotal = catalog.reduce((sum, item) => {
    const qty = Number(quantities[item.id] ?? 0);
    if (qty <= 0 || !item.prix_commande) return sum;
    return sum + qty * item.prix_commande;
  }, 0);
  const francoPercent = francoMin && francoMin > 0 ? Math.min(100, (orderTotal / francoMin) * 100) : null;

  // Save order unit label
  async function saveOrderUnit(ingredientId: string, label: string) {
    const trimmed = label.trim() || null;
    setCatalog((prev) =>
      prev.map((i) => (i.id === ingredientId ? { ...i, order_unit_label: trimmed, order_unit: trimmed ?? i.order_unit } : i))
    );
    await supabase.from("ingredients").update({ order_unit_label: trimmed }).eq("id", ingredientId);
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  }

  // ── Render: unit toggle (individual/carton) ──────────────────────────

  function individualUnitLabel(item: CatalogItem): string {
    const u = (item.order_unit ?? item.default_unit ?? "").toLowerCase();
    if (u === "pc" || u === "pcs" || u === "piece" || u === "pièce") return "unité";
    if (u.includes("bouteille") || u === "bt" || u === "btl") return "bouteille";
    if (u.includes("bac")) return "bac";
    if (u.includes("barquette")) return "barquette";
    if (u.includes("sac")) return "sac";
    if (u.includes("boite") || u.includes("boîte")) return "boîte";
    if (u.includes("bidon")) return "bidon";
    if (u.includes("pot")) return "pot";
    if (u) return u;
    return "unité";
  }

  function unitToggle(item: CatalogItem) {
    const packCount = item.pack_count ?? 0;
    if (packCount <= 0) return null;
    const indivLabel = individualUnitLabel(item);
    // Don't show toggle when individual unit is already "carton" — "carton / carton de X" is redundant
    if (indivLabel === "carton") return null;
    const mode = unitModes[item.id] ?? "individual";
    const rawQty = Number(quantities[item.id] ?? 0);
    const packEachQty = item.pack_each_qty ?? 1;
    const unitLabel = packEachQty > 1 ? `${packCount}x${packEachQty}` : `${packCount}`;

    const pillStyle = (active: boolean): React.CSSProperties => ({
      fontSize: 10,
      fontWeight: active ? 700 : 500,
      color: active ? "#D4775A" : "#999",
      background: active ? "#FFF0EB" : "#f5f0e8",
      border: active ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
      borderRadius: 6,
      padding: "3px 8px",
      cursor: "pointer",
    });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" onClick={() => toggleUnitMode(item.id)} style={pillStyle(mode === "individual")}>
            {indivLabel}
          </button>
          <button type="button" onClick={() => toggleUnitMode(item.id)} style={pillStyle(mode === "carton")}>
            carton de {unitLabel}
          </button>
        </div>
        {mode === "carton" && rawQty > 0 && item.prix_commande != null && (
          <span style={{ fontSize: 10, color: "#666" }}>
            {getDisplayQty(item.id)} carton{(getDisplayQty(item.id) as number) > 1 ? "s" : ""} = {rawQty} {indivLabel}{rawQty > 1 ? "s" : ""} = {(rawQty * item.prix_commande).toFixed(2).replace(".", ",")}&#8239;&#8364;
          </span>
        )}
      </div>
    );
  }

  // ── Render: unit badge ────────────────────────────────────────────────

  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [editUnitValue, setEditUnitValue] = useState("");

  function unitPriceBadge(item: CatalogItem) {
    const u = item.order_unit;
    const price = item.prix_commande;
    const isEditing = editingUnit === item.id;

    if (isEditing) {
      return (
        <input
          autoFocus
          value={editUnitValue}
          onChange={(e) => setEditUnitValue(e.target.value)}
          onBlur={() => { saveOrderUnit(item.id, editUnitValue); setEditingUnit(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { saveOrderUnit(item.id, editUnitValue); setEditingUnit(null); } }}
          style={{
            fontSize: 10, color: "#666", background: "#fff", border: "1.5px solid #D4775A",
            padding: "2px 6px", borderRadius: 4, width: 100, outline: "none",
          }}
          placeholder="ex: bac 2.5kg"
        />
      );
    }

    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditingUnit(item.id); setEditUnitValue(item.order_unit_label ?? ""); }}
        style={{
          fontSize: 10, color: item.order_unit_label ? "#D4775A" : "#999",
          background: item.order_unit_label ? "#FFF0EB" : "#f5f0e8",
          padding: "2px 6px", borderRadius: 4, flexShrink: 0, whiteSpace: "nowrap",
          border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
        }}
        title="Modifier l'unité de commande"
      >
        <span>{u || "unité"}</span>
        {price != null && (
          <span style={{ color: "#1a1a1a", fontWeight: 700 }}>
            {price.toFixed(2)}€
          </span>
        )}
      </button>
    );
  }

  // ── Render: summary (read-only) ───────────────────────────────────────

  function renderSummary() {
    if (!session) return null;

    type SummaryItem = { name: string; qty: number; unit: string; category: string; prixUnitaire: number | null };
    const selected: SummaryItem[] = [];

    for (const item of catalog) {
      const q = Number(quantities[item.id] ?? 0);
      if (q > 0) {
        selected.push({
          name: item.name,
          qty: q,
          unit: item.order_unit ?? item.default_unit ?? "",
          category: item.category ?? "autre",
          prixUnitaire: item.prix_commande ?? null,
        });
      }
    }

    for (const l of session.lignes) {
      if (l.quantite > 0 && l.ingredient_id) {
        const alreadyIncluded = selected.some(
          (s) => catalog.find((c) => c.id === l.ingredient_id)?.name === s.name
        );
        if (!alreadyIncluded) {
          selected.push({
            name: l.ingredients?.name ?? "?",
            qty: l.quantite,
            unit: l.unite ?? l.ingredients?.default_unit ?? "",
            category: l.ingredients?.category ?? "autre",
            prixUnitaire: l.prix_unitaire_ht ?? null,
          });
        }
      }
    }

    const byCat: Record<string, SummaryItem[]> = {};
    for (const item of selected) {
      if (!byCat[item.category]) byCat[item.category] = [];
      byCat[item.category].push(item);
    }

    const sortedCats = Object.keys(byCat).sort((a, b) => catIndex(a) - catIndex(b));

    return (
      <div>
        {/* Status banner */}
        <div style={{
          background: statusBannerBg[session.status] ?? "#f5f5f5",
          border: `1.5px solid ${statusColor[session.status] ?? "#999"}`,
          color: statusColor[session.status] ?? "#999",
          padding: "12px 16px", borderRadius: 10,
          fontSize: 14, fontWeight: 600, marginBottom: 16, textAlign: "center",
        }}>
          {session.status === "validee" && "Commande validee"}
          {session.status === "recue" && "Commande recue"}
          {session.status === "en_attente" && "En attente (legacy)"}

          {session.status === "validee" && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => downloadPdf(session.id)}
                style={{ padding: "8px 20px", borderRadius: 8, border: "1.5px solid #4a6741", background: "#fff", color: "#4a6741", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Telecharger PDF
              </button>
              <button onClick={() => sendEmailOnly(session.id)} disabled={sendingEmail}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#2563EB", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: sendingEmail ? 0.6 : 1 }}>
                {sendingEmail ? "Envoi..." : "Envoyer par mail"}
              </button>
              <button onClick={() => recevoirSession(session.id)} disabled={saving}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Marquer recue
              </button>
            </div>
          )}

          {session.status === "validee" && (
            <button onClick={() => retourBrouillon(session.id)} disabled={saving}
              style={{ marginTop: 8, background: "none", border: "none", color: "#999", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
              Modifier la commande
            </button>
          )}
        </div>

        {selected.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 24 }}>Aucun article commandé.</p>
        ) : (
          <>
            {sortedCats.map((cat) => {
              const items = byCat[cat].sort((a, b) => a.name.localeCompare(b.name, "fr"));
              const color = CAT_COLORS[cat] ?? "#6B7280";
              return (
                <div key={cat} style={{ marginBottom: 8 }}>
                  <div
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = color; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; e.currentTarget.style.borderColor = "#ddd6c8"; e.currentTarget.style.borderLeftColor = color; }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 16px", background: "#fff",
                      border: "1.5px solid #ddd6c8", borderLeft: `3px solid ${color}`,
                      borderRadius: 12, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                      marginTop: 16, marginBottom: 6,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                      transition: "box-shadow 0.2s, border-color 0.2s",
                    }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color }}>
                      {catLabel(cat)}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: `${color}18`, color }}>
                      {items.length}
                    </span>
                  </div>
                  {items.map((item, i) => {
                    const lineTotal = item.prixUnitaire != null ? item.prixUnitaire * item.qty : null;
                    return (
                      <div key={i} style={{ ...tile }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", flex: 1 }}>{item.name}</span>
                        {item.prixUnitaire != null && (
                          <span style={{ fontSize: 11, color: "#999", flexShrink: 0 }}>{item.prixUnitaire.toFixed(2)}€</span>
                        )}
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#D4775A", flexShrink: 0 }}>× {item.qty}</span>
                        {item.unit && (
                          <span style={{ fontSize: 11, color: "#999", flexShrink: 0 }}>{item.unit}</span>
                        )}
                        {lineTotal != null && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", flexShrink: 0, minWidth: 55, textAlign: "right" }}>{lineTotal.toFixed(2)}€</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {(() => {
              const total = selected.reduce((sum, item) => {
                if (item.prixUnitaire == null) return sum;
                return sum + item.prixUnitaire * item.qty;
              }, 0);
              return (
                <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "#D4775A", marginTop: 12 }}>
                  {selected.length} article{selected.length > 1 ? "s" : ""} commandé{selected.length > 1 ? "s" : ""}
                  {total > 0 && <span style={{ marginLeft: 12, color: "#1a1a1a" }}>Total : {total.toFixed(2)} € HT</span>}
                </div>
              );
            })()}
          </>
        )}
      </div>
    );
  }

  // ── Render: catalog (brouillon) ───────────────────────────────────────

  function renderCatalog() {
    const grouped = groupCatalog(catalog);
    const sortedCats = Object.keys(grouped).sort((a, b) => catIndex(a) - catIndex(b));

    return (
      <>
        {session && (
          <div style={{
            background: statusBannerBg.brouillon,
            borderLeft: `4px solid #D4775A`,
            border: `1.5px solid ${statusColor.brouillon}`,
            borderLeftWidth: 4,
            borderLeftColor: "#D4775A",
            color: statusColor.brouillon, padding: "10px 16px", borderRadius: 10,
            fontSize: 13, fontWeight: 600, marginBottom: 12,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span>Brouillon — {supplierLabel}</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: "#999" }}>
                  {fmtDate(session.created_at)}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontWeight: 700, color: "#D4775A" }}>
                  {activeCount} article{activeCount > 1 ? "s" : ""}
                </span>
                {orderTotal > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a" }}>
                    {orderTotal.toFixed(2)} € HT
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {catalog.length === 0 && (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 24 }}>
            Aucun ingrédient lié à ce fournisseur dans le catalogue.
          </p>
        )}

        {sortedCats.map((cat) => {
          const { favoris, others } = grouped[cat];
          const allItems = [...favoris, ...others];
          const selectedCount = allItems.filter((i) => Number(quantities[i.id] ?? 0) > 0).length;
          const isOpen = openCats[cat] ?? false;
          const color = CAT_COLORS[cat] ?? "#6B7280";

          return (
            <div key={cat} style={{ marginTop: 16, marginBottom: 6 }}>
              <button type="button"
                onClick={() => setOpenCats((prev) => ({ ...prev, [cat]: !isOpen }))}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = color; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; e.currentTarget.style.borderColor = "#ddd6c8"; e.currentTarget.style.borderLeftColor = color; }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 16px", background: "#fff",
                  border: "1.5px solid #ddd6c8", borderLeft: `3px solid ${color}`,
                  borderRadius: isOpen ? "12px 12px 0 0" : 12,
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  marginBottom: 0,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  transition: "box-shadow 0.2s, border-color 0.2s",
                }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color }}>
                  {catLabel(cat)}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: `${color}18`, color }}>
                  {allItems.length}
                </span>
                {selectedCount > 0 && (
                  <span style={{ background: color, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, minWidth: 20, textAlign: "center" }}>
                    {selectedCount}
                  </span>
                )}
                <span style={{ fontSize: 10, color: "#b0a894", transition: "transform 0.2s", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>{"▼"}</span>
              </button>

              <div style={{
                maxHeight: isOpen ? 5000 : 0, overflow: "hidden",
                transition: "max-height 0.3s ease",
                ...(isOpen ? {
                  borderLeft: `3px solid ${color}`,
                  borderRight: "1.5px solid #ddd6c8",
                  borderBottom: "1.5px solid #ddd6c8",
                  borderRadius: "0 0 12px 12px",
                } : {}),
                background: "#fff",
              }}>
                {favoris.length > 0 && (
                  <div style={{ background: "#FFFBF0", borderLeft: "3px solid #F59E0B", padding: "6px 0 2px 0" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "#b8860b", padding: "0 14px 4px" }}>
                      Habituels
                    </div>
                    {favoris.map((item) => (
                      <div key={item.id} style={tile}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <button type="button" onClick={() => toggleFavori(item.id, true)} style={starBtnStyle(true)} title="Retirer des habituels">&#x2B50;</button>
                          <IngredientAvatar ingredientId={item.id} name={item.name} category={(item.category ?? "autre") as Category} size={28} />
                          <span style={{
                            fontSize: 13, fontWeight: Number(quantities[item.id] ?? 0) > 0 ? 700 : 500,
                            color: Number(quantities[item.id] ?? 0) > 0 ? "#1a1a1a" : "#666",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0,
                          }}>{item.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 28 }}>
                          {unitPriceBadge(item)}
                          <StepperInput value={getDisplayQty(item.id)} onChange={(v) => handleQtyChange(item.id, v)} step={1} min={0} placeholder="0" />
                        </div>
                        {(item.pack_count ?? 0) > 0 && <div style={{ paddingLeft: 28 }}>{unitToggle(item)}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {others.map((item) => (
                  <div key={item.id} style={tile}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <button type="button" onClick={() => toggleFavori(item.id, false)} style={starBtnStyle(false)} title="Ajouter aux habituels">&#x2B50;</button>
                      <IngredientAvatar ingredientId={item.id} name={item.name} category={(item.category ?? "autre") as Category} size={28} />
                      <span style={{
                        fontSize: 13, fontWeight: Number(quantities[item.id] ?? 0) > 0 ? 700 : 500,
                        color: Number(quantities[item.id] ?? 0) > 0 ? "#1a1a1a" : "#666",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0,
                      }}>{item.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 28 }}>
                      {unitPriceBadge(item)}
                      <StepperInput value={getDisplayQty(item.id)} onChange={(v) => handleQtyChange(item.id, v)} step={1} min={0} placeholder="0" />
                    </div>
                    {(item.pack_count ?? 0) > 0 && <div style={{ paddingLeft: 28 }}>{unitToggle(item)}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────

  return (
    <RequireRole allowedRoles={["group_admin", "equipier"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 120px", background: "#f2ede4", minHeight: "100vh" }}>

        {confirmation && (
          <div style={{
            background: "#e8ede6", color: "#4a6741",
            padding: "10px 16px", borderRadius: 10,
            fontSize: 14, fontWeight: 600, marginBottom: 16, textAlign: "center",
          }}>
            {confirmation}
          </div>
        )}

        {/* Current supplier indicator (when selected) */}
        {!loading && selectedSupplierId && currentSupplier && (
          <button
            type="button"
            onClick={() => setDropdownOpen(true)}
            style={{
              width: "100%", height: 48, padding: "0 18px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "#fff",
              color: "#1a1a1a",
              fontSize: 13, fontWeight: 700,
              fontFamily: "var(--font-oswald), Oswald, sans-serif",
              textTransform: "uppercase", letterSpacing: ".04em",
              cursor: "pointer", outline: "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <span style={{ color: "#999", fontWeight: 500, fontSize: 11 }}>FOURNISSEUR</span>
            <span>{currentSupplier.name}</span>
            {draftSupplierIds.has(currentSupplier.id) && (
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#D4775A" }} />
            )}
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4, opacity: 0.5 }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

        {/* Supplier drawer */}
        <BottomSheet
          open={dropdownOpen}
          onClose={() => setDropdownOpen(false)}
          title="Choisir un fournisseur"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {suppliers.map((s) => {
              const isActive = s.id === selectedSupplierId;
              const hasDraft = draftSupplierIds.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSelectedSupplierId(s.id); setDropdownOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    width: "100%", padding: "14px 16px",
                    border: "none", cursor: "pointer",
                    borderRadius: 12,
                    background: isActive ? "rgba(212,119,90,0.12)" : "rgba(255,255,255,0.55)",
                    borderLeft: isActive ? "4px solid #D4775A" : "4px solid transparent",
                    transition: "background 0.15s",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span style={{
                    fontSize: 15,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? "#D4775A" : "#1a1a1a",
                    flex: 1,
                  }}>
                    {s.name}
                  </span>
                  {hasDraft && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      fontSize: 10, fontWeight: 700, color: "#D4775A",
                      padding: "2px 8px", borderRadius: 6,
                      background: "rgba(212,119,90,0.12)",
                      textTransform: "uppercase", letterSpacing: ".05em",
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#D4775A" }} />
                      brouillon
                    </span>
                  )}
                  {isActive && !hasDraft && (
                    <span style={{ fontSize: 16, color: "#D4775A" }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </BottomSheet>

        {/* ── DASHBOARD (no supplier selected) ── */}
        {!loading && !selectedSupplierId && (
          <>
            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 8 }}>
              {[
                { label: "Brouillons", count: activeSessions.filter(s => s.status === "brouillon").length, color: "#A0845C", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
                { label: "En attente", count: activeSessions.filter(s => s.status === "en_attente").length, color: "#2563EB", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
                { label: "A recevoir", count: pendingReceptions.length, color: "#4a6741", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
                { label: "Recues ce mois", count: recentOrders.filter(r => {
                  const d = new Date(r.created_at);
                  const now = new Date();
                  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                }).length, color: "#16a34a", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
              ].map((kpi) => (
                <div key={kpi.label} style={{
                  background: "#fff", borderRadius: 12,
                  borderLeft: `4px solid ${kpi.count > 0 ? kpi.color : "#e0d8ce"}`,
                  border: "1px solid #ece4d4",
                  borderLeftWidth: 4, borderLeftColor: kpi.count > 0 ? kpi.color : "#e0d8ce",
                  padding: "16px 18px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={kpi.count > 0 ? kpi.color : "#ccc"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={kpi.icon} />
                    </svg>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999" }}>
                      {kpi.label}
                    </span>
                  </div>
                  <div style={{
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                    fontWeight: 700, fontSize: 28, color: kpi.count > 0 ? kpi.color : "#ccc",
                  }}>
                    {kpi.count}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Commandes en cours */}
        {!loading && !selectedSupplierId && activeSessions.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
              color: "#A0845C", marginBottom: 8,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            }}>
              Commandes en cours
            </div>
            {activeSessions.map((s) => {
              const isBrouillon = s.status === "brouillon";
              const badgeColor = isBrouillon ? "#A0845C" : "#2563EB";
              const badgeBg = isBrouillon ? "#FFF8F0" : "#EFF6FF";
              const isCurrentSupplier = s.supplier_id === selectedSupplierId;
              const menuOpen = activeMenuId === s.id;
              const reprendre = () => {
                let canonicalId = s.supplier_id;
                for (const [cid, aliasSet] of supplierAliases.entries()) {
                  if (aliasSet.has(s.supplier_id)) { canonicalId = cid; break; }
                }
                setSelectedSupplierId(canonicalId);
              };
              return (
                <div key={s.id} style={{ position: "relative", marginBottom: 8 }}>
                  <div
                    onClick={() => { if (!isCurrentSupplier) reprendre(); }}
                    style={{
                      background: isCurrentSupplier ? "#fdf5f2" : "#fff",
                      borderRadius: 12, border: isCurrentSupplier ? "1.5px solid #D4775A" : "1px solid #e0d8ce",
                      padding: "14px 16px",
                      cursor: isCurrentSupplier ? "default" : "pointer",
                      display: "flex", alignItems: "center", gap: 12,
                      transition: "border-color 0.15s",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{s.supplier_name}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                          background: badgeBg, color: badgeColor, whiteSpace: "nowrap",
                          textTransform: "uppercase", letterSpacing: ".05em",
                        }}>
                          {statusLabel[s.status] ?? s.status}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, color: "#999" }}>
                          {s.nb_articles} article{s.nb_articles > 1 ? "s" : ""}
                        </span>
                        {s.total_ht > 0 && (
                          <span style={{
                            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                            fontWeight: 700, fontSize: 13, color: "#1a1a1a",
                          }}>
                            {s.total_ht.toFixed(2)} €
                          </span>
                        )}
                      </div>
                    </div>
                    {/* 3-dot menu trigger */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setActiveMenuId(menuOpen ? null : s.id); }}
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        border: "none", background: menuOpen ? "rgba(0,0,0,0.06)" : "transparent",
                        cursor: "pointer", color: "#666", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 18, fontWeight: 700, lineHeight: 1,
                      }}
                      aria-label="Actions"
                    >
                      ⋯
                    </button>
                  </div>

                  {/* Action menu */}
                  {menuOpen && (
                    <>
                      <div onClick={() => setActiveMenuId(null)}
                        style={{ position: "fixed", inset: 0, zIndex: 90 }} />
                      <div style={{
                        position: "absolute", top: "calc(100% - 6px)", right: 8, zIndex: 91,
                        minWidth: 180,
                        background: "#fff",
                        border: "1px solid rgba(0,0,0,0.08)",
                        borderRadius: 12,
                        boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
                        overflow: "hidden",
                      }}>
                        {!isCurrentSupplier && (
                          <button type="button" onClick={() => { setActiveMenuId(null); reprendre(); }}
                            style={menuItemStyle}>
                            Reprendre
                          </button>
                        )}
                        <button type="button" onClick={() => { setActiveMenuId(null); downloadPdfById(s.id, s.supplier_name); }}
                          style={menuItemStyle}>
                          Telecharger PDF
                        </button>
                        {isBrouillon && (
                          <button type="button" disabled={sendingEmail}
                            onClick={() => { setActiveMenuId(null); sendEmailForSession(s.id); }}
                            style={{ ...menuItemStyle, opacity: sendingEmail ? 0.5 : 1 }}>
                            Envoyer par mail
                          </button>
                        )}
                        {isBrouillon && (
                          <button type="button" disabled={saving}
                            onClick={() => { setActiveMenuId(null); validerActiveSession(s.id); }}
                            style={{ ...menuItemStyle, color: "#4a6741", fontWeight: 700 }}>
                            Valider
                          </button>
                        )}
                        <button type="button"
                          onClick={async () => {
                            setActiveMenuId(null);
                            if (!confirm(`Supprimer la commande ${s.supplier_name} ?`)) return;
                            await supabase.from("commande_lignes").delete().eq("session_id", s.id);
                            await supabase.from("commande_sessions").delete().eq("id", s.id);
                            setActiveSessions((prev) => prev.filter((x) => x.id !== s.id));
                            if (session?.id === s.id) { setSession(null); setQuantities({}); }
                            setConfirmation("Commande supprimée");
                            setTimeout(() => setConfirmation(null), 3000);
                          }}
                          style={{ ...menuItemStyle, color: "#DC2626" }}>
                          Supprimer
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Réceptions en attente */}
        {!loading && !selectedSupplierId && pendingReceptions.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
              color: "#4a6741", marginBottom: 8,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            }}>
              Receptions en attente
            </div>
            {pendingReceptions.map((r) => (
              <div key={r.id} style={{
                background: "#fff", borderRadius: 12, border: "1px solid #e0d8ce",
                borderLeft: "4px solid #4a6741", padding: "14px 16px", marginBottom: 8,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{r.supplier_name}</span>
                    <span style={{ fontSize: 11, color: "#999" }}>{fmtDate(r.created_at)}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <span style={{ fontSize: 12, color: "#666" }}>{r.nb_articles} article{r.nb_articles > 1 ? "s" : ""}</span>
                    {r.total_ht > 0 && (
                      <span style={{
                        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                        fontWeight: 700, fontSize: 16, color: "#1a1a1a",
                      }}>
                        {r.total_ht.toFixed(2)} €
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => downloadPdfById(r.id, r.supplier_name)}
                    style={{
                      fontSize: 11, fontWeight: 600, color: "#4a6741", background: "#fff",
                      border: "1px solid #ddd6c8", borderRadius: 6, cursor: "pointer", padding: "5px 12px",
                      fontFamily: "inherit",
                    }}>
                    PDF
                  </button>
                  <button type="button" onClick={() => recevoirPending(r.id)} disabled={saving}
                    style={{
                      fontSize: 11, fontWeight: 700, color: "#fff", background: "#16a34a",
                      border: "none", borderRadius: 6, cursor: "pointer", padding: "5px 14px",
                      fontFamily: "inherit",
                    }}>
                    Receptionner
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Fournisseurs grid */}
        {!loading && !selectedSupplierId && suppliers.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
              color: "#999", marginBottom: 10,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            }}>
              Commander par fournisseur
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
              {suppliers.map((s) => {
                const hasDraft = draftSupplierIds.has(s.id);
                const schedule = s.delivery_schedule;
                let nextDelivery: string | null = null;
                if (schedule && schedule.length > 0) {
                  const DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
                  const now = new Date();
                  for (let offset = 0; offset < 7; offset++) {
                    const d = new Date(now);
                    d.setDate(d.getDate() + offset);
                    const dayName = DAY_NAMES[d.getDay()];
                    const rule = schedule.find((r) => r.day.toLowerCase() === dayName);
                    if (rule) {
                      if (offset === 0) {
                        const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
                        if (currentTime >= rule.cutoff) continue;
                      }
                      nextDelivery = `Liv. ${rule.delivery_day}`;
                      break;
                    }
                  }
                }
                const color = supplierColor(s.name);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setSelectedSupplierId(s.id); setDropdownOpen(false); }}
                    style={{
                      background: "#fff", borderRadius: 12,
                      border: hasDraft ? "1.5px solid #D4775A" : "1px solid #ece4d4",
                      padding: 0, cursor: "pointer",
                      textAlign: "left", position: "relative",
                      overflow: "hidden",
                      transition: "border-color 0.15s, box-shadow 0.15s",
                    }}
                  >
                    {/* Color top bar */}
                    <div style={{ height: 4, background: color }} />
                    <div style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: `${color}18`, color,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, fontWeight: 800,
                          fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                          flexShrink: 0,
                        }}>
                          {s.name.charAt(0)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            fontSize: 13, fontWeight: 700, color: "#1a1a1a",
                            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                            textTransform: "uppercase", letterSpacing: ".03em",
                            display: "block",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {s.name}
                          </span>
                        </div>
                        {hasDraft && (
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#D4775A", flexShrink: 0 }} />
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 42 }}>
                        {s.franco_minimum != null && s.franco_minimum > 0 && (
                          <span style={{ fontSize: 11, color: "#999" }}>
                            Franco {s.franco_minimum.toFixed(0)} €
                          </span>
                        )}
                        {nextDelivery && (
                          <span style={{ fontSize: 11, color: "#4a6741", fontWeight: 600 }}>
                            {nextDelivery}
                          </span>
                        )}
                        {!nextDelivery && (s.franco_minimum == null || s.franco_minimum <= 0) && (
                          <span style={{ fontSize: 11, color: "#ccc" }}>—</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Historique recent */}
        {!loading && !selectedSupplierId && recentOrders.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
              color: "#999", marginBottom: 10,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            }}>
              Historique recent
            </div>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #ece4d4", overflow: "hidden" }}>
              {recentOrders.map((r, idx) => {
                const sc = supplierColor(r.supplier_name);
                return (
                  <div key={r.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px",
                    borderBottom: idx < recentOrders.length - 1 ? "1px solid #f0ebe2" : "none",
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: `${sc}18`, color: sc,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 800,
                      fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                      flexShrink: 0,
                    }}>
                      {r.supplier_name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
                        {r.supplier_name}
                      </span>
                      <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>
                        {new Date(r.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                      fontWeight: 700, fontSize: 14, color: "#1a1a1a",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {r.total_ht > 0 ? `${r.total_ht.toFixed(2)} €` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* KPI Cards */}
        {!loading && !loadingSupplier && selectedSupplierId && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {/* Articles en commande */}
            <div style={{ flex: "1 1 calc(50% - 5px)", minWidth: 140, background: "#fff", borderRadius: 12, border: "1px solid #e0d8ce", padding: "16px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", marginBottom: 6 }}>
                Articles en commande
              </div>
              <div style={{ fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontWeight: 700, fontSize: 24, color: "#1a1a1a" }}>
                {activeCount}
              </div>
            </div>

            {/* Total HT estimé */}
            <div style={{ flex: "1 1 calc(50% - 5px)", minWidth: 140, background: "#fff", borderRadius: 12, border: "1px solid #e0d8ce", padding: "16px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", marginBottom: 6 }}>
                Total HT estimé
              </div>
              <div style={{ fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontWeight: 700, fontSize: 24, color: "#1a1a1a" }}>
                {orderTotal > 0 ? `${orderTotal.toFixed(2)} €` : "—"}
              </div>
            </div>

            {/* Dernière commande */}
            <div style={{ flex: "1 1 calc(50% - 5px)", minWidth: 140, background: "#fff", borderRadius: 12, border: "1px solid #e0d8ce", padding: "16px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", marginBottom: 6 }}>
                Dernière commande
              </div>
              <div style={{ fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontWeight: 700, fontSize: 24, color: "#1a1a1a" }}>
                {historique.length > 0 ? fmtDate(historique[0].created_at) : "—"}
              </div>
            </div>

            {/* Franco */}
            {francoMin != null && francoMin > 0 && (
              <div style={{ flex: "1 1 calc(50% - 5px)", minWidth: 140, background: "#fff", borderRadius: 12, border: "1px solid #e0d8ce", padding: "16px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", marginBottom: 6 }}>
                  Franco
                </div>
                <div style={{ fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontWeight: 700, fontSize: 24, color: orderTotal >= francoMin ? "#16a34a" : "#D4775A" }}>
                  {orderTotal.toFixed(0)} € / {francoMin} €
                </div>
                <div style={{ height: 4, background: "#f0ebe2", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
                  <div style={{
                    height: "100%", borderRadius: 2, transition: "width 0.3s ease",
                    width: `${francoPercent ?? 0}%`,
                    background: orderTotal >= francoMin
                      ? "linear-gradient(90deg, #16a34a, #22c55e)"
                      : "linear-gradient(90deg, #D4775A, #E8956F)",
                  }} />
                </div>
              </div>
            )}
          </div>
        )}

        {(loading || loadingSupplier) && (
          <p style={{ textAlign: "center", color: "#999", marginTop: 40 }}>Chargement...</p>
        )}

        {/* Reprendre la derniere */}
        {!loading && !loadingSupplier && selectedSupplierId && !session && (
          <button type="button"
            onClick={async () => {
              if (!selectedSupplierId) return;
              const aliasIds = supplierAliases.get(selectedSupplierId);
              const ids = aliasIds ? Array.from(aliasIds) : [selectedSupplierId];
              for (const sid of ids) {
                const res = await fetchApi(`/api/commandes/historique?supplier_id=${sid}&limit=1`);
                const data = await res.json();
                const last = data.historique?.[0];
                if (last) { dupliquerSession(last.id); return; }
              }
              alert("Aucune commande precedente a reprendre");
            }}
            disabled={saving}
            style={{
              marginTop: 12, width: "100%", padding: "10px 16px",
              background: "#fff", border: "1.5px dashed #D4775A",
              borderRadius: 10, fontSize: 13, fontWeight: 600,
              color: "#D4775A", cursor: "pointer", fontFamily: "inherit",
            }}>
            Reprendre la derniere commande
          </button>
        )}

        {/* Notes (above catalog) */}
        {!loading && !loadingSupplier && selectedSupplierId && (
          <div style={{ marginTop: 12 }}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (session) {
                  fetchApi("/api/commandes/session", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: session.id, status: "brouillon", notes: notes.trim() || null }),
                  });
                }
              }}
              placeholder="Notes pour le fournisseur (optionnel)..."
              readOnly={readOnly}
              style={{
                width: "100%", minHeight: 50, padding: "10px 14px",
                border: "1px solid #ddd6c8", borderRadius: 10,
                fontSize: 13, fontFamily: "inherit", color: "#1a1a1a",
                background: readOnly ? "#f5f0e8" : "#fff", resize: "vertical", outline: "none",
              }}
            />
          </div>
        )}

        {/* Content */}
        {!loading && !loadingSupplier && selectedSupplierId && (
          <div style={{ marginTop: 12 }}>
            {session && readOnly ? renderSummary() : renderCatalog()}
          </div>
        )}

        {/* Historique */}
        {!loading && !loadingSupplier && selectedSupplierId && (
          <div style={{ marginTop: 24 }}>
            <button type="button"
              onClick={() => histOpen ? setHistOpen(false) : loadHistorique()}
              style={{
                width: "100%", background: "#fff", border: "1px solid #ddd6c8",
                borderRadius: histOpen ? "12px 12px 0 0" : 12, padding: "14px 18px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#1a1a1a",
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                letterSpacing: "0.04em", textTransform: "uppercase",
                transition: "border-radius 0.2s",
              }}>
              <span>Commandes précédentes</span>
              <span style={{ fontSize: 14, transition: "transform .2s", transform: histOpen ? "rotate(180deg)" : "none", color: "#999" }}>▾</span>
            </button>

            {histOpen && (
              <div style={{
                background: "#fff", border: "1px solid #ddd6c8", borderTop: "none",
                borderRadius: "0 0 12px 12px", padding: "8px 10px 10px",
              }}>
                {historique.length === 0 && (
                  <p style={{ color: "#ccc", fontSize: 12, textAlign: "center", padding: 16 }}>Aucune commande passée</p>
                )}
                {historique.map((h) => (
                  <div key={h.id} style={{
                    background: "#faf8f4", border: "1px solid #e8e2d6", borderRadius: 10,
                    padding: "12px 14px", marginBottom: 6,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{fmtDate(h.created_at)}</span>
                        <span style={{
                          display: "inline-block", width: "fit-content",
                          fontSize: 10, fontWeight: 700,
                          padding: "2px 8px", borderRadius: 6,
                          background: `${statusColor[h.status] ?? "#999"}18`,
                          color: statusColor[h.status] ?? "#999",
                        }}>
                          {statusLabel[h.status] ?? h.status}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#666" }}>
                          {h.nb_articles} article{h.nb_articles > 1 ? "s" : ""}
                        </span>
                        {h.total_ht > 0 && (
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                            {h.total_ht.toFixed(2)} €
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid #e8e2d6", paddingTop: 8 }}>
                      <button type="button" onClick={() => downloadPdf(h.id)}
                        style={{
                          fontSize: 11, fontWeight: 600, color: "#4a6741", background: "#fff",
                          border: "1px solid #ddd6c8", borderRadius: 6, cursor: "pointer",
                          padding: "4px 10px",
                        }}>
                        PDF
                      </button>
                      <button type="button" onClick={() => sendEmailOnly(h.id)}
                        disabled={sendingEmail}
                        style={{
                          fontSize: 11, fontWeight: 600, color: "#2563EB", background: "#fff",
                          border: "1px solid #ddd6c8", borderRadius: 6, cursor: "pointer",
                          padding: "4px 10px", opacity: sendingEmail ? 0.6 : 1,
                        }}>
                        Envoyer
                      </button>
                      <button type="button" onClick={() => dupliquerSession(h.id)}
                        disabled={saving || !!session}
                        style={{
                          fontSize: 11, fontWeight: 600,
                          color: session ? "#ccc" : "#D4775A",
                          background: session ? "#f5f0e8" : "#FFF0EB",
                          border: session ? "1px solid #e8e2d6" : "1px solid #D4775A",
                          borderRadius: 6,
                          cursor: session ? "not-allowed" : "pointer",
                          padding: "4px 10px",
                        }}>
                        Dupliquer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Delivery estimate */}
        {session && session.status === "brouillon" && (() => {
          const estimate = getDeliveryEstimate();
          if (!estimate) return null;
          return (
            <div style={{
              position: "fixed",
              bottom: activeCount > 0 ? "calc(120px + env(safe-area-inset-bottom, 0px))" : "calc(70px + env(safe-area-inset-bottom, 0px))",
              left: "50%",
              transform: "translateX(-50%)",
              background: "#fff",
              border: "1.5px solid #ddd6c8",
              borderRadius: 10,
              padding: "8px 16px",
              fontSize: 11,
              fontWeight: 600,
              color: "#666",
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
              zIndex: 109,
              whiteSpace: "nowrap",
              maxWidth: "90vw",
              textAlign: "center",
            }}>
              {estimate}
            </div>
          );
        })()}

        {/* Floating actions — draft in progress */}
        {session && session.status === "brouillon" && (
          <FloatingActions actions={(() => {
            const acts: FloatingAction[] = [
              { icon: <FAIconTrash size={20} color="#DC2626" />, label: "Supprimer", onClick: () => deleteSession(), disabled: saving },
              { icon: <FAIconPdf size={20} color="#666" />, label: "PDF", onClick: () => downloadPdf(session.id) },
              { icon: <FAIconMail size={20} color="#666" />, label: "Envoyer", onClick: () => sendEmailOnly(session.id), disabled: sendingEmail },
              { icon: <FAIconPause size={20} color="#666" />, label: "Pause", onClick: () => pauseSession() },
            ];
            if (activeCount > 0) {
              acts.push({ icon: <FAIconCheck size={22} color="#fff" />, label: "Valider", onClick: () => validerSession(session.id), primary: true, disabled: saving });
            }
            return acts;
          })()} />
        )}

        {/* Floating "+ Nouvelle commande" — hidden on dashboard (supplier grid replaces it) */}
        {!loading && !session && selectedSupplierId && (
          <button
            type="button"
            onClick={() => setDropdownOpen(true)}
            style={{
              position: "fixed",
              right: 20,
              bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
              zIndex: 105,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 22px",
              borderRadius: 999,
              border: "none",
              background: "#D4775A",
              color: "#fff",
              fontFamily: "var(--font-oswald), Oswald, sans-serif",
              fontSize: 13, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: ".05em",
              cursor: "pointer",
              boxShadow: "0 6px 24px rgba(212,119,90,0.35), 0 2px 8px rgba(0,0,0,0.10)",
            }}
            onTouchStart={(e) => { e.currentTarget.style.transform = "scale(0.96)"; }}
            onTouchEnd={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nouvelle commande
          </button>
        )}
      </div>
    </RequireRole>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { RequireRole } from "@/components/RequireRole";
import { StepperInput } from "@/components/StepperInput";
import { useProfile } from "@/lib/ProfileContext";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import { useEtablissement } from "@/lib/EtablissementContext";
import { IngredientAvatar } from "@/components/IngredientAvatar";
import type { Category } from "@/types/ingredients";

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

const floatingBtn: React.CSSProperties = {
  position: "fixed",
  bottom: "calc(70px + env(safe-area-inset-bottom, 0px))",
  left: "50%",
  transform: "translateX(-50%)",
  background: "#D4775A",
  color: "#fff",
  border: "none",
  borderRadius: 16,
  padding: "14px 32px",
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 0.5,
  boxShadow: "0 6px 24px rgba(212,119,90,0.4)",
  cursor: "pointer",
  zIndex: 110,
  whiteSpace: "nowrap",
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
  const { can } = useProfile();
  const canValidate = can("commandes.valider");
  const { current: etab } = useEtablissement();
  const searchParams = useSearchParams();

  // All suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  // Current supplier state
  const [session, setSession] = useState<Session | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number | "">>({});
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  // Unit mode: carton vs individual (per ingredient)
  const [unitModes, setUnitModes] = useState<Record<string, "individual" | "carton">>({});

  // Confirmation banner
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Historique
  const [histOpen, setHistOpen] = useState(false);
  const [historique, setHistorique] = useState<HistItem[]>([]);

  // Loading
  const [loading, setLoading] = useState(true);
  const [loadingSupplier, setLoadingSupplier] = useState(false);
  const [saving, setSaving] = useState(false);


  // ── Load all suppliers ──────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const q = supabase
        .from("suppliers")
        .select("id, name, franco_minimum, delivery_schedule")
        .eq("is_active", true)
        .order("name");
      if (etab?.id) q.eq("etablissement_id", etab.id);
      const { data } = await q;
      // Deduplicate by name (accent+case insensitive)
      const seen = new Map<string, Supplier>();
      for (const s of (data ?? []) as Supplier[]) {
        const key = s.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        if (!seen.has(key)) seen.set(key, s);
      }
      const list = Array.from(seen.values());
      setSuppliers(list);
      // Pre-select from URL param or default to first
      const urlSupplierId = searchParams.get("supplier_id");
      if (urlSupplierId && list.some((s) => s.id === urlSupplierId)) {
        setSelectedSupplierId(urlSupplierId);
      } else if (list.length > 0) {
        setSelectedSupplierId(list[0].id);
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

    // Apply quantities from session
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
    const etabKey = etab?.slug?.includes("bello") ? "bellomio" : etab?.slug?.includes("piccola") ? "piccola" : null;
    const offerQ = supabase
      .from("supplier_offers")
      .select("ingredient_id, price_kind, unit, unit_price, pack_price, pack_unit, pack_count, pack_each_qty, pack_each_unit, pack_total_qty, establishment")
      .eq("supplier_id", supplierId)
      .eq("is_active", true);
    const { data: offerData } = await offerQ;

    const offerMap = new Map<string, typeof offerData extends (infer T)[] | null ? T : never>();
    const offerIngIds: string[] = [];
    for (const o of offerData ?? []) {
      if (o.ingredient_id) {
        offerIngIds.push(o.ingredient_id);
        offerMap.set(o.ingredient_id, o);
      }
    }

    let directIngQ = supabase
      .from("ingredients")
      .select("id")
      .eq("supplier_id", supplierId);
    // Filter by establishments array instead of etablissement_id
    if (etabKey) directIngQ = directIngQ.or(`establishments.cs.{"${etabKey}"},establishments.is.null`);
    const { data: directIngs } = await directIngQ;
    const directIds = (directIngs ?? []).map((i: { id: string }) => i.id);

    const allIds = [...new Set([...offerIngIds, ...directIds])];

    let items: CatalogItem[] = [];
    if (allIds.length > 0) {
      let ingDataQ = supabase
        .from("ingredients")
        .select("id, name, category, default_unit, favori_commande, order_unit_label, order_quantity")
        .in("id", allIds)
        .order("category")
        .order("name");
      if (etabKey) ingDataQ = ingDataQ.or(`establishments.cs.{"${etabKey}"},establishments.is.null`);
      const { data: ingData } = await ingDataQ;

      items = (ingData ?? []).map((ing: { id: string; name: string; category: string | null; default_unit: string | null; favori_commande?: boolean; order_unit_label?: string | null; order_quantity?: number | null }) => {
        const offer = (offerMap.get(ing.id) ?? null) as OfferRow | null;
        const oq = ing.order_quantity ?? null;
        return {
          ...ing,
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
  }, [etab]);

  useEffect(() => {
    if (selectedSupplierId) {
      void loadForSupplier(selectedSupplierId);
    }
  }, [selectedSupplierId, loadForSupplier]);

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

  async function createSession() {
    if (!selectedSupplierId) return;
    setSaving(true);
    const res = await fetchApi("/api/commandes/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier_id: selectedSupplierId }),
    });
    const data = await res.json();
    if (data.session) {
      setSession({ ...data.session, lignes: [] });
    }
    setSaving(false);
  }

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

  function handleQtyChange(ingredientId: string, val: number | "") {
    const qty = val === "" ? "" : Math.floor(val as number);
    // If in carton mode, multiply by pack_count for storage
    const item = catalog.find((c) => c.id === ingredientId);
    const mode = unitModes[ingredientId] ?? "individual";
    const packCount = item?.pack_count ?? 0;
    const actualQty = (mode === "carton" && packCount > 0 && qty !== "")
      ? qty * packCount
      : qty;
    setQuantities((prev) => ({ ...prev, [ingredientId]: actualQty }));
    if (session) {
      saveLigne(session.id, ingredientId, actualQty, item?.order_unit ?? item?.default_unit ?? null, item?.prix_commande ?? null);
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

  async function envoyerSession(sessionId: string) {
    setSaving(true);
    try {
      // Send email with PDF attachment to supplier contacts
      const auth = localStorage.getItem(Object.keys(localStorage).find(k => k.includes("auth-token")) ?? "");
      let token = "";
      if (auth) { try { const p = JSON.parse(auth); token = p?.access_token ?? p?.currentSession?.access_token ?? ""; } catch {} }
      const etabId = etab?.id ?? "";

      const res = await fetchApi("/api/commandes/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "x-etablissement-id": etabId,
        },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();

      if (!data.ok) {
        // Fallback: just change status without email
        if (data.error?.includes("Aucun destinataire")) {
          if (confirm(`${data.error}\n\nValider la commande sans envoyer de mail ?`)) {
            await fetchApi("/api/commandes/session", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: sessionId, status: "en_attente" }),
            });
          }
        } else {
          alert(data.error ?? "Erreur envoi");
        }
      }

      await reloadSession();
      setConfirmation(data.ok ? `Commande envoyee a ${data.recipients?.join(", ")}` : "Commande validee (sans mail)");
    } catch (err) {
      console.error("[commandes] send error:", err);
      // Fallback: change status only
      await fetchApi("/api/commandes/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, status: "en_attente" }),
      });
      await reloadSession();
      setConfirmation("Commande validee (erreur envoi mail)");
    }
    setSaving(false);
    setTimeout(() => setConfirmation(null), 6000);
  }

  async function validerSession(sessionId: string) {
    setSaving(true);
    await fetchApi("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "validee" }),
    });
    await reloadSession();
    setSaving(false);
    setConfirmation("Commande validée");
    setTimeout(() => setConfirmation(null), 4000);
  }

  async function rejeterSession(sessionId: string) {
    setSaving(true);
    await fetchApi("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "brouillon" }),
    });
    await reloadSession();
    setSaving(false);
    setConfirmation("Commande renvoyée en brouillon");
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

  // ── Historique ────────────────────────────────────────────────────────

  async function loadHistorique() {
    if (!selectedSupplierId) return;
    const res = await fetchApi(`/api/commandes/historique?supplier_id=${selectedSupplierId}&limit=5`);
    const data = await res.json();
    setHistorique(data.historique ?? []);
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
    const todayName = DAY_NAMES[now.getDay()];
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
  const readOnly = session?.status === "en_attente" || session?.status === "validee" || session?.status === "recue";

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

  // ── Render: unit toggle (carton/bouteille) ───────────────────────────

  function unitToggle(item: CatalogItem) {
    const packCount = item.pack_count ?? 0;
    if (packCount <= 0) return null;
    const mode = unitModes[item.id] ?? "individual";
    const rawQty = Number(quantities[item.id] ?? 0);
    const packEachQty = item.pack_each_qty ?? 1;
    const unitLabel = packEachQty > 1 ? `${packCount}x${packEachQty}` : `${packCount}`;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={() => toggleUnitMode(item.id)}
            style={{
              fontSize: 10,
              fontWeight: mode === "individual" ? 700 : 500,
              color: mode === "individual" ? "#D4775A" : "#999",
              background: mode === "individual" ? "#FFF0EB" : "#f5f0e8",
              border: mode === "individual" ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
              borderRadius: 6,
              padding: "3px 8px",
              cursor: "pointer",
            }}
          >
            bouteille
          </button>
          <button
            type="button"
            onClick={() => toggleUnitMode(item.id)}
            style={{
              fontSize: 10,
              fontWeight: mode === "carton" ? 700 : 500,
              color: mode === "carton" ? "#D4775A" : "#999",
              background: mode === "carton" ? "#FFF0EB" : "#f5f0e8",
              border: mode === "carton" ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
              borderRadius: 6,
              padding: "3px 8px",
              cursor: "pointer",
            }}
          >
            carton de {unitLabel}
          </button>
        </div>
        {mode === "carton" && rawQty > 0 && item.prix_commande != null && (
          <span style={{ fontSize: 10, color: "#666" }}>
            {getDisplayQty(item.id)} carton{(getDisplayQty(item.id) as number) > 1 ? "s" : ""} = {rawQty} bouteille{rawQty > 1 ? "s" : ""} = {(rawQty * item.prix_commande).toFixed(2).replace(".", ",")}&#8239;&#8364;
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
          {session.status === "en_attente" && "En attente de validation"}
          {session.status === "validee" && "Commande validée"}
          {session.status === "recue" && "Commande reçue"}

          {session.status === "en_attente" && canValidate && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center" }}>
              <button onClick={() => rejeterSession(session.id)} disabled={saving}
                style={{ padding: "8px 20px", borderRadius: 8, border: "1.5px solid #8B1A1A", background: "#fff", color: "#8B1A1A", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Refuser / Corriger
              </button>
              <button onClick={() => validerSession(session.id)} disabled={saving}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#4a6741", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Valider la commande
              </button>
            </div>
          )}

          {session.status === "validee" && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => downloadPdf(session.id)}
                style={{ padding: "8px 20px", borderRadius: 8, border: "1.5px solid #4a6741", background: "#fff", color: "#4a6741", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Télécharger PDF
              </button>
              {canValidate && (
                <button onClick={() => recevoirSession(session.id)} disabled={saving}
                  style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  Marquer comme reçue
                </button>
              )}
            </div>
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
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 16px", background: `${color}14`, border: `1px solid ${color}30`,
                    borderRadius: "12px 12px 0 0",
                  }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color }}>
                      {catLabel(cat)}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: `${color}30`, color }}>
                      {items.length}
                    </span>
                  </div>
                  {items.map((item, i) => {
                    const lineTotal = item.prixUnitaire != null ? item.prixUnitaire * item.qty : null;
                    return (
                      <div key={i} style={{ ...tile, borderRadius: i === items.length - 1 ? "0 0 12px 12px" : 0 }}>
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
    if (!session) return null;

    const grouped = groupCatalog(catalog);
    const sortedCats = Object.keys(grouped).sort((a, b) => catIndex(a) - catIndex(b));

    return (
      <>
        <div style={{
          background: statusBannerBg.brouillon, border: `1.5px solid ${statusColor.brouillon}`,
          color: statusColor.brouillon, padding: "10px 16px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, marginBottom: 12,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>Brouillon</span>
          <span style={{ fontWeight: 700, color: "#D4775A" }}>
            {activeCount} article{activeCount > 1 ? "s" : ""}
          </span>
        </div>

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
            <div key={cat} style={{ marginBottom: 6 }}>
              <button type="button"
                onClick={() => setOpenCats((prev) => ({ ...prev, [cat]: !isOpen }))}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  gap: 10, padding: "10px 16px",
                  background: `${color}14`, border: `1px solid ${color}30`,
                  borderRadius: isOpen ? "12px 12px 0 0" : 12,
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  transition: "border-radius 0.2s",
                }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color }}>
                  {catLabel(cat)}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: `${color}30`, color }}>
                  {allItems.length}
                </span>
                {selectedCount > 0 && (
                  <span style={{ background: color, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, minWidth: 20, textAlign: "center" }}>
                    {selectedCount}
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#b0a894", transition: "transform 0.2s", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>{"▼"}</span>
              </button>

              <div style={{
                maxHeight: isOpen ? 5000 : 0, overflow: "hidden",
                transition: "max-height 0.3s ease",
                border: isOpen ? `1px solid ${color}30` : "none",
                borderTop: "none", borderRadius: "0 0 12px 12px",
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

        {/* Supplier pills */}
        {!loading && suppliers.length > 0 && (
          <div style={{
            display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4,
            WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
          }}>
            {suppliers.map((s) => {
              const isSelected = s.id === selectedSupplierId;
              return (
                <button key={s.id} type="button"
                  onClick={() => setSelectedSupplierId(s.id)}
                  style={{
                    flexShrink: 0, padding: "10px 18px", borderRadius: 12,
                    border: isSelected ? "2px solid #D4775A" : "1.5px solid #ddd6c8",
                    background: isSelected ? "#fff" : "#f9f5ef",
                    fontSize: 14, fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? "#D4775A" : "#666",
                    cursor: "pointer", fontFamily: "inherit",
                    boxShadow: isSelected ? "0 2px 8px rgba(212,119,90,0.15)" : "none",
                    transition: "all 0.15s",
                  }}>
                  {s.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Franco progress bar */}
        {francoMin != null && session?.status === "brouillon" && (
          <div style={{ marginTop: 12, background: "#fff", borderRadius: 10, padding: "10px 14px", border: "1px solid #e5ddd0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#666" }}>
                Franco {supplierLabel}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: orderTotal >= francoMin ? "#16a34a" : "#D4775A",
              }}>
                {orderTotal.toFixed(0)} € / {francoMin} €
              </span>
            </div>
            <div style={{ height: 6, background: "#f0ebe2", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3, transition: "width 0.3s ease",
                width: `${francoPercent ?? 0}%`,
                background: orderTotal >= francoMin
                  ? "linear-gradient(90deg, #16a34a, #22c55e)"
                  : "linear-gradient(90deg, #D4775A, #E8956F)",
              }} />
            </div>
            {orderTotal < francoMin ? (
              <div style={{ fontSize: 10, color: "#999", marginTop: 4, textAlign: "right" }}>
                Encore {(francoMin - orderTotal).toFixed(0)} € pour atteindre le franco
              </div>
            ) : (
              <div style={{ fontSize: 10, color: "#16a34a", fontWeight: 600, marginTop: 4, textAlign: "right" }}>
                Franco atteint
              </div>
            )}
          </div>
        )}

        {(loading || loadingSupplier) && (
          <p style={{ textAlign: "center", color: "#999", marginTop: 40 }}>Chargement...</p>
        )}

        {/* Content */}
        {!loading && !loadingSupplier && selectedSupplierId && (
          <div style={{ marginTop: 16 }}>
            {!session && (
              <div style={{
                background: "#fff", borderRadius: 16, border: "1.5px solid #ddd6c8",
                padding: "48px 24px", textAlign: "center",
              }}>
                <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.8 }}>&#x1F4E6;</div>
                <div style={{
                  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                  fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 6,
                }}>
                  Commander chez {supplierLabel}
                </div>
                <p style={{ color: "#999", fontSize: 13, marginBottom: 20, maxWidth: 300, margin: "0 auto 20px" }}>
                  Sélectionnez les articles et quantités, puis envoyez pour validation.
                </p>
                <button onClick={() => createSession()} disabled={saving}
                  style={{
                    background: "#D4775A", color: "#fff", border: "none", borderRadius: 12,
                    padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer",
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                    boxShadow: "0 4px 16px rgba(212,119,90,0.25)",
                  }}>
                  Nouvelle commande
                </button>
              </div>
            )}

            {session && (readOnly ? renderSummary() : renderCatalog())}
          </div>
        )}

        {/* Historique */}
        {!loading && !loadingSupplier && selectedSupplierId && (
          <div style={{ marginTop: 24 }}>
            <button type="button"
              onClick={() => histOpen ? setHistOpen(false) : loadHistorique()}
              style={{
                width: "100%", background: "#fff", border: "1px solid #ddd6c8",
                borderRadius: 12, padding: "12px 16px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#666",
              }}>
              <span>Commandes précédentes</span>
              <span style={{ fontSize: 16, transition: "transform .2s", transform: histOpen ? "rotate(180deg)" : "none" }}>▾</span>
            </button>

            {histOpen && (
              <div style={{ marginTop: 8 }}>
                {historique.length === 0 && (
                  <p style={{ color: "#ccc", fontSize: 12, textAlign: "center", padding: 16 }}>Aucune commande passée</p>
                )}
                {historique.map((h) => (
                  <div key={h.id} style={{
                    background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12,
                    padding: "10px 14px", marginBottom: 6,
                    display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{fmtDate(h.created_at)}</span>
                        <span style={{
                          marginLeft: 8, fontSize: 10, fontWeight: 700,
                          padding: "2px 7px", borderRadius: 6,
                          background: `${statusColor[h.status] ?? "#999"}14`,
                          color: statusColor[h.status] ?? "#999",
                        }}>
                          {statusLabel[h.status] ?? h.status}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: "#999" }}>{h.nb_articles} article{h.nb_articles > 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button type="button" onClick={() => dupliquerSession(h.id)}
                        disabled={saving || !!session}
                        style={{
                          fontSize: 11, fontWeight: 600,
                          color: session ? "#ccc" : "#D4775A",
                          background: "none", border: "none",
                          cursor: session ? "not-allowed" : "pointer", padding: 0,
                        }}>
                        Dupliquer &rarr;
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

        {/* Bouton flottant — brouillon → envoyer */}
        {session && session.status === "brouillon" && activeCount > 0 && (
          <button type="button" onClick={() => envoyerSession(session.id)} disabled={saving} style={floatingBtn}>
            {saving ? "Envoi..." : `Envoyer pour validation (${activeCount} article${activeCount > 1 ? "s" : ""})`}
          </button>
        )}

        {/* Bouton flottant — en_attente → valider */}
        {session && session.status === "en_attente" && canValidate && (
          <div style={{ position: "fixed", bottom: "calc(70px + env(safe-area-inset-bottom, 0px))", left: "50%", transform: "translateX(-50%)", display: "flex", gap: 10, zIndex: 110 }}>
            <button type="button" onClick={() => rejeterSession(session.id)} disabled={saving}
              style={{ ...floatingBtn, position: "static", bottom: "auto", left: "auto", transform: "none", background: "#fff", color: "#8B1A1A", border: "1.5px solid #8B1A1A", boxShadow: "0 6px 24px rgba(0,0,0,0.15)" }}>
              Refuser
            </button>
            <button type="button" onClick={() => validerSession(session.id)} disabled={saving}
              style={{ ...floatingBtn, position: "static", bottom: "auto", left: "auto", transform: "none", background: "#4a6741", boxShadow: "0 6px 24px rgba(74,103,65,0.4)" }}>
              {saving ? "..." : "Valider la commande"}
            </button>
          </div>
        )}

        {/* Bouton flottant — validée → recevoir + PDF */}
        {session && session.status === "validee" && (
          <div style={{ position: "fixed", bottom: "calc(70px + env(safe-area-inset-bottom, 0px))", left: "50%", transform: "translateX(-50%)", display: "flex", gap: 10, zIndex: 110 }}>
            <button type="button" onClick={() => downloadPdf(session.id)}
              style={{ ...floatingBtn, position: "static", bottom: "auto", left: "auto", transform: "none", background: "#fff", color: "#4a6741", border: "1.5px solid #4a6741", boxShadow: "0 6px 24px rgba(0,0,0,0.15)" }}>
              PDF
            </button>
            {canValidate && (
              <button type="button" onClick={() => recevoirSession(session.id)} disabled={saving}
                style={{ ...floatingBtn, position: "static", bottom: "auto", left: "auto", transform: "none", background: "#16a34a", boxShadow: "0 6px 24px rgba(22,163,74,0.4)" }}>
                {saving ? "..." : "Marquer recue"}
              </button>
            )}
          </div>
        )}
      </div>
    </RequireRole>
  );
}

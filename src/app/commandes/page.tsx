"use client";

import { useCallback, useEffect, useState } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { StepperInput } from "@/components/StepperInput";
import { useProfile } from "@/lib/ProfileContext";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";

// ── Types ────────────────────────────────────────────────────────────────────

type Supplier = { id: string; name: string };

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
  favori_commande?: boolean;
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
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  borderBottom: "1px solid #f0ebe2",
  minHeight: 36,
};

const floatingBtn: React.CSSProperties = {
  position: "fixed",
  bottom: 24,
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
  zIndex: 100,
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

/** Derive a human-friendly ordering unit label from supplier_offers data */
function deriveOrderUnit(offer: {
  unit: string | null;
  pack_unit: string | null;
  pack_count: number | null;
  pack_each_qty: number | null;
  pack_each_unit: string | null;
  pack_total_qty: number | null;
} | null): string | null {
  if (!offer) return null;
  // If pack (colis/carton): "colis 6×75cL", "carton 10kg", etc.
  if (offer.pack_count && offer.pack_each_qty && offer.pack_each_unit) {
    return `${offer.pack_count}×${offer.pack_each_qty}${offer.pack_each_unit}`;
  }
  if (offer.pack_total_qty && offer.pack_unit) {
    return `${offer.pack_total_qty}${offer.pack_unit}`;
  }
  // Simple unit
  if (offer.unit) return offer.unit;
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

export default function CommandesPage() {
  const { can } = useProfile();
  const canValidate = can("commandes.valider");

  // All suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  // Current supplier state
  const [session, setSession] = useState<Session | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number | "">>({});
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

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
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      const list = (data ?? []) as Supplier[];
      setSuppliers(list);
      if (list.length > 0) setSelectedSupplierId(list[0].id);
      setLoading(false);
    }
    init();
  }, []);

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
    const { data: offerData } = await supabase
      .from("supplier_offers")
      .select("ingredient_id, unit, pack_unit, pack_count, pack_each_qty, pack_each_unit, pack_total_qty")
      .eq("supplier_id", supplierId)
      .eq("is_active", true);

    const offerMap = new Map<string, typeof offerData extends (infer T)[] | null ? T : never>();
    const offerIngIds: string[] = [];
    for (const o of offerData ?? []) {
      if (o.ingredient_id) {
        offerIngIds.push(o.ingredient_id);
        offerMap.set(o.ingredient_id, o);
      }
    }

    const { data: directIngs } = await supabase
      .from("ingredients")
      .select("id")
      .eq("supplier_id", supplierId);
    const directIds = (directIngs ?? []).map((i: { id: string }) => i.id);

    const allIds = [...new Set([...offerIngIds, ...directIds])];

    let items: CatalogItem[] = [];
    if (allIds.length > 0) {
      const { data: ingData } = await supabase
        .from("ingredients")
        .select("id, name, category, default_unit, favori_commande")
        .in("id", allIds)
        .order("category")
        .order("name");

      items = (ingData ?? []).map((ing: { id: string; name: string; category: string | null; default_unit: string | null; favori_commande?: boolean }) => ({
        ...ing,
        order_unit: deriveOrderUnit(offerMap.get(ing.id) ?? null) ?? ing.default_unit,
      }));
    }
    setCatalog(items);
    setLoadingSupplier(false);
  }, []);

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

  async function saveLigne(sessionId: string, ingredientId: string, qty: number | "") {
    await fetchApi("/api/commandes/ligne", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        ingredient_id: ingredientId,
        quantite: qty === "" ? 0 : Math.floor(qty as number),
      }),
    });
  }

  function handleQtyChange(ingredientId: string, val: number | "") {
    const qty = val === "" ? "" : Math.floor(val as number);
    setQuantities((prev) => ({ ...prev, [ingredientId]: qty }));
    if (session) saveLigne(session.id, ingredientId, qty);
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
    await fetchApi("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "en_attente" }),
    });
    await reloadSession();
    setSaving(false);
    setConfirmation("Commande envoyée pour validation");
    setTimeout(() => setConfirmation(null), 4000);
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

  const activeCount = Object.values(quantities).filter((v) => v !== "" && Number(v) > 0).length;
  const supplierLabel = suppliers.find((s) => s.id === selectedSupplierId)?.name ?? "";
  const readOnly = session?.status === "en_attente" || session?.status === "validee" || session?.status === "recue";

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  }

  // ── Render: unit badge ────────────────────────────────────────────────

  function unitBadge(item: CatalogItem) {
    const u = item.order_unit;
    if (!u) return null;
    return (
      <span style={{
        fontSize: 10, color: "#999", background: "#f5f0e8",
        padding: "2px 6px", borderRadius: 4, flexShrink: 0, whiteSpace: "nowrap",
      }}>
        {u}
      </span>
    );
  }

  // ── Render: summary (read-only) ───────────────────────────────────────

  function renderSummary() {
    if (!session) return null;

    type SummaryItem = { name: string; qty: number; unit: string; category: string };
    const selected: SummaryItem[] = [];

    for (const item of catalog) {
      const q = Number(quantities[item.id] ?? 0);
      if (q > 0) {
        selected.push({
          name: item.name,
          qty: q,
          unit: item.order_unit ?? item.default_unit ?? "",
          category: item.category ?? "autre",
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
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 14px", background: "#f5f0e8",
                    borderRadius: "8px 8px 0 0", borderBottom: `2px solid ${color}`,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#1a1a1a" }}>
                      {catLabel(cat)}
                    </span>
                  </div>
                  {items.map((item, i) => (
                    <div key={i} style={{ ...tile, borderRadius: i === items.length - 1 ? "0 0 8px 8px" : 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", flex: 1 }}>{item.name}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#D4775A", flexShrink: 0 }}>× {item.qty}</span>
                      {item.unit && (
                        <span style={{ fontSize: 11, color: "#999", flexShrink: 0 }}>{item.unit}</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
            <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "#D4775A", marginTop: 12 }}>
              {selected.length} article{selected.length > 1 ? "s" : ""} commandé{selected.length > 1 ? "s" : ""}
            </div>
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
            <div key={cat} style={{ marginBottom: 4 }}>
              <button type="button"
                onClick={() => setOpenCats((prev) => ({ ...prev, [cat]: !isOpen }))}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "space-between", padding: "11px 14px",
                  background: "#fff", border: "1px solid #e5ddd0",
                  borderLeft: `4px solid ${color}`,
                  borderRadius: isOpen ? "10px 10px 0 0" : 10,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "border-radius 0.2s",
                }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, transition: "transform 0.2s", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", display: "inline-block" }}>▾</span>
                  <span style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                    {catLabel(cat)}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: "#999" }}>{allItems.length} article{allItems.length > 1 ? "s" : ""}</span>
                  {selectedCount > 0 && (
                    <span style={{ background: color, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, minWidth: 20, textAlign: "center" }}>
                      {selectedCount}
                    </span>
                  )}
                </span>
              </button>

              <div style={{
                maxHeight: isOpen ? 5000 : 0, overflow: "hidden",
                transition: "max-height 0.3s ease",
                border: isOpen ? "1px solid #e5ddd0" : "none",
                borderTop: "none", borderRadius: "0 0 10px 10px",
              }}>
                {favoris.length > 0 && (
                  <div style={{ background: "#FFFBF0", borderLeft: "3px solid #F59E0B", padding: "6px 0 2px 0" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "#b8860b", padding: "0 14px 4px" }}>
                      Habituels
                    </div>
                    {favoris.map((item) => (
                      <div key={item.id} style={tile}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                          <button type="button" onClick={() => toggleFavori(item.id, true)} style={starBtnStyle(true)} title="Retirer des habituels">&#x2B50;</button>
                          <span style={{
                            fontSize: 13, fontWeight: Number(quantities[item.id] ?? 0) > 0 ? 700 : 500,
                            color: Number(quantities[item.id] ?? 0) > 0 ? "#1a1a1a" : "#666",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{item.name}</span>
                          {unitBadge(item)}
                        </div>
                        <StepperInput value={quantities[item.id] ?? ""} onChange={(v) => handleQtyChange(item.id, v)} step={1} min={0} placeholder="0" />
                      </div>
                    ))}
                  </div>
                )}

                {others.map((item) => (
                  <div key={item.id} style={tile}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                      <button type="button" onClick={() => toggleFavori(item.id, false)} style={starBtnStyle(false)} title="Ajouter aux habituels">&#x2B50;</button>
                      <span style={{
                        fontSize: 13, fontWeight: Number(quantities[item.id] ?? 0) > 0 ? 700 : 500,
                        color: Number(quantities[item.id] ?? 0) > 0 ? "#1a1a1a" : "#666",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{item.name}</span>
                      {unitBadge(item)}
                    </div>
                    <StepperInput value={quantities[item.id] ?? ""} onChange={(v) => handleQtyChange(item.id, v)} step={1} min={0} placeholder="0" />
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
    <RequireRole allowedRoles={["group_admin", "cuisine", "salle"]}>
      <NavBar />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 120px", background: "#f2ede4", minHeight: "100vh" }}>
        <h1 style={{
          fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
          fontSize: 28, fontWeight: 700, color: "#1a1a1a", margin: 0,
        }}>
          Commandes fournisseurs
        </h1>

        {confirmation && (
          <div style={{
            background: "#e8ede6", color: "#4a6741",
            padding: "10px 16px", borderRadius: 10,
            fontSize: 14, fontWeight: 600, marginTop: 16, textAlign: "center",
          }}>
            {confirmation}
          </div>
        )}

        {/* Dropdown fournisseur */}
        {!loading && suppliers.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <select
              value={selectedSupplierId ?? ""}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 12,
                border: "1.5px solid #ddd6c8", background: "#fff",
                fontSize: 15, fontWeight: 700, color: "#1a1a1a",
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                letterSpacing: 0.5, cursor: "pointer",
                appearance: "none",
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 16px center",
              }}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {(loading || loadingSupplier) && (
          <p style={{ textAlign: "center", color: "#999", marginTop: 40 }}>Chargement...</p>
        )}

        {/* Content */}
        {!loading && !loadingSupplier && selectedSupplierId && (
          <div style={{ marginTop: 16 }}>
            {!session && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <p style={{ color: "#999", fontSize: 13, marginBottom: 16 }}>Aucune commande en cours</p>
                <button onClick={() => createSession()} disabled={saving}
                  style={{
                    background: "#D4775A", color: "#fff", border: "none", borderRadius: 12,
                    padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                  }}>
                  Nouvelle commande {supplierLabel}
                </button>
              </div>
            )}

            {session && (readOnly ? renderSummary() : renderCatalog())}
          </div>
        )}

        {/* Historique */}
        {!loading && !loadingSupplier && selectedSupplierId && (
          <div style={{ marginTop: 32 }}>
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

        {/* Bouton flottant */}
        {session && session.status === "brouillon" && activeCount > 0 && (
          <button type="button" onClick={() => envoyerSession(session.id)} disabled={saving} style={floatingBtn}>
            {saving ? "Envoi..." : `Envoyer pour validation (${activeCount} article${activeCount > 1 ? "s" : ""})`}
          </button>
        )}
      </div>
    </RequireRole>
  );
}

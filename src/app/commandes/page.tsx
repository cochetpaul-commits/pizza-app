"use client";

import { useCallback, useEffect, useState } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { StepperInput } from "@/components/StepperInput";
import { supabase } from "@/lib/supabaseClient";

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = "mael" | "metro";

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
  padding: "10px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  borderBottom: "1px solid #f0ebe2",
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

const TABS: { key: Tab; label: string }[] = [
  { key: "mael", label: "MAËL" },
  { key: "metro", label: "METRO" },
];

// ── Helper: group catalog into favoris / others per category ──────────────

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

// ── ReadOnlyQty component ─────────────────────────────────────────────────

function ReadOnlyQty({ value }: { value: number | "" | undefined }) {
  const qty = value === "" || value == null ? 0 : value;
  return (
    <div style={{
      width: 64, height: 40,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: 14,
      color: qty > 0 ? "#1a1a1a" : "#ccc",
    }}>
      {qty > 0 ? `× ${qty}` : "—"}
    </div>
  );
}

// ── Star button style ─────────────────────────────────────────────────────

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

// ── Banner styles ─────────────────────────────────────────────────────────

const pendingBannerStyle: React.CSSProperties = {
  background: "#FFF7ED",
  border: "1.5px solid #EA580C",
  color: "#EA580C",
  padding: "12px 16px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 16,
  textAlign: "center",
};

const validatedBannerStyle: React.CSSProperties = {
  background: "#e8ede6",
  border: "1.5px solid #4a6741",
  color: "#4a6741",
  padding: "10px 16px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 16,
  textAlign: "center",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function CommandesPage() {
  const [tab, setTab] = useState<Tab>("mael");

  // Session state per tab
  const [maelSession, setMaelSession] = useState<Session | null>(null);
  const [maelSupplierId, setMaelSupplierId] = useState<string | null>(null);
  const [metroSession, setMetroSession] = useState<Session | null>(null);
  const [metroSupplierId, setMetroSupplierId] = useState<string | null>(null);

  // Catalogues per supplier
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [metroCatalog, setMetroCatalog] = useState<CatalogItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number | "">>({});
  const [metroQuantities, setMetroQuantities] = useState<Record<string, number | "">>({});

  // Accordion state
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [metroOpenCats, setMetroOpenCats] = useState<Record<string, boolean>>({});

  // Confirmation banner
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Historique
  const [histOpen, setHistOpen] = useState(false);
  const [historique, setHistorique] = useState<HistItem[]>([]);

  // Loading
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Load active sessions ──────────────────────────────────────────────────

  const loadSession = useCallback(async (supplier: string) => {
    const res = await fetch(`/api/commandes/active?supplier=${supplier}`);
    const data = await res.json();
    return data;
  }, []);

  async function loadCatalogForSupplier(supplierId: string): Promise<CatalogItem[]> {
    const { data: offerIngIds } = await supabase
      .from("supplier_offers")
      .select("ingredient_id")
      .eq("supplier_id", supplierId)
      .eq("is_active", true);

    const ids = [...new Set((offerIngIds ?? []).map((o: { ingredient_id: string }) => o.ingredient_id))];

    const { data: directIngs } = await supabase
      .from("ingredients")
      .select("id, name, category, default_unit, favori_commande")
      .eq("supplier_id", supplierId);

    const directIds = (directIngs ?? []).map((i: { id: string }) => i.id);
    const allIds = [...new Set([...ids, ...directIds])];

    if (allIds.length > 0) {
      const { data: items } = await supabase
        .from("ingredients")
        .select("id, name, category, default_unit, favori_commande")
        .in("id", allIds)
        .order("category")
        .order("name");
      return (items ?? []) as CatalogItem[];
    }
    return [];
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      const [maelData, metroData] = await Promise.all([
        loadSession("mael"),
        loadSession("metro"),
      ]);

      setMaelSupplierId(maelData.supplier_id);
      setMaelSession(maelData.session);
      setMetroSupplierId(metroData.supplier_id);
      setMetroSession(metroData.session);

      // Pré-remplir quantités depuis session existante
      if (maelData.session?.lignes) {
        const q: Record<string, number | ""> = {};
        for (const l of maelData.session.lignes) {
          if (l.ingredient_id) q[l.ingredient_id] = l.quantite;
        }
        setQuantities(q);
      }
      if (metroData.session?.lignes) {
        const q: Record<string, number | ""> = {};
        for (const l of metroData.session.lignes) {
          if (l.ingredient_id) q[l.ingredient_id] = l.quantite;
        }
        setMetroQuantities(q);
      }

      // Charger catalogues
      if (maelData.supplier_id) {
        setCatalog(await loadCatalogForSupplier(maelData.supplier_id));
      }
      if (metroData.supplier_id) {
        setMetroCatalog(await loadCatalogForSupplier(metroData.supplier_id));
      }

      setLoading(false);
    }
    init();
  }, [loadSession]);

  // ── Set accordion defaults based on favorites/selected ──────────────────

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
  }, [catalog, maelSession?.id]);

  useEffect(() => {
    if (!metroCatalog.length) return;
    const opens: Record<string, boolean> = {};
    const g = groupCatalog(metroCatalog);
    for (const cat of Object.keys(g)) {
      const hasFav = g[cat].favoris.length > 0;
      const hasSel = [...g[cat].favoris, ...g[cat].others].some((i) => Number(metroQuantities[i.id] ?? 0) > 0);
      opens[cat] = hasFav || hasSel;
    }
    setMetroOpenCats(opens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metroCatalog, metroSession?.id]);

  // ── Create session ────────────────────────────────────────────────────────

  async function createSession(supplierId: string, setSession: (s: Session) => void) {
    setSaving(true);
    const res = await fetch("/api/commandes/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier_id: supplierId }),
    });
    const data = await res.json();
    if (data.session) {
      setSession({ ...data.session, lignes: [] });
    }
    setSaving(false);
  }

  // ── Save ligne ────────────────────────────────────────────────────────────

  async function saveLigne(sessionId: string, ingredientId: string, qty: number | "") {
    await fetch("/api/commandes/ligne", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        ingredient_id: ingredientId,
        quantite: qty === "" ? 0 : Math.floor(qty as number),
      }),
    });
  }

  function handleQtyChange(ingredientId: string, val: number | "", isMael: boolean) {
    const qty = val === "" ? "" : Math.floor(val as number);
    if (isMael) {
      setQuantities((prev) => ({ ...prev, [ingredientId]: qty }));
      if (maelSession) saveLigne(maelSession.id, ingredientId, qty);
    } else {
      setMetroQuantities((prev) => ({ ...prev, [ingredientId]: qty }));
      if (metroSession) saveLigne(metroSession.id, ingredientId, qty);
    }
  }

  // ── Toggle favorite ─────────────────────────────────────────────────────

  async function toggleFavori(ingredientId: string, currentVal: boolean, isMael: boolean) {
    const updateCatalog = isMael ? setCatalog : setMetroCatalog;
    updateCatalog((prev) =>
      prev.map((i) => (i.id === ingredientId ? { ...i, favori_commande: !currentVal } : i))
    );
    try {
      const res = await fetch("/api/commandes/favori", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredient_id: ingredientId, favori: !currentVal }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
    } catch {
      updateCatalog((prev) =>
        prev.map((i) => (i.id === ingredientId ? { ...i, favori_commande: currentVal } : i))
      );
    }
  }

  // ── Envoyer pour validation ───────────────────────────────────────────────

  async function envoyerSession(sessionId: string) {
    setSaving(true);
    await fetch("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "en_attente" }),
    });
    const [maelData, metroData] = await Promise.all([
      loadSession("mael"),
      loadSession("metro"),
    ]);
    setMaelSession(maelData.session);
    setMetroSession(metroData.session);
    reloadQuantities(maelData, metroData);
    setSaving(false);
    setConfirmation("Commande envoyée pour validation");
    setTimeout(() => setConfirmation(null), 4000);
  }

  // ── Valider (admin/direction) ──────────────────────────────────────────

  async function validerSession(sessionId: string) {
    setSaving(true);
    await fetch("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "validee" }),
    });
    const [maelData, metroData] = await Promise.all([
      loadSession("mael"),
      loadSession("metro"),
    ]);
    setMaelSession(maelData.session);
    setMetroSession(metroData.session);
    setQuantities({});
    setMetroQuantities({});
    setSaving(false);
    setConfirmation("Commande validée");
    setTimeout(() => setConfirmation(null), 4000);
  }

  // ── Rejeter → brouillon ────────────────────────────────────────────────

  async function rejeterSession(sessionId: string) {
    setSaving(true);
    await fetch("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "brouillon" }),
    });
    const [maelData, metroData] = await Promise.all([
      loadSession("mael"),
      loadSession("metro"),
    ]);
    setMaelSession(maelData.session);
    setMetroSession(metroData.session);
    reloadQuantities(maelData, metroData);
    setSaving(false);
    setConfirmation("Commande renvoyée en brouillon");
    setTimeout(() => setConfirmation(null), 4000);
  }

  function reloadQuantities(
    maelData: { session?: Session },
    metroData: { session?: Session },
  ) {
    if (maelData.session?.lignes) {
      const q: Record<string, number | ""> = {};
      for (const l of maelData.session.lignes) {
        if (l.ingredient_id) q[l.ingredient_id] = l.quantite;
      }
      setQuantities(q);
    }
    if (metroData.session?.lignes) {
      const q: Record<string, number | ""> = {};
      for (const l of metroData.session.lignes) {
        if (l.ingredient_id) q[l.ingredient_id] = l.quantite;
      }
      setMetroQuantities(q);
    }
  }

  // ── Historique ────────────────────────────────────────────────────────────

  async function loadHistorique() {
    const suppId = tab === "mael" ? maelSupplierId : metroSupplierId;
    if (!suppId) return;
    const res = await fetch(`/api/commandes/historique?supplier_id=${suppId}&limit=10`);
    const data = await res.json();
    setHistorique(data.historique ?? []);
    setHistOpen(true);
  }

  async function dupliquerSession(histSessionId: string) {
    const suppId = tab === "mael" ? maelSupplierId : metroSupplierId;
    if (!suppId) return;
    setSaving(true);

    const res = await fetch("/api/commandes/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier_id: suppId }),
    });
    const { session: newSession } = await res.json();
    if (!newSession) { setSaving(false); return; }

    const sessRes = await fetch(`/api/commandes/session?id=${histSessionId}`);
    const { session: oldSession } = await sessRes.json();

    for (const l of oldSession?.lignes ?? []) {
      await fetch("/api/commandes/ligne", {
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

    const data = await loadSession(tab);
    if (tab === "mael") {
      setMaelSession(data.session);
      if (data.session?.lignes) {
        const q: Record<string, number | ""> = {};
        for (const l of data.session.lignes) {
          if (l.ingredient_id) q[l.ingredient_id] = l.quantite;
        }
        setQuantities(q);
      }
    } else {
      setMetroSession(data.session);
      if (data.session?.lignes) {
        const q: Record<string, number | ""> = {};
        for (const l of data.session.lignes) {
          if (l.ingredient_id) q[l.ingredient_id] = l.quantite;
        }
        setMetroQuantities(q);
      }
    }
    setSaving(false);
    setHistOpen(false);
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const activeSession = tab === "mael" ? maelSession : metroSession;
  const activeSupplierId = tab === "mael" ? maelSupplierId : metroSupplierId;

  const maelCount = Object.values(quantities).filter((v) => v !== "" && (v as number) > 0).length;
  const metroCount = Object.values(metroQuantities).filter((v) => v !== "" && (v as number) > 0).length;
  const activeCount = tab === "mael" ? maelCount : metroCount;

  // ── Render helpers ────────────────────────────────────────────────────────

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  }

  const statusLabel: Record<string, string> = {
    brouillon: "Brouillon",
    en_attente: "En attente de validation",
    validee: "Validée",
    envoyee: "Envoyée",
    recue: "Reçue",
    annulee: "Annulée",
  };

  const statusColor: Record<string, string> = {
    brouillon: "#A0845C",
    en_attente: "#EA580C",
    validee: "#4a6741",
    envoyee: "#2563eb",
    recue: "#16a34a",
    annulee: "#999",
  };

  // ── renderSupplierTab ─────────────────────────────────────────────────────

  function renderSupplierTab(
    session: Session | null,
    supplierId: string | null,
    isMael: boolean,
    supplierLabel: string,
  ) {
    const qty = isMael ? quantities : metroQuantities;
    const count = isMael ? maelCount : metroCount;
    const currentOpenCats = isMael ? openCats : metroOpenCats;
    const setCurrentOpenCats = isMael ? setOpenCats : setMetroOpenCats;
    const currentCatalog = isMael ? catalog : metroCatalog;
    const currentGrouped = groupCatalog(currentCatalog);
    const currentSortedCats = Object.keys(currentGrouped).sort((a, b) => catIndex(a) - catIndex(b));
    const readOnly = session?.status === "en_attente" || session?.status === "validee";

    return (
      <div style={{ marginTop: 16 }}>
        {/* Pas de session active → bouton créer */}
        {!session && supplierId && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <p style={{ color: "#999", fontSize: 13, marginBottom: 16 }}>
              Aucune commande en cours
            </p>
            <button
              onClick={() => createSession(supplierId, isMael ? (s) => setMaelSession(s) : (s) => setMetroSession(s))}
              disabled={saving}
              style={{
                background: "#D4775A", color: "#fff", border: "none", borderRadius: 12,
                padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              }}
            >
              Nouvelle commande {supplierLabel}
            </button>
          </div>
        )}

        {!supplierId && !loading && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <p style={{ color: "#999", fontSize: 13 }}>
              Fournisseur {supplierLabel.toUpperCase()} introuvable dans la base.
            </p>
          </div>
        )}

        {/* Session active */}
        {session && (
          <>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8,
            }}>
              <span style={{ fontSize: 11, color: statusColor[session.status] ?? "#999", fontWeight: 600 }}>
                {statusLabel[session.status] ?? session.status}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#D4775A" }}>
                {count} article{count > 1 ? "s" : ""}
              </span>
            </div>

            {/* ── En attente banner ── */}
            {session.status === "en_attente" && (
              <div style={pendingBannerStyle}>
                <span>En attente de validation</span>
                <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "center" }}>
                  <button
                    onClick={() => rejeterSession(session.id)}
                    disabled={saving}
                    style={{
                      padding: "6px 16px", borderRadius: 8,
                      border: "1.5px solid #8B1A1A", background: "#fff",
                      color: "#8B1A1A", fontWeight: 700, fontSize: 12, cursor: "pointer",
                    }}
                  >
                    Refuser
                  </button>
                  <button
                    onClick={() => validerSession(session.id)}
                    disabled={saving}
                    style={{
                      padding: "6px 16px", borderRadius: 8,
                      border: "none", background: "#4a6741",
                      color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer",
                    }}
                  >
                    Valider
                  </button>
                </div>
              </div>
            )}

            {/* ── Validated banner ── */}
            {session.status === "validee" && (
              <div style={validatedBannerStyle}>
                Commande validée — mode lecture
              </div>
            )}

            {currentCatalog.length === 0 && (
              <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 24 }}>
                Aucun ingrédient lié à {supplierLabel.toUpperCase()} dans le catalogue.
              </p>
            )}

            {/* ── Accordion categories ── */}
            {currentSortedCats.map((cat) => {
              const { favoris, others } = currentGrouped[cat];
              const allItems = [...favoris, ...others];
              const selectedCount = allItems.filter((i) => (qty[i.id] ?? 0) > 0).length;
              const isOpen = currentOpenCats[cat] ?? false;
              const color = CAT_COLORS[cat] ?? "#6B7280";

              return (
                <div key={cat} style={{ marginBottom: 4 }}>
                  {/* Accordion header */}
                  <button
                    type="button"
                    onClick={() => setCurrentOpenCats((prev: Record<string, boolean>) => ({ ...prev, [cat]: !isOpen }))}
                    style={{
                      width: "100%", display: "flex", alignItems: "center",
                      justifyContent: "space-between", padding: "11px 14px",
                      background: "#fff", border: "1px solid #e5ddd0",
                      borderLeft: `4px solid ${color}`,
                      borderRadius: isOpen ? "10px 10px 0 0" : 10,
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "border-radius 0.2s",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 11, transition: "transform 0.2s",
                        transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                        display: "inline-block",
                      }}>▾</span>
                      <span style={{
                        fontWeight: 700, fontSize: 12, textTransform: "uppercase",
                        letterSpacing: 1,
                        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                      }}>
                        {catLabel(cat)}
                      </span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: "#999" }}>
                        {allItems.length} article{allItems.length > 1 ? "s" : ""}
                      </span>
                      {selectedCount > 0 && (
                        <span style={{
                          background: color, color: "#fff", fontSize: 10,
                          fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                          minWidth: 20, textAlign: "center",
                        }}>
                          {selectedCount}
                        </span>
                      )}
                    </span>
                  </button>

                  {/* Accordion body */}
                  <div style={{
                    maxHeight: isOpen ? 5000 : 0, overflow: "hidden",
                    transition: "max-height 0.3s ease",
                    border: isOpen ? "1px solid #e5ddd0" : "none",
                    borderTop: "none", borderRadius: "0 0 10px 10px",
                  }}>
                    {/* Favoris sub-group */}
                    {favoris.length > 0 && (
                      <div style={{
                        background: "#FFFBF0", borderLeft: "3px solid #F59E0B",
                        padding: "6px 0 2px 0",
                      }}>
                        <div style={{
                          fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                          letterSpacing: 2, color: "#b8860b", padding: "0 14px 4px",
                        }}>
                          Habituels
                        </div>
                        {favoris.map((item) => (
                          <div key={item.id} style={tile}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                              <button type="button" onClick={() => toggleFavori(item.id, true, isMael)} style={starBtnStyle(true)} title="Retirer des habituels">⭐</button>
                              <span style={{
                                fontSize: 13, fontWeight: (qty[item.id] ?? 0) > 0 ? 700 : 500,
                                color: (qty[item.id] ?? 0) > 0 ? "#1a1a1a" : "#666",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>
                                {item.name}
                              </span>
                            </div>
                            {readOnly ? (
                              <ReadOnlyQty value={qty[item.id]} />
                            ) : (
                              <StepperInput value={qty[item.id] ?? ""} onChange={(v) => handleQtyChange(item.id, v, isMael)} step={1} min={0} placeholder="0" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Other ingredients */}
                    {others.map((item) => (
                      <div key={item.id} style={tile}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                          <button type="button" onClick={() => toggleFavori(item.id, false, isMael)} style={starBtnStyle(false)} title="Ajouter aux habituels">⭐</button>
                          <span style={{
                            fontSize: 13, fontWeight: (qty[item.id] ?? 0) > 0 ? 700 : 500,
                            color: (qty[item.id] ?? 0) > 0 ? "#1a1a1a" : "#666",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {item.name}
                          </span>
                        </div>
                        {readOnly ? (
                          <ReadOnlyQty value={qty[item.id]} />
                        ) : (
                          <StepperInput value={qty[item.id] ?? ""} onChange={(v) => handleQtyChange(item.id, v, isMael)} step={1} min={0} placeholder="0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <RequireRole allowedRoles={["admin", "direction", "cuisine"]}>
      <NavBar />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 120px" }}>
        <h1 style={{
          fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
          fontSize: 28, fontWeight: 700, color: "#1a1a1a", margin: 0,
        }}>
          Commandes fournisseurs
        </h1>

        {/* ── Confirmation banner ── */}
        {confirmation && (
          <div style={{
            background: "#e8ede6", color: "#4a6741",
            padding: "10px 16px", borderRadius: 10,
            fontSize: 14, fontWeight: 600,
            marginTop: 16, textAlign: "center",
          }}>
            {confirmation}
          </div>
        )}

        {/* ── Onglets ── */}
        <div style={{ display: "flex", gap: 0, marginTop: 20, borderBottom: "2px solid #e5e5e5" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setHistOpen(false); }}
              style={{
                padding: "10px 28px",
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                fontSize: 15,
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? "#D4775A" : "#888",
                background: "none", border: "none",
                borderBottom: tab === t.key ? "3px solid #D4775A" : "3px solid transparent",
                cursor: "pointer", marginBottom: -2,
                transition: "all .15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <p style={{ textAlign: "center", color: "#999", marginTop: 40 }}>Chargement…</p>
        )}

        {/* ── Tab content ── */}
        {!loading && tab === "mael" && renderSupplierTab(maelSession, maelSupplierId, true, "Maël")}
        {!loading && tab === "metro" && renderSupplierTab(metroSession, metroSupplierId, false, "Metro")}

        {/* ═══════════════════════════════════════════════════════════════════
            HISTORIQUE
            ═══════════════════════════════════════════════════════════════════ */}
        {!loading && activeSupplierId && (
          <div style={{ marginTop: 32 }}>
            <button
              type="button"
              onClick={() => histOpen ? setHistOpen(false) : loadHistorique()}
              style={{
                width: "100%", background: "#fff", border: "1px solid #ddd6c8",
                borderRadius: 12, padding: "12px 16px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#666",
              }}
            >
              <span>Commandes précédentes</span>
              <span style={{ fontSize: 16, transition: "transform .2s", transform: histOpen ? "rotate(180deg)" : "none" }}>▾</span>
            </button>

            {histOpen && (
              <div style={{ marginTop: 8 }}>
                {historique.length === 0 && (
                  <p style={{ color: "#ccc", fontSize: 12, textAlign: "center", padding: 16 }}>
                    Aucune commande passée
                  </p>
                )}
                {historique.map((h) => (
                  <div key={h.id} style={{
                    background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12,
                    padding: "10px 14px", marginBottom: 6,
                    display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                          {fmtDate(h.created_at)}
                        </span>
                        <span style={{
                          marginLeft: 8, fontSize: 10, fontWeight: 700,
                          padding: "2px 7px", borderRadius: 6,
                          background: `${statusColor[h.status] ?? "#999"}14`,
                          color: statusColor[h.status] ?? "#999",
                        }}>
                          {statusLabel[h.status] ?? h.status}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: "#999" }}>
                        {h.nb_articles} article{h.nb_articles > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() => dupliquerSession(h.id)}
                        disabled={saving || !!activeSession}
                        style={{
                          fontSize: 11, fontWeight: 600,
                          color: activeSession ? "#ccc" : "#D4775A",
                          background: "none", border: "none",
                          cursor: activeSession ? "not-allowed" : "pointer", padding: 0,
                        }}
                      >
                        Dupliquer →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Bouton flottant ── */}
        {activeSession && activeSession.status === "brouillon" && activeCount > 0 && (
          <button
            type="button"
            onClick={() => envoyerSession(activeSession.id)}
            disabled={saving}
            style={floatingBtn}
          >
            {saving ? "Envoi…" : `Envoyer pour validation (${activeCount} article${activeCount > 1 ? "s" : ""})`}
          </button>
        )}
      </div>
    </RequireRole>
  );
}

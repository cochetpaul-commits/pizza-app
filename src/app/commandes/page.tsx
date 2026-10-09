"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { RequireRole } from "@/components/RequireRole";
import { StepperInput } from "@/components/StepperInput";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import { BarreCommande, MenuCommande } from "@/components/commandes/BarreCommande";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { TableauMobile } from "@/components/ui/TableauMobile";
import { getSupplierColor } from "@/lib/supplierColors";
import { useBureau, useLarge } from "@/hooks/useBureau";
import { CommandesBureau, type CommandeLigne } from "@/components/commandes/CommandesBureau";
import { inChunks } from "@/lib/supabaseChunks";
import { ZONES_EMBED, appliquerZonesEtab, type ZoneEtabRow } from "@/lib/zonesEtablissement";
import { CommandeSimplifiee } from "@/components/commandes/CommandeSimplifiee";
import { styleBarreCategorie, styleChevronBarre, stylePastilleBarre, styleSousCategorie, styleTitreCategorie } from "@/lib/styleCategories";

// ── Types ────────────────────────────────────────────────────────────────────

type DeliveryRule = { day: string; cutoff: string; delivery_day: string };
type Supplier = { id: string; name: string; commande_simplifiee?: boolean; envoi_equipier?: boolean; franco_minimum: number | null; franco_bouteilles?: number | null; delivery_schedule: DeliveryRule[] | null; color: string | null; website: string | null; portal_login: string | null; portal_password: string | null };

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
  email_sent_at?: string | null;
  email_sent_to?: string | null;
  lignes: Ligne[];
};

type CatalogItem = {
  id: string;
  name: string;
  category: string | null;
  sub_category: string | null;
  default_unit: string | null;
  order_unit: string | null;
  order_unit_label: string | null;
  order_quantity: number | null;
  prix_commande: number | null;
  /** prix_commande est le prix du colis entier : la quantité se compte alors en colis, sans bascule unité/carton */
  prix_par_colis: boolean;
  favori_commande?: boolean;
  pack_count: number | null;
  pack_each_qty: number | null;
  stock_objectif: number | null;
  stock_min: number | null;
  storage_zone: string | null;
};

type StockInfo = { stock: number; unit: string | null; avg_daily: number; qty_to_order: number };

type HistItem = {
  id: string;
  status: string;
  created_at: string;
  total_ht: number;
  nb_articles: number;
};

// ── Catégories ordonnées ─────────────────────────────────────────────────────

function catLabel(cat: string | null): string {
  const map: Record<string, string> = {
    cremerie_fromage: "CRÉMERIE / FROMAGE",
    charcuterie_viande: "CHARCUTERIE / VIANDE",
    maree: "MARÉE",
    vins: "VINS",
    spiritueux: "SPIRITUEUX",
    biere: "BIÈRE",
    soft: "SOFTS",
    cafeteria: "CAFÉTÉRIA",
    liqueurs: "LIQUEURS",
    sirops: "SIROPS",
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
  vins: "#8a6b3e",
  spiritueux: "#7C3AED",
  biere: "#D4A017",
  soft: "#6b8f71",
  cafeteria: "#8B6914",
  liqueurs: "#9B59B6",
  sirops: "#E67E22",
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

function catCompare(a: string | null, b: string | null): number {
  return catLabel(a).localeCompare(catLabel(b), "fr");
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
  // Sort by sub_category then name
  const sortFn = (a: CatalogItem, b: CatalogItem) => {
    const sa = a.sub_category ?? "";
    const sb = b.sub_category ?? "";
    if (sa !== sb) return sa.localeCompare(sb, "fr");
    return a.name.localeCompare(b.name, "fr");
  };
  for (const cat of Object.keys(result)) {
    result[cat].favoris.sort(sortFn);
    result[cat].others.sort(sortFn);
  }
  return result;
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

/** Le prix retenu par computeOrderUnitPrice est-il celui du colis entier ?
 *  (vécu 27/09 : lait UHT 6×1 L à 7,20 € le pack compté comme prix d'une brique,
 *  d'où un total ×6 en mode carton et un prix faux en mode unité) */
function isPackPrice(offer: OfferRow | null, orderQty: number | null): boolean {
  if (!offer) return false;
  if (orderQty && orderQty > 0 && offer.unit_price) return false;
  const kind = offer.price_kind ?? "unit";
  return kind === "pack_composed" || kind === "pack_simple";
}

/** Compute the price for one "order unit".
 *  If order_quantity is set (e.g. 2.5 for "bac 2.5kg"), multiply unit_price × order_quantity.
 *  Otherwise fall back to pack_price or unit_price from the offer.
 */
function computeOrderUnitPrice(offer: OfferRow | null, orderQty: number | null, elementSize?: { g: number | null; ml: number | null }): number | null {
  if (!offer) return null;
  const kind = offer.price_kind ?? "unit";

  // If the ingredient has an explicit order_quantity (nombre d'éléments), use unit_price × quantity ;
  // produit au kg / L avec des éléments de taille connue : × la taille de l'élément (colis de 8 pots de 250 g = 2 kg)
  if (orderQty && orderQty > 0 && offer.unit_price) {
    const u = (offer.unit ?? "").toLowerCase();
    if (u === "kg" && elementSize?.g && elementSize.g > 0) return offer.unit_price * orderQty * (elementSize.g / 1000);
    if (u === "l" && elementSize?.ml && elementSize.ml > 0) return offer.unit_price * orderQty * (elementSize.ml / 1000);
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

// ── Supplier color — uses DB color (preferred) or hash fallback ──────────────
const supplierColorCache = new Map<string, string>();
function rebuildSupplierColors(list: Supplier[]) {
  supplierColorCache.clear();
  for (const s of list) supplierColorCache.set(s.name, getSupplierColor(s.name, s.color));
}
function supplierColor(name: string): string {
  return supplierColorCache.get(name) || getSupplierColor(name);
}

// ── Status config ────────────────────────────────────────────────────────────

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
  en_attente: "#2563EB",
  validee: "#4a6741",
  envoyee: "#2563EB",
  recue: "#16a34a",
  annulee: "#999",
};

const statusBannerBg: Record<string, string> = {
  brouillon: "#FFF8F0",
  en_attente: "#EFF6FF",
  validee: "#e8ede6",
  envoyee: "#EFF6FF",
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

/* ── Reception Modal ──────────────────────────────────────────── */

type ReceptionLine = {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  quantite: number;
  unite: string | null;
  prix_unitaire_ht: number | null;
  qty_received: number | null;
  checked: boolean;
  reception_note: string | null;
};

function ReceptionModal({ sessionId, onClose, onDone }: {
  sessionId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [lines, setLines] = useState<ReceptionLine[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchApi(`/api/commandes/reception?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        setLines(data.lines ?? []);
        setSupplierName(data.session?.supplier_name ?? "");
        setLoading(false);
      });
  }, [sessionId]);

  function toggleCheck(id: string) {
    setLines((prev) => prev.map((l) =>
      l.id === id ? {
        ...l,
        checked: !l.checked,
        qty_received: !l.checked ? (l.qty_received ?? l.quantite) : l.qty_received,
      } : l
    ));
  }

  function setQtyReceived(id: string, val: number | null) {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, qty_received: val, checked: true } : l));
  }

  function setNote(id: string, note: string) {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, reception_note: note || null } : l));
  }

  function markAllReceived() {
    setLines((prev) => prev.map((l) => ({ ...l, checked: true, qty_received: l.quantite })));
  }

  async function save(finalize: boolean) {
    setSaving(true);
    await fetchApi("/api/commandes/reception", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        lines: lines.map((l) => ({
          id: l.id,
          qty_received: l.qty_received,
          checked: l.checked,
          reception_note: l.reception_note,
        })),
        finalize,
      }),
    });
    setSaving(false);
    if (finalize) onDone();
    else onClose();
  }

  const allChecked = lines.length > 0 && lines.every((l) => l.checked);
  const checkedCount = lines.filter((l) => l.checked).length;
  const hasEcarts = lines.some((l) => l.checked && l.qty_received != null && l.qty_received !== l.quantite);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#f9f6f0", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 600,
          maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 20px 12px", borderBottom: "1px solid #e5ddd0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#16a34a", letterSpacing: 2, textTransform: "uppercase" }}>
              Pointage réception
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Oswald', sans-serif", color: "#1a1a1a" }}>
              {supplierName}
            </div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
              {checkedCount}/{lines.length} produits pointés
              {hasEcarts && <span style={{ color: "#D4775A", fontWeight: 600 }}> — écarts détectés</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999" }}>✕</button>
        </div>

        {/* Actions bar */}
        <div style={{ padding: "10px 20px", display: "flex", gap: 8, borderBottom: "1px solid #e5ddd0" }}>
          <button
            onClick={markAllReceived}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: "#E8F5E9", color: "#2D6A4F", border: "1px solid #A5D6A7", cursor: "pointer",
            }}
          >
            Tout reçu conforme
          </button>
        </div>

        {/* Lines */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {loading ? (
            <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Chargement...</p>
          ) : lines.map((l) => {
            const ecart = l.checked && l.qty_received != null && l.qty_received !== l.quantite;
            return (
              <div key={l.id} style={{
                display: "flex", flexDirection: "column", gap: 6,
                padding: "12px 14px", marginBottom: 6, borderRadius: 12,
                background: l.checked ? "#fff" : "#fefefe",
                border: ecart ? "1.5px solid #D4775A" : l.checked ? "1.5px solid #A5D6A7" : "1px solid #e5ddd0",
                opacity: l.checked ? 1 : 0.75,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => toggleCheck(l.id)}
                    style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0, cursor: "pointer",
                      border: l.checked ? "2px solid #16a34a" : "2px solid #ddd6c8",
                      background: l.checked ? "#16a34a" : "#fff",
                      color: "#fff", fontSize: 16, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {l.checked ? "✓" : ""}
                  </button>

                  {/* Name + ordered qty */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{l.ingredient_name}</div>
                    <div style={{ fontSize: 11, color: "#999" }}>
                      Commandé : <strong>{l.quantite}</strong> {l.unite ?? ""}
                    </div>
                  </div>

                  {/* Received qty input */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <input
                      type="number"
                      value={l.qty_received ?? ""}
                      onChange={(e) => setQtyReceived(l.id, e.target.value ? Number(e.target.value) : null)}
                      placeholder={String(l.quantite)}
                      style={{
                        width: 60, padding: "6px 8px", borderRadius: 8, textAlign: "center",
                        border: ecart ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
                        fontSize: 14, fontWeight: 700, fontFamily: "'Oswald', sans-serif",
                        outline: "none", background: "#fff",
                      }}
                    />
                    <span style={{ fontSize: 11, color: "#999" }}>{l.unite ?? ""}</span>
                  </div>
                </div>

                {/* Ecart warning + note */}
                {ecart && (
                  <div style={{ fontSize: 11, color: "#D4775A", fontWeight: 600, marginLeft: 38 }}>
                    Écart : {((l.qty_received ?? 0) - l.quantite > 0 ? "+" : "")}{((l.qty_received ?? 0) - l.quantite).toFixed(1)} {l.unite ?? ""}
                  </div>
                )}
                {l.checked && (
                  <input
                    type="text"
                    value={l.reception_note ?? ""}
                    onChange={(e) => setNote(l.id, e.target.value)}
                    placeholder="Note (optionnel)"
                    style={{
                      marginLeft: 38, padding: "4px 8px", borderRadius: 6,
                      border: "1px solid #e5ddd0", fontSize: 11, outline: "none",
                      color: "#666", background: "#faf7f2",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 20px", borderTop: "1px solid #e5ddd0",
          display: "flex", gap: 10,
          paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
        }}>
          <button
            onClick={() => save(false)}
            disabled={saving}
            style={{
              flex: 1, padding: "12px", borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: "#fff", color: "#1a1a1a", border: "1.5px solid #ddd6c8", cursor: "pointer",
            }}
          >
            {saving ? "..." : "Sauvegarder le pointage"}
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving || !allChecked}
            title={allChecked ? "Valider la réception" : "Pointe tous les produits d'abord"}
            style={{
              flex: 1, padding: "12px", borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: allChecked ? "#16a34a" : "#ccc", color: "#fff",
              border: "none", cursor: allChecked ? "pointer" : "not-allowed",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "..." : "Valider réception"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommandesPage() {
  const { current: etab } = useEtablissement();
  const { can } = useProfile();
  const canValidateOrders = can("commandes.valider");
  /** Valider / envoyer : manager et admin partout ; équipier seulement chez un fournisseur réglé « envoi_equipier » */
  const peutEnvoyer = (supplierId: string | null | undefined) => {
    if (canValidateOrders) return true;
    if (!supplierId) return false;
    return suppliers.some((s) => s.envoi_equipier && (s.id === supplierId || supplierAliases.get(s.id)?.has(supplierId)));
  };
  const searchParams = useSearchParams();

  // All suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierAliases, setSupplierAliases] = useState<Map<string, Set<string>>>(new Map());
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  // Bureau : tableau des commandes + volet (src/components/commandes/CommandesBureau) ; téléphone : la page d'avant
  const bureau = useBureau();
  const large = useLarge();
  const [draftSupplierIds, setDraftSupplierIds] = useState<Set<string>>(new Set());

  // Reception modal
  const [receptionSessionId, setReceptionSessionId] = useState<string | null>(null);

  // Current supplier state
  const [session, setSession] = useState<Session | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number | "">>({});
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");

  // Unit mode: carton vs individual (per ingredient)
  const [unitModes, setUnitModes] = useState<Record<string, "individual" | "carton">>({});

  // Stock data (current stock + theoretical order qty per ingredient)
  const [stockData, setStockData] = useState<Record<string, StockInfo>>({});

  // Couleurs des zones de stockage (pastilles de la charte produit)
  const [zoneColors, setZoneColors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!etab?.id) return;
    supabase.from("storage_zones").select("name, couleur").eq("etablissement_id", etab.id)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const z of data ?? []) if (z.couleur) map[z.name] = z.couleur;
        setZoneColors(map);
      });
  }, [etab?.id]);

  // Confirmation banner
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Email sending state
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [portalCreds, setPortalCreds] = useState<{ login: string; password: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [supplierListOpen, setSupplierListOpen] = useState(false);

  // Historique
  const [histOpen, setHistOpen] = useState(false);
  const [historique, setHistorique] = useState<HistItem[]>([]);

  // Global recent orders for dashboard
  const [recentOrders, setRecentOrders] = useState<{
    id: string; supplier_name: string; status: string;
    created_at: string; total_ht: number;
  }[]>([]);

  // Pending receptions (validated orders awaiting reception)
  // Dépliage des commandes (historique & réceptions en attente) : lignes chargées au clic
  type SessionLigne = { id: string; name: string; quantite: number; unite: string; prix_unitaire_ht: number | null; total_ligne_ht: number | null; qty_received: number | null; checked: boolean | null };
  const [sessionLignes, setSessionLignes] = useState<Record<string, SessionLigne[] | "loading">>({});
  /** Charge les articles d'une commande pour le volet bureau (sans dépliage dans la liste) */
  const chargerLignes = useCallback((id: string) => {
    setSessionLignes(prev => {
      if (prev[id]) return prev;
      (async () => {
        try {
          const res = await fetchApi(`/api/commandes/session-lignes?session_id=${id}`);
          const data = await res.json();
          setSessionLignes(p2 => ({ ...p2, [id]: (data.lignes ?? []) as SessionLigne[] }));
        } catch {
          setSessionLignes(p2 => ({ ...p2, [id]: [] }));
        }
      })();
      return { ...prev, [id]: "loading" };
    });
  }, []);
  const [pendingReceptions, setPendingReceptions] = useState<{
    id: string; supplier_id: string; supplier_name: string;
    created_at: string; nb_articles: number; total_ht: number; email_sent_at?: string | null;
  }[]>([]);

  // Active sessions across all suppliers (brouillon + en_attente)
  const [activeSessions, setActiveSessions] = useState<{
    id: string; supplier_id: string; supplier_name: string;
    status: string; created_at: string; nb_articles: number; total_ht: number;
  }[]>([]);

  // Loading
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(false);
  const [initRetry, setInitRetry] = useState(0);
  const [loadingSupplier, setLoadingSupplier] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);

  // ── Load all suppliers ──────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      setInitError(false);
      setLoading(true);
      // Fournisseurs de TOUS les établissements : un même nom (ex. Carniato
      // chez Bello Mio ET Piccola Mia) est regroupé sous une seule entrée,
      // sinon les produits rattachés à la fiche de l'autre resto restaient
      // invisibles au moment de commander. La fiche du resto courant sert de
      // référence (franco, jours de livraison) ; on n'affiche que les
      // fournisseurs présents dans le resto courant.
      // Garde-fou 20 s : si la requête reste coincée (file d'attente réseau,
      // session à rafraîchir…), on affiche une erreur + Réessayer au lieu
      // d'un chargement sans fin.
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000));
      const { data, error } = await Promise.race([
        supabase
          .from("suppliers")
          .select("id, name, etablissement_id, commande_simplifiee, envoi_equipier, franco_minimum, franco_bouteilles, delivery_schedule, color, website")
          .eq("is_active", true)
          .order("name"),
        timeout,
      ]);
      if (error) throw error;
      type SupRow = Supplier & { etablissement_id?: string | null };
      const byName = new Map<string, SupRow[]>();
      for (const s of (data ?? []) as SupRow[]) {
        const key = s.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const arr = byName.get(key) ?? [];
        arr.push(s);
        byName.set(key, arr);
      }
      const aliases = new Map<string, Set<string>>();
      const list: Supplier[] = [];
      for (const rows of byName.values()) {
        if (etab?.id && !rows.some(r => r.etablissement_id === etab.id)) continue;
        const canonical = (etab?.id ? rows.find(r => r.etablissement_id === etab.id) : null) ?? rows[0];
        aliases.set(canonical.id, new Set(rows.map(r => r.id)));
        list.push(canonical);
      }
      list.sort((a, b) => a.name.localeCompare(b.name, "fr"));

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
          .select("id, supplier_id, type, created_at, total_ht, email_sent_at, commande_lignes(count)")
          .eq("etablissement_id", etab.id)
          .in("status", ["validee", "envoyee"])
          .order("created_at", { ascending: false });
        const supplierMap = new Map(list.map((s) => [s.id, s.name]));
        // Also map alias IDs to canonical names
        for (const [canonical, aliasSet] of aliases.entries()) {
          const name = supplierMap.get(canonical);
          if (name) for (const aid of aliasSet) supplierMap.set(aid, name);
        }
        setPendingReceptions(
          (validees ?? []).map((v: { id: string; supplier_id: string; type?: string; created_at: string; total_ht: number; email_sent_at?: string | null; commande_lignes: { count: number }[] }) => ({
            id: v.id,
            supplier_id: v.supplier_id,
            email_sent_at: v.email_sent_at ?? null,
            supplier_name: `${supplierMap.get(v.supplier_id) ?? "Fournisseur"}${v.type === "precommande" ? " — précommande" : ""}`,
            created_at: v.created_at,
            nb_articles: v.commande_lignes?.[0]?.count ?? 0,
            total_ht: v.total_ht ?? 0,
          }))
        );

        // Load active sessions (brouillon + en_attente) across all suppliers
        const { data: actives } = await supabase
          .from("commande_sessions")
          .select("id, supplier_id, type, status, created_at, total_ht, commande_lignes(count)")
          .eq("etablissement_id", etab.id)
          .in("status", ["brouillon", "en_attente"])
          .order("created_at", { ascending: false });
        setActiveSessions(
          (actives ?? [])
            .filter((a: { commande_lignes: { count: number }[] }) => a.commande_lignes?.[0]?.count > 0)
            .map((a: { id: string; supplier_id: string; type?: string; status: string; created_at: string; total_ht: number; commande_lignes: { count: number }[] }) => ({
              id: a.id,
              supplier_id: a.supplier_id,
              supplier_name: `${supplierMap.get(a.supplier_id) ?? "Fournisseur"}${a.type === "precommande" ? " — précommande" : ""}`,
              status: a.status,
              created_at: a.created_at,
              nb_articles: a.commande_lignes?.[0]?.count ?? 0,
              total_ht: a.total_ht ?? 0,
            }))
        );

        // Load recent orders (recue) for dashboard historique
        const { data: recentData } = await supabase
          .from("commande_sessions")
          .select("id, supplier_id, type, status, created_at, total_ht")
          .eq("etablissement_id", etab.id)
          .eq("status", "recue")
          .order("created_at", { ascending: false })
          .limit(8);
        setRecentOrders(
          (recentData ?? []).map((r: { id: string; supplier_id: string; type?: string; status: string; created_at: string; total_ht: number }) => ({
            id: r.id,
            supplier_name: `${supplierMap.get(r.supplier_id) ?? "Fournisseur"}${r.type === "precommande" ? " — précommande" : ""}`,
            status: r.status,
            created_at: r.created_at,
            total_ht: r.total_ht ?? 0,
          }))
        );
      }

      setSuppliers(list);
      rebuildSupplierColors(list);
      setSupplierAliases(aliases);
      // Pre-select from URL param only — otherwise show placeholder "Fournisseur"
      const urlSupplierId = searchParams.get("supplier_id");
      if (urlSupplierId && list.some((s) => s.id === urlSupplierId)) {
        setSelectedSupplierId(urlSupplierId);
      }
      setLoading(false);
    }
    init().catch(() => {
      setInitError(true);
      setLoading(false);
    });
  }, [etab?.id, searchParams, initRetry]);

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
    {
      // Une seule requête pour tous les alias (avant : une par alias, en série)
      const { data: offerData, error: offerErr } = await supabase
        .from("supplier_offers")
        .select("ingredient_id, price_kind, unit, unit_price, pack_price, pack_unit, pack_count, pack_each_qty, pack_each_unit, pack_total_qty, establishment")
        .in("supplier_id", supplierIds)
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
    {
      let directIngQ = supabase
        .from("ingredients")
        .select("id")
        .in("supplier_id", supplierIds);
      if (etabKey) directIngQ = directIngQ.or(`establishments.cs.{"${etabKey}"},establishments.is.null`);
      const { data: directIngs, error: directErr } = await directIngQ;
      if (directErr) console.error("[commandes] direct ingredients query error:", directErr.message);
      for (const i of directIngs ?? []) directIds.push((i as { id: string }).id);
    }

    const allIds = [...new Set([...offerIngIds, ...directIds])];

    let items: CatalogItem[] = [];
    if (allIds.length > 0) {
      const selectCols = "id, name, category, sub_category, default_unit, favori_commande, order_unit_label, order_quantity, piece_weight_g, piece_volume_ml, stock_objectif, stock_min, storage_zone, etablissement_id, " + ZONES_EMBED;
      // Par paquets : au-delà de ~200 identifiants l'URL dépasse la limite PostgREST (400 silencieux)
      const { data: ingRows, error: ingErrMsg } = await inChunks<Record<string, unknown>>(allIds, (batch) => {
        let q = supabase.from("ingredients").select(selectCols).in("id", batch);
        if (etabKey) q = q.or(`establishments.cs.{"${etabKey}"},establishments.is.null`);
        // select composé (embed ingredient_zones) : le typage PostgREST ne sait pas l'analyser
        return q as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
      });
      // Zone de stockage de l'établissement courant (fiche partagée : chaque restaurant a la sienne)
      const ingData = appliquerZonesEtab(ingRows as Array<Record<string, unknown> & { ingredient_zones?: ZoneEtabRow[] | null }>, etab?.id).sort((a, b) =>
        String(a.category ?? "").localeCompare(String(b.category ?? ""), "fr") || String(a.name ?? "").localeCompare(String(b.name ?? ""), "fr"));
      const ingErr = ingErrMsg ? { message: ingErrMsg } : null;

      if (ingErr) console.error("[commandes] ingredient query error:", ingErr.message);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items = (ingData ?? []).map((ing: any) => {
        const offer = (offerMap.get(ing.id) ?? null) as OfferRow | null;
        const oq = ing.order_quantity ?? null;
        return {
          ...ing,
          favori_commande: ing.favori_commande ?? false,
          order_unit_label: ing.order_unit_label ?? null,
          order_quantity: oq,
          order_unit: ing.order_unit_label ?? deriveOrderUnit(offer) ?? ing.default_unit,
          prix_commande: computeOrderUnitPrice(offer, oq, { g: ing.piece_weight_g ?? null, ml: ing.piece_volume_ml ?? null }),
          prix_par_colis: isPackPrice(offer, oq),
          pack_count: offer?.pack_count ?? null,
          pack_each_qty: offer?.pack_each_qty ?? null,
          stock_objectif: ing.stock_objectif ?? null,
          stock_min: ing.stock_min ?? null,
          storage_zone: ing.storage_zone ?? null,
        };
      });
    }
    setCatalog(items);
    setLoadingSupplier(false);
  }, [etab, supplierAliases]);

  // Load stock + commandes théoriques data
  useEffect(() => {
    if (!etab) return;
    (async () => {
      try {
        const [stockRes, ordersRes] = await Promise.all([
          fetchApi("/api/stock"),
          fetchApi("/api/stock/commandes-theoriques"),
        ]);
        const map: Record<string, StockInfo> = {};
        if (stockRes.ok) {
          const sd = await stockRes.json();
          for (const item of sd.items ?? []) {
            map[item.ingredient_id] = { stock: item.stock, unit: item.unit, avg_daily: 0, qty_to_order: 0 };
          }
        }
        if (ordersRes.ok) {
          const od = await ordersRes.json();
          for (const supplier of od.suppliers ?? []) {
            for (const line of supplier.lines ?? []) {
              const existing = map[line.ingredient_id];
              if (existing) {
                existing.avg_daily = line.avg_daily;
                existing.qty_to_order = line.qty_to_order;
              } else {
                map[line.ingredient_id] = { stock: line.current_stock, unit: line.unit, avg_daily: line.avg_daily, qty_to_order: line.qty_to_order };
              }
            }
          }
        }
        setStockData(map);
      } catch { /* ignore */ }
    })();
  }, [etab]);

  useEffect(() => {
    if (selectedSupplierId) {
      void loadForSupplier(selectedSupplierId);
      // Pre-load historique for KPI card
      void (async () => {
        const aliasIds = supplierAliases.get(selectedSupplierId);
        const ids = aliasIds ? Array.from(aliasIds) : [selectedSupplierId];
        const res = await fetchApi(`/api/commandes/historique?supplier_id=${ids.join(",")}&limit=10`);
        const data = await res.json();
        const allHist: HistItem[] = data.historique ?? [];
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

  // Commande simplifiée : quand le brouillon apparaît ou se vide, seules la session et les quantités sont
  // relues, en arrière-plan. Avant, tout l'écran repassait par « Chargement… » (liste démontée, rayons
  // refermés, recherche vidée, défilement perdu, ~3 s) — vécu 28/09 sur Maël et Terre Azur.
  const fournisseurAffiche = React.useRef<string | null>(null);
  useEffect(() => { fournisseurAffiche.current = selectedSupplierId; }, [selectedSupplierId]);
  const rafraichirSession = useCallback(async () => {
    const sid = selectedSupplierId;
    if (!sid) return;
    const res = await fetchApi(`/api/commandes/active?supplier_id=${sid}`);
    if (!res.ok || fournisseurAffiche.current !== sid) return;
    const sess = (await res.json()).session as Session | null;
    if (fournisseurAffiche.current !== sid) return;
    setSession(sess);
    const q: Record<string, number | ""> = {};
    for (const l of sess?.lignes ?? []) if (l.ingredient_id) q[l.ingredient_id] = l.quantite;
    setQuantities(q);
  }, [selectedSupplierId]);
  // Nombre de produits du brouillon simplifié (barre du bas), tenu à jour par l'écran à chaque saisie
  const [nbSimplifiee, setNbSimplifiee] = useState(0);

  async function reloadSession() {
    if (!selectedSupplierId) return;
    await loadForSupplier(selectedSupplierId);
  }

  async function validerSession(sessionId: string) {
    setSaving(true);
    // Save notes before validating
    const res = await fetchApi("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "validee", notes: notes.trim() || undefined }),
    });
    if (!res.ok) { setSaving(false); alert((await res.json().catch(() => ({}))).error ?? "Validation impossible"); return; }
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

  // Depuis une carte « Réceptions en attente » : rouvrir la commande pour la
  // modifier (retour en brouillon + ouverture chez le fournisseur), ou la
  // renvoyer telle quelle par mail.
  async function modifierCommandeValidee(r: { id: string; supplier_id: string; supplier_name: string; email_sent_at?: string | null }) {
    if (!canValidateOrders) { alert("Vous n'avez pas la permission de modifier une commande validée."); return; }
    const msg = r.email_sent_at
      ? `Modifier la commande ${r.supplier_name} déjà envoyée ? Elle repasse en brouillon ; pense à la renvoyer une fois corrigée (le fournisseur recevra un mail « mise à jour »).`
      : `Rouvrir la commande ${r.supplier_name} en brouillon ?`;
    if (!confirm(msg)) return;
    setSaving(true);
    const res = await fetchApi("/api/commandes/session", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, status: "brouillon" }),
    });
    setSaving(false);
    if (!res.ok) { alert("Impossible de rouvrir cette commande."); return; }
    setPendingReceptions((prev) => prev.filter((x) => x.id !== r.id));
    setDraftSupplierIds((prev) => new Set([...prev, r.supplier_id]));
    setSelectedSupplierId(r.supplier_id);
    setConfirmation(`Commande ${r.supplier_name} rouverte — modifie-la puis valide et renvoie`);
    setTimeout(() => setConfirmation(null), 5000);
  }

  async function renvoyerMailCommande(r: { id: string; supplier_name: string; email_sent_at?: string | null }) {
    if (!confirm(r.email_sent_at ? `Renvoyer la commande ${r.supplier_name} par mail ? Le fournisseur recevra un bon marqué « mise à jour ».` : `Envoyer la commande ${r.supplier_name} par mail ?`)) return;
    await sendEmailOnly(r.id);
    setPendingReceptions((prev) => prev.map((x) => x.id === r.id ? { ...x, email_sent_at: new Date().toISOString() } : x));
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
    const res = await fetchApi("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "validee" }),
    });
    if (!res.ok) { setSaving(false); alert((await res.json().catch(() => ({}))).error ?? "Validation impossible"); return; }
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

  function openPortal() {
    if (!currentSupplier?.website) return;
    const url = currentSupplier.website.startsWith("http") ? currentSupplier.website : `https://${currentSupplier.website}`;
    window.open(url, "_blank");
    // Identifiants servis par l'API (admins/managers) — jamais chargés avec la liste
    fetchApi(`/api/fournisseurs/portal?supplier_id=${currentSupplier.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (c && (c.login || c.password)) { setPortalCreds({ login: c.login ?? "", password: c.password ?? "" }); setShowCredentials(true); }
      })
      .catch(() => {});
  }

  async function copyToClipboard(text: string, field: string) {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  async function downloadMercuriale() {
    if (!selectedSupplierId) return;
    const name = currentSupplier?.name ?? "fournisseur";
    const res = await fetchApi("/api/mercuriale/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupBy: "category", filterSupplier: selectedSupplierId }),
    });
    if (!res.ok) { alert("Erreur lors de la génération de la mercuriale"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mercuriale-${name.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Envoi mail via Resend (serveur, zero friction) ──────────────────

  /** Aperçu d'envoi (GET /api/commandes/send-email) : rien n'est envoyé avant « Confirmer l'envoi » */
  type ApercuEnvoi = {
    fournisseur: string; type?: "jour" | "precommande"; avertissement?: string | null; nb_produits: number; total_ht: number;
    livraison: { date: string; libelle: string } | null; adresse: string;
    destinataires: string[]; deja_envoyee_le: string | null; refus: string | null;
  };
  const [ongletMael, setOngletMael] = useState<"jour" | "precommande">("jour");
  const [envoiAConfirmer, setEnvoiAConfirmer] = useState<{ sessionId: string; apercu: ApercuEnvoi | null; erreur: string | null } | null>(null);

  // Toutes les actions « Envoyer » passent par ici : écran de confirmation avant l'envoi
  async function sendEmailOnly(sessionId: string) {
    setEnvoiAConfirmer({ sessionId, apercu: null, erreur: null });
    try {
      const res = await fetchApi(`/api/commandes/send-email?session_id=${encodeURIComponent(sessionId)}`);
      const json = await res.json();
      if (!res.ok) setEnvoiAConfirmer({ sessionId, apercu: null, erreur: json.error ?? "Aperçu impossible" });
      else setEnvoiAConfirmer({ sessionId, apercu: json as ApercuEnvoi, erreur: null });
    } catch {
      setEnvoiAConfirmer({ sessionId, apercu: null, erreur: "Aperçu impossible, vérifie la connexion" });
    }
  }

  async function confirmerEnvoi() {
    if (!envoiAConfirmer) return;
    const sessionId = envoiAConfirmer.sessionId;
    setSendingEmail(true);
    try {
      const res = await fetchApi("/api/commandes/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (data.ok) {
        setEnvoiAConfirmer(null);
        // Vécu 08/10 : envoyée depuis la liste « en cours », la commande y restait affichée en brouillon
        // avec son bouton Supprimer ; une commande Carniato déjà partie chez le fournisseur a été effacée.
        const envoyee = activeSessions.find((s) => s.id === sessionId);
        if (envoyee) {
          setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
          setPendingReceptions((prev) => [{ ...envoyee, email_sent_at: new Date().toISOString() }, ...prev.filter((p) => p.id !== sessionId)]);
          setDraftSupplierIds((prev) => {
            const next = new Set(prev);
            if (!activeSessions.some((s) => s.id !== sessionId && s.supplier_id === envoyee.supplier_id && s.status === "brouillon")) next.delete(envoyee.supplier_id);
            return next;
          });
        }
        // Retour à l'accueil des commandes : le bandeau vert confirme l'envoi
        setConfirmation(`✓ Commande envoyée à ${data.recipients?.join(", ") || "au fournisseur"}${data.livraison?.libelle ? ` — livraison ${data.livraison.libelle}` : ""}`);
        setSession(null);
        setSelectedSupplierId(null);
        setQuantities({});
      } else {
        setEnvoiAConfirmer((e) => e && { ...e, erreur: data.error ?? "Erreur envoi mail" });
      }
    } catch (err) {
      console.error("[commandes] send email error:", err);
      setEnvoiAConfirmer((e) => e && { ...e, erreur: "Erreur lors de l'envoi du mail" });
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

  /**
   * Supprime un brouillon (lignes puis session). Une commande déjà envoyée ou reçue ne se supprime pas :
   * on relit son statut avant d'agir (la liste à l'écran peut être en retard) et la base le refuse de toute
   * façon (déclencheur). Retourne le message d'erreur à afficher, ou null.
   */
  async function supprimerBrouillon(sessionId: string): Promise<string | null> {
    const { data: actuel } = await supabase.from("commande_sessions").select("status").eq("id", sessionId).maybeSingle();
    if (actuel && (actuel.status === "envoyee" || actuel.status === "recue")) {
      return "Cette commande a déjà été envoyée au fournisseur : elle ne peut plus être supprimée. Elle est dans « Réceptions en attente ».";
    }
    const lignes = await supabase.from("commande_lignes").delete().eq("session_id", sessionId);
    if (lignes.error) return `Suppression impossible : ${lignes.error.message}`;
    const sess = await supabase.from("commande_sessions").delete().eq("id", sessionId);
    if (sess.error) return `Suppression impossible : ${sess.error.message}`;
    return null;
  }

  async function deleteSession() {
    if (!session) return;
    if (!confirm("Supprimer cette commande ? Cette action est irréversible.")) return;
    setSaving(true);
    const erreur = await supprimerBrouillon(session.id);
    if (erreur) { setSaving(false); alert(erreur); return; }
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
    const res = await fetchApi(`/api/commandes/historique?supplier_id=${ids.join(",")}&limit=10`);
    const data = await res.json();
    const allHist: HistItem[] = data.historique ?? [];
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
  // Brouillon en cours (hors onglet Précommande, qui a son propre bouton d'envoi)
  const nbArticlesBarre = currentSupplier?.commande_simplifiee ? nbSimplifiee : activeCount;
  const barreVisible = !!session && session.status === "brouillon" && !(currentSupplier?.commande_simplifiee && ongletMael === "precommande");
  // Pendant une commande : barre Menu / Achats masquée, place réservée pour la barre du bas
  useEffect(() => {
    if (!selectedSupplierId) return;
    document.body.classList.add("commande-en-cours");
    return () => document.body.classList.remove("commande-en-cours");
  }, [selectedSupplierId]);
  const supplierLabel = currentSupplier?.name ?? "";
  const readOnly = session?.status === "validee" || session?.status === "envoyee" || session?.status === "recue";

  // Franco calculation
  const francoMin = currentSupplier?.franco_minimum ?? null;
  const orderTotal = catalog.reduce((sum, item) => {
    const qty = Number(quantities[item.id] ?? 0);
    if (qty <= 0 || !item.prix_commande) return sum;
    return sum + qty * item.prix_commande;
  }, 0);
  const francoPercent = francoMin && francoMin > 0 ? Math.min(100, (orderTotal / francoMin) * 100) : null;
  // Franco en bouteilles (cavistes) : une ligne commandée « au carton » compte
  // pour le nombre de bouteilles du carton (quantité de commande ou colisage).
  const francoBtl = currentSupplier?.franco_bouteilles ?? null;
  const orderBottles = catalog.reduce((sum, item) => {
    const qty = Number(quantities[item.id] ?? 0);
    if (qty <= 0) return sum;
    const oq = item.order_quantity && Number.isInteger(item.order_quantity) && item.order_quantity > 1 ? item.order_quantity : null;
    const parCarton = /carton|colis|caisse|pack|lot|×|x\s?\d/i.test(item.order_unit ?? "") && item.pack_count && item.pack_count > 1 ? item.pack_count : null;
    return sum + qty * (oq ?? parCarton ?? 1);
  }, 0);
  const francoBtlPercent = francoBtl && francoBtl > 0 ? Math.min(100, (orderBottles / francoBtl) * 100) : null;
  const francoAtteint = (francoMin != null && francoMin > 0 && orderTotal >= francoMin) || (francoBtl != null && francoBtl > 0 && orderBottles >= francoBtl);

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

  function _stockBadge(item: CatalogItem) {
    const obj = item.stock_objectif;
    if (obj == null || obj <= 0) return null;
    const min = item.stock_min ?? 0;
    const packCount = item.pack_count ?? 0;
    const rawQty = Number(quantities[item.id] ?? 0);
    // Color based on raw qty (in individual units) vs objectives
    let color = "#DC2626";
    let bg = "#ffebee";
    if (rawQty >= obj) { color = "#2e7d32"; bg = "#e8f5e9"; }
    else if (rawQty > 0 && rawQty >= min) { color = "#e65100"; bg = "#fff3e0"; }
    // Display: show stock in individual units + carton equivalent if applicable
    const indiv = individualUnitLabel(item);
    const label = packCount > 0
      ? `obj. ${obj} ${indiv}s (${Math.ceil(obj / packCount)} crt)`
      : `obj. ${obj}`;
    return (
      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: bg, color, whiteSpace: "nowrap" }}>
        {label}
      </span>
    );
  }

  /** Libellé du conditionnement d'un article (« 1 Carton de 6 Bouteilles », « 12 pièces »…), partagé entre la tuile et la ligne de tableau */
  function libelleConditionnement(item: CatalogItem): string | null {
    const packCount = item.pack_count ?? 0;
    const packEach = item.pack_each_qty ?? 1;
    const indiv = individualUnitLabel(item);
    const orderU = (item.order_unit_label ?? item.order_unit ?? "").toLowerCase();
    const isPackUnit = orderU.includes("pack") || orderU.includes("carton") || orderU.includes("colis") || orderU.includes("bloc") || orderU.includes("caisse");
    let condLabel: string | null = null;
    if (packCount > 0) {
      if (isPackUnit) {
        // Determine pack type name (Carton, Pack, Colis...)
        let packTypeName = "Carton";
        if (orderU.includes("pack")) packTypeName = "Pack";
        else if (orderU.includes("colis")) packTypeName = "Colis";
        else if (orderU.includes("bloc")) packTypeName = "Bloc";
        else if (orderU.includes("caisse")) packTypeName = "Caisse";
        // Determine individual unit inside the pack
        const baseUnit = (item.default_unit ?? "").toLowerCase();
        let unitName = "unités";
        if (baseUnit.includes("bouteille") || baseUnit === "bt" || baseUnit === "btl") unitName = packCount > 1 ? "Bouteilles" : "Bouteille";
        else if (baseUnit.includes("sachet")) unitName = packCount > 1 ? "Sachets" : "Sachet";
        else if (baseUnit.includes("barquette")) unitName = packCount > 1 ? "Barquettes" : "Barquette";
        else if (baseUnit.includes("boite") || baseUnit.includes("boîte")) unitName = packCount > 1 ? "Boîtes" : "Boîte";
        else if (baseUnit.includes("bidon")) unitName = packCount > 1 ? "Bidons" : "Bidon";
        else if (baseUnit.includes("pot")) unitName = packCount > 1 ? "Pots" : "Pot";
        else if (baseUnit === "pc" || baseUnit === "pcs" || baseUnit.includes("piece") || baseUnit.includes("pièce")) unitName = packCount > 1 ? "Pièces" : "Pièce";
        else if (baseUnit.includes("bac")) unitName = packCount > 1 ? "Bacs" : "Bac";
        condLabel = `1 ${packTypeName} de ${packCount} ${unitName}`;
      } else {
        condLabel = packEach > 1 ? `${packCount} x ${packEach} ${indiv}s` : `${packCount} ${indiv}${packCount > 1 ? "s" : ""}`;
      }
    }
    return condLabel;
  }

  /** Bureau : une ligne de tableau par article, tout sur une ligne comme la Base produits ; stepper et bascule d'unité dans la colonne Quantité */
  function renderLigneProduit(item: CatalogItem, isFav: boolean, couleur: string) {
    const qty = Number(quantities[item.id] ?? 0);
    const hasQty = qty > 0;
    const packCount = item.pack_count ?? 0;
    const condLabel = libelleConditionnement(item);
    const si = stockData[item.id];
    const min = item.stock_min ?? 0;
    const objG = item.stock_objectif ?? 0;
    const stockVal = si ? Math.round(si.stock * 10) / 10 : null;
    const couleurStock = si == null ? "#999" : si.stock <= min ? "#DC2626" : objG > 0 && si.stock < objG ? "#b45309" : "#2D6A4F";
    const total = hasQty && item.prix_commande != null ? qty * item.prix_commande : null;
    const TDL: React.CSSProperties = { padding: "9px 14px", borderBottom: "1px solid #f0ebe2", verticalAlign: "middle", fontSize: 13, whiteSpace: "nowrap", background: hasQty ? "rgba(212,119,90,0.08)" : undefined };
    return (
      <tr key={item.id}>
        <td style={{ ...TDL, padding: 0, width: 4, background: couleur }} />
        <td style={{ ...TDL, width: 32, paddingRight: 0 }}>
          <button type="button" onClick={() => toggleFavori(item.id, isFav)} title={isFav ? "Retirer des habituels" : "Ajouter aux habituels"}
            style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", opacity: isFav ? 1 : 0.3, padding: 0 }}>&#x2B50;</button>
        </td>
        <td style={{ ...TDL, fontWeight: 600, color: "#1a1a1a", whiteSpace: "normal", minWidth: 220 }}>{item.name}</td>
        <td style={{ ...TDL, color: "#6f6a61", fontSize: 12.5 }}>
          {condLabel ?? (item.order_unit ? `cmd : ${item.order_unit}` : "—")}{condLabel && item.order_unit ? ` · ${item.order_unit}` : ""}
        </td>
        <td style={TDL}>
          {item.storage_zone
            ? <span className="pastille" style={{ "--pastille-c": zoneColors[item.storage_zone] ?? "#b0a894" } as React.CSSProperties}>{item.storage_zone}</span>
            : <span style={{ color: "#a39d92" }}>—</span>}
        </td>
        <td style={TDL}>
          {stockVal != null ? <span style={{ fontWeight: 700, color: couleurStock }}>{stockVal}</span> : <span style={{ color: "#a39d92" }}>—</span>}
          {objG > 0 && <span style={{ fontSize: 11, color: "#999", marginLeft: 6 }}>/ obj. {objG}</span>}
          {si && si.qty_to_order > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#2563EB", marginLeft: 8 }}>à commander {si.qty_to_order}</span>}
        </td>
        <td style={{ ...TDL, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {item.prix_commande != null
            ? <><span style={{ fontWeight: 700 }}>{item.prix_commande.toFixed(2).replace(".", ",")} € HT</span>{item.order_unit && <span style={{ fontSize: 11, color: "#999" }}> · {item.prix_par_colis ? "colis" : item.order_unit}</span>}</>
            : <span style={{ color: "#a39d92" }}>—</span>}
        </td>
        <td style={TDL}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StepperInput value={getDisplayQty(item.id)} onChange={(v) => handleQtyChange(item.id, v)} step={1} min={0} placeholder="0" />
            {packCount > 0 && unitToggle(item)}
          </div>
        </td>
        <td style={{ ...TDL, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: total != null ? "#1a1a1a" : "#a39d92" }}>
          {total != null ? `${total.toFixed(2).replace(".", ",")} €` : "—"}
        </td>
        <td style={{ ...TDL, textAlign: "right", width: 40 }}>
          <a href={`/ingredients?edit=${item.id}&back=${encodeURIComponent("/commandes")}`} title="Modifier la fiche produit"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, background: "rgba(26,26,26,0.06)", color: "#1a1a1a", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>→</a>
        </td>
      </tr>
    );
  }

  /** Téléphone (10/10/2026) : même tableau en trois colonnes — nom + conditionnement · zone · prix + stock, quantité à droite, fiche */
  function renderLigneProduitMobile(item: CatalogItem, isFav: boolean, couleur: string) {
    const qty = Number(quantities[item.id] ?? 0);
    const hasQty = qty > 0;
    const packCount = item.pack_count ?? 0;
    const condLabel = libelleConditionnement(item);
    const si = stockData[item.id];
    const min = item.stock_min ?? 0;
    const objG = item.stock_objectif ?? 0;
    const stockVal = si ? Math.round(si.stock * 10) / 10 : null;
    const couleurStock = si == null ? "#999" : si.stock <= min ? "#DC2626" : objG > 0 && si.stock < objG ? "#b45309" : "#2D6A4F";
    const total = hasQty && item.prix_commande != null ? qty * item.prix_commande : null;
    const TDL: React.CSSProperties = { padding: "9px 6px 9px 10px", borderBottom: "1px solid #f0ebe2", verticalAlign: "middle", fontSize: 13, background: hasQty ? "rgba(212,119,90,0.08)" : undefined };
    const sous = [condLabel ?? (item.order_unit ? `cmd : ${item.order_unit}` : null), item.storage_zone, item.prix_commande != null ? `${item.prix_commande.toFixed(2).replace(".", ",")} € HT${item.order_unit ? ` / ${item.prix_par_colis ? "colis" : item.order_unit}` : ""}` : null].filter(Boolean).join(" · ");
    return (
      <tr key={item.id}>
        <td style={{ ...TDL, padding: 0, width: 4, background: couleur }} />
        <td style={TDL}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <button type="button" onClick={() => toggleFavori(item.id, isFav)} title={isFav ? "Retirer des habituels" : "Ajouter aux habituels"}
              style={{ background: "none", border: "none", fontSize: 12, cursor: "pointer", opacity: isFav ? 1 : 0.25, padding: 0, lineHeight: "17px", flexShrink: 0 }}>&#x2B50;</button>
            <span style={{ fontWeight: 600, color: "#1a1a1a", lineHeight: 1.25 }}>{item.name}</span>
          </div>
          {sous && <div style={{ fontSize: 11.5, color: "#6f6a61", marginTop: 2 }}>{sous}</div>}
          {(stockVal != null || (si && si.qty_to_order > 0)) && (
            <div style={{ fontSize: 11.5, marginTop: 2 }}>
              {stockVal != null && <span style={{ fontWeight: 700, color: couleurStock }}>stock {stockVal}</span>}
              {objG > 0 && <span style={{ color: "#999" }}> / obj. {objG}</span>}
              {si && si.qty_to_order > 0 && <span style={{ fontWeight: 700, color: "#2563EB" }}> · à commander {si.qty_to_order}</span>}
            </div>
          )}
        </td>
        <td style={{ ...TDL, padding: "9px 4px 9px 0", textAlign: "right", whiteSpace: "nowrap" }}>
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <StepperInput value={getDisplayQty(item.id)} onChange={(v) => handleQtyChange(item.id, v)} step={1} min={0} placeholder="0" />
            {packCount > 0 && unitToggle(item)}
            {total != null && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>{total.toFixed(2).replace(".", ",")} €</span>}
          </div>
        </td>
        <td style={{ ...TDL, padding: "9px 8px 9px 2px", width: 30 }}>
          <a href={`/ingredients?edit=${item.id}&back=${encodeURIComponent("/commandes")}`} title="Modifier la fiche produit"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 8, background: "rgba(26,26,26,0.06)", color: "#1a1a1a", textDecoration: "none", fontWeight: 700, fontSize: 12 }}>→</a>
        </td>
      </tr>
    );
  }

  function tableauProduits(items: CatalogItem[], fav: boolean, couleur: string) {
    const THL: React.CSSProperties = { textAlign: "left", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "#a39d92", padding: "8px 14px", borderBottom: "1px solid #ddd6c8", fontWeight: 600, whiteSpace: "nowrap" };
    if (!large) return (
      <TableauMobile sansCadre colonnes={[{ libelle: "Produit" }, { libelle: "Quantité", align: "right", largeur: 128 }, { largeur: 34 }]}>
        {items.map((item) => renderLigneProduitMobile(item, fav, couleur))}
      </TableauMobile>
    );
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 980 }}>
          <thead><tr>
            <th style={{ ...THL, padding: 0, width: 4 }} /><th style={{ ...THL, width: 32, paddingRight: 0 }} />
            <th style={THL}>Produit</th><th style={THL}>Conditionnement</th><th style={THL}>Zone</th><th style={THL}>Stock</th>
            <th style={{ ...THL, textAlign: "right" }}>Prix</th><th style={THL}>Quantité</th><th style={{ ...THL, textAlign: "right" }}>Total HT</th><th style={THL} />
          </tr></thead>
          <tbody>{items.map((item) => renderLigneProduit(item, fav, couleur))}</tbody>
        </table>
      </div>
    );
  }

  function _conditionLabel(item: CatalogItem): string | null {
    const packCount = item.pack_count ?? 0;
    if (packCount <= 0) return null;
    // Use the base unit label (bouteille, sachet, etc.)
    // The order_unit_label tells us the pack type (pack, carton, etc.)
    const orderU = (item.order_unit_label ?? item.order_unit ?? "").toLowerCase();
    const isPackUnit = orderU.includes("pack") || orderU.includes("carton") || orderU.includes("colis") || orderU.includes("bloc") || orderU.includes("caisse");

    if (isPackUnit) {
      // The order unit is the pack itself — describe what's inside
      const baseUnit = (item.default_unit ?? "").toLowerCase();
      let unitName = "unité";
      if (baseUnit.includes("bouteille") || baseUnit === "bt" || baseUnit === "pc") unitName = "bouteille";
      if (baseUnit.includes("sachet")) unitName = "sachet";
      if (baseUnit.includes("barquette")) unitName = "barquette";
      return `${packCount} ${unitName}${packCount > 1 ? "s" : ""}`;
    }
    // Standard: individual unit with pack option
    const indiv = individualUnitLabel(item);
    return `${packCount} ${indiv}${packCount > 1 ? "s" : ""}`;
  }

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
    // Prix au colis : on commande déjà des colis, une bascule multiplierait la quantité sans changer le prix
    if (item.prix_par_colis) return null;
    const indivLabel = individualUnitLabel(item);
    // Don't show toggle when the order unit IS the pack itself
    // e.g. order_unit = "pack" with pack_count = 24 → already ordering packs, no toggle needed
    const orderU = (item.order_unit_label ?? item.order_unit ?? "").toLowerCase();
    const isPackUnit = orderU.includes("pack") || orderU.includes("carton") || orderU.includes("colis") || orderU.includes("bloc") || orderU.includes("caisse");
    if (isPackUnit || indivLabel === "carton") return null;
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

  function _unitPriceBadge(item: CatalogItem) {
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

    const sortedCats = Object.keys(byCat).sort((a, b) => catCompare(a, b));

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
          {(session.status === "validee" || session.status === "envoyee") && (session.email_sent_at
            ? `Commande envoyée le ${new Date(session.email_sent_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} à ${new Date(session.email_sent_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}${session.email_sent_to ? ` (${session.email_sent_to})` : ""}`
            : "Commande validee — pas encore envoyée")}
          {session.status === "recue" && "Commande recue"}
          {session.status === "en_attente" && "En attente (legacy)"}

          {(session.status === "validee" || session.status === "envoyee") && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => downloadPdf(session.id)}
                style={{ padding: "8px 20px", borderRadius: 8, border: "1.5px solid #4a6741", background: "#fff", color: "#4a6741", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Telecharger PDF
              </button>
              <button onClick={() => sendEmailOnly(session.id)} disabled={sendingEmail}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#2563EB", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: sendingEmail ? 0.6 : 1 }}>
                {sendingEmail ? "Envoi..." : session.email_sent_at ? "Renvoyer le mail" : "Envoyer par mail"}
              </button>
              {currentSupplier?.website && (
                <button type="button" onClick={openPortal}
                  style={{ padding: "8px 20px", borderRadius: 8, border: "1.5px solid #D4775A", background: "#fff", color: "#D4775A", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Portail fournisseur
                </button>
              )}
              <button onClick={() => setReceptionSessionId(session.id)} disabled={saving}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Pointer la réception
              </button>
            </div>
          )}

          {(session.status === "validee" || session.status === "envoyee") && (
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
              const couleurCat = CAT_COLORS[cat] ?? "#6B7280";
              return (
                <div key={cat} style={{ marginBottom: 8 }}>
                  {/* Barre de catégorie du récapitulatif : même trame que partout ailleurs */}
                  <div style={{ ...styleBarreCategorie(couleurCat), cursor: "default", marginTop: 12, marginBottom: 6 }}>
                    <span style={styleTitreCategorie(couleurCat)}>
                      {catLabel(cat)} <span style={{ opacity: 0.75, fontWeight: 400 }}>({items.length})</span>
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
    const sortedCats = Object.keys(grouped).sort((a, b) => catCompare(a, b));

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
          const couleur = CAT_COLORS[cat] ?? "#6B7280";

          return (
            <div key={cat} style={{ marginTop: 10, marginBottom: 6 }}>
              {/* Barre de catégorie : même trame que le menu produits, l'inventaire et la commande simplifiée (src/lib/styleCategories.ts) */}
              <button type="button" onClick={() => setOpenCats((prev) => ({ ...prev, [cat]: !isOpen }))} aria-expanded={isOpen}
                className={`barre-categorie${isOpen ? " ouverte" : ""}`}
                style={{ ...styleBarreCategorie(couleur), minHeight: 46, gap: 12, padding: "0 16px", boxShadow: "none", borderRadius: isOpen ? "14px 14px 0 0" : 14 }}>
                <span style={styleTitreCategorie(couleur)}>
                  {catLabel(cat)} <span style={{ opacity: 0.75, fontWeight: 400 }}>({allItems.length})</span>
                </span>
                {selectedCount > 0 && <span style={stylePastilleBarre(couleur)}>{selectedCount}</span>}
                <span style={styleChevronBarre(couleur, isOpen)}>▼</span>
              </button>

              {/* Tableau par sous-catégorie dans un cadre collé à la barre (gabarit Base produits) ; lignes resserrées sur téléphone */}
              {isOpen && (
                <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
                  {favoris.length > 0 && (
                    <>
                      <div style={{ ...styleSousCategorie(couleur, true), cursor: "default", borderRadius: 0 }}><span>Habituels <span style={{ fontWeight: 500, opacity: 0.8 }}>({favoris.length})</span></span></div>
                      {tableauProduits(favoris, true, couleur)}
                    </>
                  )}
                  {others.length > 0 && (() => {
                    if (!others.some((i) => i.sub_category)) return tableauProduits(others, false, couleur);
                    const groupes: { sub: string; items: CatalogItem[] }[] = [];
                    for (const item of others) {
                      const sub = item.sub_category ?? "Autre";
                      const dernier = groupes[groupes.length - 1];
                      if (dernier && dernier.sub === sub) dernier.items.push(item); else groupes.push({ sub, items: [item] });
                    }
                    return groupes.map((g) => (
                      <div key={g.sub}>
                        <div style={{ ...styleSousCategorie(couleur, true), cursor: "default", borderRadius: 0 }}><span>{g.sub} <span style={{ fontWeight: 500, opacity: 0.8 }}>({g.items.length})</span></span></div>
                        {tableauProduits(g.items, false, couleur)}
                      </div>
                    ));
                  })()}
                </div>
              )}

            </div>
          );
        })}
      </>
    );
  }

  const accentColor = etab?.couleur ?? "#D4775A";

  // ── Main render ───────────────────────────────────────────────────────

  return (
    <RequireRole allowedRoles={["group_admin", "manager", "equipier"]}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 16px 120px", background: "#f2ede4", minHeight: "100vh" }}>

        {confirmation && (
          <div style={{
            background: "#e8ede6", color: "#4a6741",
            padding: "10px 16px", borderRadius: 10,
            fontSize: 14, fontWeight: 600, marginBottom: 16, textAlign: "center",
          }}>
            {confirmation}
          </div>
        )}

        {initError && (
          <div style={{
            background: "#fdf0ee", border: "1px solid #eecfc8", color: "#a4442e",
            padding: "14px 16px", borderRadius: 12, marginBottom: 16,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              Les fournisseurs n&apos;ont pas pu être chargés (connexion lente ou coupée).
            </span>
            <button
              type="button"
              onClick={() => setInitRetry((n) => n + 1)}
              style={{
                padding: "8px 18px", borderRadius: 10, border: "none",
                background: "#a4442e", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Bureau : tableau des commandes, compteurs et volet */}
        {!loading && !selectedSupplierId && (
          <CommandesBureau
            bureau={bureau}
            accent={accentColor}
            enCours={activeSessions}
            aRecevoir={pendingReceptions.map((r) => ({ ...r, status: "validee" }))}
            recentes={recentOrders}
            articles={sessionLignes}
            chargerArticles={chargerLignes}
            couleurFournisseur={supplierColor}
            libelleStatut={statusLabel}
            couleurStatut={statusColor}
            fmtDate={fmtDate}
            peutEnvoyer={peutEnvoyer}
            saving={saving}
            sendingEmail={sendingEmail}
            onCommander={() => setSupplierListOpen(true)}
            onOuvrir={(c: CommandeLigne) => {
              if (!c.supplier_id) return;
              let canonicalId = c.supplier_id;
              for (const [cid, aliasSet] of supplierAliases.entries()) {
                if (aliasSet.has(c.supplier_id)) { canonicalId = cid; break; }
              }
              setSelectedSupplierId(canonicalId);
            }}
            onPdf={(c) => { void downloadPdfById(c.id, c.supplier_name); }}
            onEnvoyer={(c) => { void sendEmailForSession(c.id); }}
            onValider={(c) => { void validerActiveSession(c.id); }}
            onSupprimer={async (c) => {
              if (!confirm(`Supprimer la commande ${c.supplier_name} ?`)) return;
              const erreur = await supprimerBrouillon(c.id);
              if (erreur) { alert(erreur); return; }
              setActiveSessions((prev) => prev.filter((x) => x.id !== c.id));
              if (session?.id === c.id) { setSession(null); setQuantities({}); }
              setConfirmation("Commande supprimée");
              setTimeout(() => setConfirmation(null), 3000);
            }}
            onModifier={(c) => { if (c.supplier_id) void modifierCommandeValidee({ id: c.id, supplier_id: c.supplier_id, supplier_name: c.supplier_name, email_sent_at: c.email_sent_at }); }}
            onRenvoyer={(c) => { void renvoyerMailCommande({ id: c.id, supplier_name: c.supplier_name, email_sent_at: c.email_sent_at }); }}
            onPointer={(c) => setReceptionSessionId(c.id)}
          />
        )}

        {/* Current supplier indicator (when selected) */}
        {!loading && selectedSupplierId && currentSupplier && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: supplierColor(currentSupplier.name), flexShrink: 0 }} />
            <span style={{ color: "#999", fontWeight: 500, fontSize: 11 }}>FOURNISSEUR</span>
            <span>{currentSupplier.name}</span>
            {draftSupplierIds.has(currentSupplier.id) && (
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#D4775A" }} />
            )}
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4, opacity: 0.5 }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {barreVisible && session && (
            <MenuCommande actions={[
              { label: "Aperçu PDF", onClick: () => downloadPdf(session.id) },
              { label: "Mettre en pause", onClick: () => pauseSession() },
              ...(nbArticlesBarre > 0 && peutEnvoyer(session.supplier_id ?? currentSupplier?.id) ? [{ label: "Valider sans envoyer", onClick: () => validerSession(session.id), disabled: saving }] : []),
              { label: "Supprimer le brouillon", onClick: () => deleteSession(), danger: true, disabled: saving },
            ]} />
          )}
          </div>
        )}

        {/* Échéance de commande — en haut : en bas elle recouvrait la barre d'actions */}
        {!loading && selectedSupplierId && currentSupplier && (() => {
          const estimate = getDeliveryEstimate();
          if (!estimate) return null;
          return (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              marginTop: 8, padding: "8px 14px",
              background: "#fff", border: "1px solid #ddd6c8", borderRadius: 10,
              fontSize: 11.5, fontWeight: 600, color: "#666",
            }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#D4775A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{estimate}</span>
            </div>
          );
        })()}

        {/* Portail fournisseur + Mercuriale buttons */}
        {currentSupplier && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {currentSupplier.website && (
              <button type="button" onClick={openPortal}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  flex: 1, padding: "10px 12px",
                  borderRadius: 10, border: "1.5px solid #D4775A", background: "#FFF7F4",
                  color: "#D4775A", fontWeight: 700, fontSize: 12,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Portail
              </button>
            )}
            <button type="button" onClick={downloadMercuriale}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                flex: 1, padding: "10px 12px",
                borderRadius: 10, border: "1.5px solid #4a6741", background: "#f4f8f3",
                color: "#4a6741", fontWeight: 700, fontSize: 12,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Mercuriale
            </button>
          </div>
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
                    background: isActive ? (supplierColor(s.name) + "18") : "rgba(255,255,255,0.55)",
                    borderLeft: `4px solid ${isActive ? supplierColor(s.name) : "transparent"}`,
                    transition: "background 0.15s",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: supplierColor(s.name), flexShrink: 0 }} />
                  <span style={{
                    fontSize: 15,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? "#1a1a1a" : "#1a1a1a",
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

        {/* Fournisseurs BottomSheet (opened via FAB) */}
        {!loading && !selectedSupplierId && suppliers.length > 0 && (
          <BottomSheet open={supplierListOpen} onClose={() => setSupplierListOpen(false)} title="Commander par fournisseur">
            <div style={{ display: "flex", flexDirection: "column", paddingBottom: 8 }}>
              {suppliers.map((s, i) => {
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
                      display: "flex", alignItems: "center", gap: 12,
                      width: "100%", padding: "12px 16px",
                      background: "transparent", border: "none",
                      borderTop: i > 0 ? "1px solid #f0ebe2" : "none",
                      cursor: "pointer", textAlign: "left",
                      fontFamily: "inherit",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f9f5ef"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{
                      fontSize: 14, fontWeight: 700, color: "#1a1a1a",
                      fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                      textTransform: "uppercase", letterSpacing: ".03em",
                      flex: 1, minWidth: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {s.name}
                    </span>
                    {nextDelivery && (
                      <span style={{ fontSize: 11, color: "#4a6741", fontWeight: 600, flexShrink: 0 }}>
                        {nextDelivery}
                      </span>
                    )}
                    {hasDraft && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: "#D4775A",
                        padding: "2px 8px", borderRadius: 6,
                        background: "rgba(212,119,90,0.12)",
                        textTransform: "uppercase", letterSpacing: ".05em", flexShrink: 0,
                      }}>
                        brouillon
                      </span>
                    )}
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                );
              })}
            </div>
          </BottomSheet>
        )}

        {/* KPI Cards */}
        {!loading && !loadingSupplier && selectedSupplierId && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {/* Articles en commande — en commande simplifiée (Maël), l'écran a son propre compteur et total à jour */}
            {!currentSupplier?.commande_simplifiee && <>
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
            </>}

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
            {((francoMin != null && francoMin > 0) || (francoBtl != null && francoBtl > 0)) && (
              <div style={{ flex: "1 1 calc(50% - 5px)", minWidth: 140, background: "#fff", borderRadius: 12, border: "1px solid #e0d8ce", padding: "16px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", marginBottom: 6 }}>
                  Franco
                </div>
                {francoMin != null && francoMin > 0 && (<>
                  <div style={{ fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontWeight: 700, fontSize: 24, color: francoAtteint ? "#16a34a" : "#D4775A" }}>
                    {orderTotal.toFixed(0)} € / {francoMin} €
                  </div>
                  <div style={{ height: 4, background: "#f0ebe2", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
                    <div style={{
                      height: "100%", borderRadius: 2, transition: "width 0.3s ease",
                      width: `${francoPercent ?? 0}%`,
                      background: francoAtteint
                        ? "linear-gradient(90deg, #16a34a, #22c55e)"
                        : "linear-gradient(90deg, #D4775A, #E8956F)",
                    }} />
                  </div>
                </>)}
                {francoBtl != null && francoBtl > 0 && (<>
                  <div style={{ fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontWeight: 700, fontSize: francoMin ? 17 : 24, marginTop: francoMin ? 10 : 0, color: francoAtteint ? "#16a34a" : "#D4775A" }}>
                    {francoMin ? "ou " : ""}{orderBottles} / {francoBtl} bouteilles
                  </div>
                  <div style={{ height: 4, background: "#f0ebe2", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
                    <div style={{
                      height: "100%", borderRadius: 2, transition: "width 0.3s ease",
                      width: `${francoBtlPercent ?? 0}%`,
                      background: francoAtteint
                        ? "linear-gradient(90deg, #16a34a, #22c55e)"
                        : "linear-gradient(90deg, #D4775A, #E8956F)",
                    }} />
                  </div>
                </>)}
                {francoAtteint && <div style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", marginTop: 6 }}>✓ Franco atteint</div>}
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
              const res = await fetchApi(`/api/commandes/historique?supplier_id=${ids.join(",")}&limit=1`);
              const data = await res.json();
              const last = data.historique?.[0];
              if (last) { dupliquerSession(last.id); return; }
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
            {session && readOnly ? renderSummary()
              // Commande simplifiée (Maël) : habituels par rayon, qui a ajouté quoi
              : currentSupplier?.commande_simplifiee ? <CommandeSimplifiee supplierId={currentSupplier.id} onChange={rafraichirSession} onNbArticles={setNbSimplifiee} onEnvoyer={sendEmailOnly} onOngletChange={setOngletMael} />
              : renderCatalog()}
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

        {/* Commande en cours : une seule barre fixe en bas (les autres actions : menu « … » en haut) */}
        {barreVisible && session && (
          <BarreCommande nbArticles={nbArticlesBarre} desactive={sendingEmail || saving} onEnvoyer={() => sendEmailOnly(session.id)}
            envoiAdmin={!peutEnvoyer(session.supplier_id ?? currentSupplier?.id)} />
        )}

      </div>

      {/* Confirmation d'envoi : nombre de produits, total HT, livraison, destinataires */}
      {envoiAConfirmer && (() => {
        const a = envoiAConfirmer.apercu;
        const erreur = envoiAConfirmer.erreur ?? a?.refus ?? null;
        return (
          <>
            <div onClick={() => !sendingEmail && setEnvoiAConfirmer(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 10000 }} />
            <div role="dialog" aria-modal="true" style={{
              position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 10001,
              width: "min(420px, 92vw)", maxHeight: "86vh", overflowY: "auto", background: "#fff", borderRadius: 16,
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: "20px 18px",
            }}>
              <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 18, color: "#1a1a1a", marginBottom: 12 }}>
                {a ? `Envoyer la ${a.type === "precommande" ? "précommande" : "commande"} à ${a.fournisseur} ?` : "Préparation de l'envoi…"}
              </div>
              {a && (
                <div style={{ display: "grid", gap: 8, fontSize: 15, color: "#1a1a1a", marginBottom: 14 }}>
                  <div><strong>{a.nb_produits}</strong> produit{a.nb_produits > 1 ? "s" : ""} · <strong>{a.total_ht.toFixed(2).replace(".", ",")} € HT</strong></div>
                  <div>Livraison : <strong>{a.livraison?.libelle ?? "date non définie"}</strong></div>
                  <div style={{ fontSize: 13, color: "#6f6656" }}>{a.adresse}</div>
                  <div style={{ fontSize: 13, color: "#6f6656" }}>À : {a.destinataires.length ? a.destinataires.join(", ") : "aucun contact coché « Commandes »"}</div>
                  {a.avertissement && (
                    <div style={{ fontSize: 14, fontWeight: 600, background: "#fbf0dc", color: "#7a5a2b", border: "1px solid #f0d49c", borderRadius: 8, padding: "10px 12px" }}>
                      {a.avertissement}
                    </div>
                  )}
                  {a.deja_envoyee_le && (
                    <div style={{ fontSize: 13, background: "#fbf0dc", color: "#7a5a2b", borderRadius: 8, padding: "8px 10px" }}>
                      Déjà envoyée le {new Date(a.deja_envoyee_le).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} : ce mail la remplacera (mise à jour).
                    </div>
                  )}
                </div>
              )}
              {erreur && (
                <div style={{ fontSize: 14, background: "#fbeaea", color: "#8a2b2b", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>{erreur}</div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => setEnvoiAConfirmer(null)} disabled={sendingEmail}
                  style={{ flex: 1, height: 50, borderRadius: 12, border: "1.5px solid #ddd6c8", background: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                  {erreur ? "Fermer" : "Annuler"}
                </button>
                {a && !erreur && (
                  <button type="button" onClick={() => void confirmerEnvoi()} disabled={sendingEmail}
                    style={{ flex: 1.4, height: 50, borderRadius: 12, border: "none", background: "#D4775A", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: sendingEmail ? 0.6 : 1 }}>
                    {sendingEmail ? "Envoi…" : "Confirmer l'envoi"}
                  </button>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {/* Panneau trousseau — identifiants portail fournisseur */}
      {showCredentials && currentSupplier && portalCreds && (
        <>
          <div onClick={() => setShowCredentials(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 9998 }} />
          <div style={{
            position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
            background: "#fff", borderRadius: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            padding: "16px 20px", zIndex: 9999, width: "min(360px, 90vw)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>
                Identifiants {currentSupplier.name}
              </div>
              <button type="button" onClick={() => setShowCredentials(false)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#999", padding: 4 }}>
                &times;
              </button>
            </div>

            {portalCreds.login && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>Identifiant</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{
                    flex: 1, padding: "8px 12px", background: "#f5f0e8", borderRadius: 8,
                    fontSize: 13, fontWeight: 600, color: "#1a1a1a", fontFamily: "monospace",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {portalCreds.login}
                  </div>
                  <button type="button" onClick={() => copyToClipboard(portalCreds.login, "login")}
                    style={{
                      padding: "8px 14px", borderRadius: 8, border: "none", fontFamily: "inherit",
                      background: copiedField === "login" ? "#16a34a" : "#D4775A",
                      color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", flexShrink: 0,
                      transition: "background 0.2s",
                    }}>
                    {copiedField === "login" ? "Copie !" : "Copier"}
                  </button>
                </div>
              </div>
            )}

            {portalCreds.password && (
              <div>
                <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>Mot de passe</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{
                    flex: 1, padding: "8px 12px", background: "#f5f0e8", borderRadius: 8,
                    fontSize: 13, fontWeight: 600, color: "#1a1a1a", fontFamily: "monospace",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {"••••••••"}
                  </div>
                  <button type="button" onClick={() => copyToClipboard(portalCreds.password, "password")}
                    style={{
                      padding: "8px 14px", borderRadius: 8, border: "none", fontFamily: "inherit",
                      background: copiedField === "password" ? "#16a34a" : "#D4775A",
                      color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", flexShrink: 0,
                      transition: "background 0.2s",
                    }}>
                    {copiedField === "password" ? "Copie !" : "Copier"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Reception modal */}
      {receptionSessionId && (
        <ReceptionModal
          sessionId={receptionSessionId}
          onClose={() => setReceptionSessionId(null)}
          onDone={async () => {
            setReceptionSessionId(null);
            // Refresh pending receptions
            setPendingReceptions((prev) => prev.filter((r) => r.id !== receptionSessionId));
            if (session?.id === receptionSessionId) await reloadSession();
            setConfirmation("Commande réceptionnée");
            setTimeout(() => setConfirmation(null), 4000);
          }}
        />
      )}

    </RequireRole>
  );
}

"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

import {
  CATEGORIES,
  CAT_COLORS,
  type Category,
  type Ingredient,
  type IngredientStatus,
  type IngredientUpsert,
  type LatestOffer,
  type PriceKind,
  type Supplier,
  type Tab,
} from "@/types/ingredients";

import {
  fmtOfferPriceLine,
  fmtVolume,
  legacyHasPrice,
  normalizeSupplierId,
  offerHasPrice,
  parseNum,
  fmtQty,
} from "@/lib/offers";
import { formatIngredientPrice } from "@/lib/formatPrice";
import { extractVolumeFromName, extractWeightGFromName, detectUnitFromName } from "@/lib/invoices/utils";
import { detectAllergensFromName } from "@/lib/invoices/allergenDetector";
import { detectCategoryFromName } from "@/lib/invoices/categoryDetector";
import { PriceAlertsPanel } from "@/components/PriceAlertsPanel";
import { fetchPriceAlerts, type PriceAlert } from "@/lib/priceAlerts";
import { ALLERGENS, ALLERGEN_SHORT, parseAllergens } from "@/lib/allergens";

type OfferPayload = Record<string, unknown>;

const CAT_LABELS: Record<Category, string> = {
  cremerie_fromage:   "Crémerie / Fromage",
  charcuterie_viande: "Charcuterie / Viande",
  maree:              "Marée",
  alcool_spiritueux:  "Alcool / Spiritueux",
  boisson:            "Boissons",
  legumes_herbes:     "Légumes / Herbes",
  fruit:              "Fruits",
  epicerie_salee:     "Épicerie Salée",
  epicerie_sucree:    "Épicerie Sucrée",
  preparation:        "Préparation",
  sauce:              "Sauce",
  antipasti:          "Antipasti",
  emballage:          "Emballage",
  autre:              "Autre",
};

// kept for typing; used by saveEdit path
function statusLabel(s: IngredientStatus): string {
  if (s === "validated") return "validé";
  if (s === "unknown") return "incompris";
  return "à contrôler";
}

function statusBadgeStyle(s: IngredientStatus): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontSize: 12, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.65)",
  };
  if (s === "validated") return { ...base, borderColor: "rgba(22,163,74,0.35)" };
  if (s === "unknown")   return { ...base, borderColor: "rgba(234,88,12,0.35)" };
  return { ...base, borderColor: "rgba(2,132,199,0.35)" };
}

type IngredientPatch = Partial<
  Pick<Ingredient, "status" | "status_note" | "validated_at" | "validated_by">
>;

// ─── shared input style helpers ────────────────────────────────────────────
const iCls = "w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none";
const sCls = "w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65";
const lCls = "text-[12px] opacity-75 mb-1.5";

// ─── new design helpers ────────────────────────────────────────────────────
function stBadge(st: IngredientStatus) {
  if (st === "validated") return { bg: "#d1fae5", color: "#065f46", label: "Validé" };
  if (st === "unknown")   return { bg: "rgba(234,88,12,0.10)", color: "#EA580C", label: "Incompris" };
  return { bg: "#fef3c7", color: "#92400e", label: "À contrôler" };
}

const BTN_ACTION: CSSProperties = {
  width: 26, height: 26, borderRadius: 7, border: "none",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", flexShrink: 0, fontSize: 14,
};

function IngredientsPageInner() {
  const router = useRouter();

  const [items, setItems] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [offers, setOffers] = useState<LatestOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let unsub: { unsubscribe: () => void } | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
      const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession ?? null);
      });
      unsub = sub?.subscription ?? null;
    })();
    return () => { if (unsub) unsub.unsubscribe(); };
  }, []);

  const userId = session?.user?.id ?? null;

  const searchParams = useSearchParams();
  const backUrl = searchParams.get("back");
  const editParam = searchParams.get("edit");
  const supplierParam = searchParams.get("supplier");

  const [tab, setTab] = useState<Tab>("all");
  const [filterCategory, setFilterCategory] = useState<"all" | Category>("all");
  const [filterSupplier, setFilterSupplier] = useState<"all" | string>(supplierParam ?? "all");
  const [includeNoOffer, setIncludeNoOffer] = useState(true);
  const [filterEstablishment, setFilterEstablishment] = useState<"all" | "bellomio" | "piccola" | "both">("all");

  const suppliersMap = useMemo(() => {
    const m = new Map<string, Supplier>();
    for (const s of suppliers) m.set(s.id, s);
    return m;
  }, [suppliers]);

  const offersByIngredientId = useMemo(() => {
    const m = new Map<string, LatestOffer>();
    for (const o of offers) m.set(o.ingredient_id, o);
    return m;
  }, [offers]);

  const counts = useMemo(() => {
    const c = { to_check: 0, validated: 0, unknown: 0, all: items.length };
    for (const x of items) {
      const s = (x.status ?? "to_check") as IngredientStatus;
      if (s === "to_check") c.to_check += 1;
      else if (s === "validated") c.validated += 1;
      else if (s === "unknown") c.unknown += 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let base = items;
    if (tab !== "all") base = base.filter((x) => ((x.status ?? "to_check") as IngredientStatus) === tab);
    if (filterCategory !== "all") base = base.filter((x) => x.category === filterCategory);
    if (!includeNoOffer) base = base.filter((x) => offersByIngredientId.has(x.id));
    if (filterEstablishment !== "all") {
      base = base.filter((x) => {
        const off = offersByIngredientId.get(x.id);
        const est = off?.establishment ?? "both";
        return est === filterEstablishment || est === "both";
      });
    }
    if (filterSupplier !== "all") {
      base = base.filter((x) => {
        const off = offersByIngredientId.get(x.id);
        const supplierForFilter = (off?.supplier_id ?? x.supplier_id ?? null) as string | null;
        return supplierForFilter != null && supplierForFilter === filterSupplier;
      });
    }
    if (!qq) return base;
    return base.filter((x) => (x.name ?? "").toLowerCase().includes(qq));
  }, [items, q, tab, filterCategory, filterSupplier, filterEstablishment, includeNoOffer, offersByIngredientId]);

  const grouped = useMemo(() => {
    const byCategory = new Map<Category, Ingredient[]>();
    for (const cat of CATEGORIES) byCategory.set(cat, []);
    for (const x of filtered) byCategory.get(x.category)?.push(x);
    for (const arr of byCategory.values()) arr.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "fr"));
    return CATEGORIES.map((cat) => ({ cat, items: byCategory.get(cat) ?? [] })).filter((g) => g.items.length > 0);
  }, [filtered]);

  const [collapsedCats, setCollapsedCats] = useState<Set<Category>>(new Set());

  const allCollapsed = grouped.length > 0 && collapsedCats.size >= grouped.length;
  const filterActive = filterCategory !== "all" || filterSupplier !== "all" || filterEstablishment !== "all";

  const [compactMode, setCompactMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ingredients:compactMode") === "1";
  });
  const toggleCompact = () => setCompactMode(v => {
    const next = !v;
    localStorage.setItem("ingredients:compactMode", next ? "1" : "0");
    return next;
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [alertMap, setAlertMap] = useState<Map<string, PriceAlert>>(new Map());

  function toggleAll() {
    if (allCollapsed) setCollapsedCats(new Set());
    else setCollapsedCats(new Set(grouped.map((g) => g.cat)));
  }
  function toggleCat(cat: Category) {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  async function load() {
    setLoading(true);
    const { data: supData, error: supErr } = await supabase.from("suppliers").select("id,name,is_active").order("name", { ascending: true });
    if (supErr) alert(supErr.message);
    else setSuppliers((supData ?? []) as Supplier[]);

    const { data: ingData, error: ingErr } = await supabase.from("ingredients").select("*").order("name", { ascending: true });
    console.log("ingredients count:", ingData?.length, "error:", ingErr);
    console.log("MAEL ingredients:", ingData?.filter((x: { supplier_id?: string }) => x.supplier_id === '007483c2-0eff-4881-90ea-dd07100ff632'));
    if (ingErr) alert(ingErr.message);
    else setItems((ingData ?? []) as Ingredient[]);

    const { data: offData, error: offErr } = await supabase.from("v_latest_offers").select("*");
    if (offErr) alert(offErr.message);
    else setOffers((offData ?? []) as LatestOffer[]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const alerts = await fetchPriceAlerts(supabase, user.id, 0.05);
        const map = new Map<string, PriceAlert>();
        for (const a of alerts) map.set(a.ingredient_id, a);
        setAlertMap(map);
      }
    } catch { /* silent */ }
    setLoading(false);
  }

  async function setIngredientStatus(id: string, next: IngredientStatus) {
    const ing = items.find((x) => x.id === id);
    const off = offersByIngredientId.get(id);
    if (next === "validated") {
      const hasPrice = offerHasPrice(off) || (ing ? legacyHasPrice(ing) : false);
      if (!hasPrice) { alert("Impossible de valider : ajoute un prix (offre fournisseur ou legacy) avant."); return; }
    }
    const patch: IngredientPatch = { status: next };
    if (next === "validated") {
      if (!userId) { alert("Utilisateur non connecté."); return; }
      patch.validated_at = new Date().toISOString();
      patch.validated_by = userId;
      patch.status_note = null;
    }
    if (next === "to_check") { patch.status_note = null; patch.validated_at = null; patch.validated_by = null; }
    if (next === "unknown") {
      const note = prompt("Pourquoi incompris ? (optionnel)") ?? "";
      patch.status_note = note.trim() ? note.trim() : null;
      patch.validated_at = null; patch.validated_by = null;
    }
    const r = await supabase.from("ingredients").update(patch).eq("id", id);
    if (r.error) { alert(r.error.message); return; }
    await load();
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!editParam || items.length === 0) return;
    const target = items.find((x) => x.id === editParam);
    if (target) { startEdit(target); setTab("all"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, items]);

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("preparation");
  const [newSupplierId, setNewSupplierId] = useState<string>("");
  const [priceKind, setPriceKind] = useState<PriceKind>("unit");
  const [newUnit, setNewUnit] = useState<"kg" | "l" | "pc">("kg");
  const [newUnitPrice, setNewUnitPrice] = useState("");
  const [newDensity, setNewDensity] = useState("1.0");
  const [newPieceWeightG, setNewPieceWeightG] = useState("");
  const [newPieceVolumeMl, setNewPieceVolumeMl] = useState("");
  const [packTotalQty, setPackTotalQty] = useState("");
  const [packPrice, setPackPrice] = useState("");
  const [packCount, setPackCount] = useState("");
  const [packEachQty, setPackEachQty] = useState("");
  const [packEachUnit, setPackEachUnit] = useState<"kg" | "l" | "pc">("l");
  const [packPieceWeightG, setPackPieceWeightG] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{
    name: string; category: Category; is_active: boolean; supplierId: string;
    importName: string;
    useOffer: boolean; priceKind: PriceKind; unit: "kg" | "l" | "pc"; unitPrice: string;
    density: string; pieceWeightG: string; packTotalQty: string; packPrice: string;
    packUnit: "kg" | "l"; packCount: string; packEachQty: string; packEachUnit: "kg" | "l" | "pc";
    packPieceWeightG: string; pieceVolumeMl: string; allergens: string[];
  } | null>(null);

  function handleNewNameChange(value: string) {
    setNewName(value);
    if (!value.trim()) return;
    const detectedCat = detectCategoryFromName(value);
    if (detectedCat !== "autre") setNewCategory(detectedCat);
    const detectedUnit = detectUnitFromName(value);
    setNewUnit(detectedUnit);
    const vol = extractVolumeFromName(value);
    if (vol != null) setNewPieceVolumeMl(String(vol));
    const weightG = extractWeightGFromName(value);
    if (weightG != null) setNewPieceWeightG(String(weightG));
  }

  function resetCreatePriceBlocks() {
    setNewUnit("kg"); setNewUnitPrice(""); setNewDensity("1.0");
    setNewPieceWeightG(""); setNewPieceVolumeMl("");
    setPackTotalQty(""); setPackPrice(""); setPackCount("");
    setPackEachQty(""); setPackEachUnit("l"); setPackPieceWeightG("");
  }

  const previewCreatePack = useMemo(() => {
    let d: LatestOffer | null = null;
    if (priceKind === "unit") {
      const p = parseNum(newUnitPrice);
      if (p != null && p > 0) {
        if (newUnit === "pc") {
          const pw = parseNum(newPieceWeightG);
          d = { ingredient_id: "", supplier_id: "", price_kind: "unit", unit: "pc", unit_price: p, pack_price: null, pack_total_qty: null, pack_unit: null, pack_count: null, pack_each_qty: null, pack_each_unit: null, density_kg_per_l: null, piece_weight_g: pw ?? null };
        } else if (newUnit === "l") {
          const dens = parseNum(newDensity);
          if (dens != null && dens > 0) d = { ingredient_id: "", supplier_id: "", price_kind: "unit", unit: "l", unit_price: p, pack_price: null, pack_total_qty: null, pack_unit: null, pack_count: null, pack_each_qty: null, pack_each_unit: null, density_kg_per_l: dens, piece_weight_g: null };
        } else {
          d = { ingredient_id: "", supplier_id: "", price_kind: "unit", unit: "kg", unit_price: p, pack_price: null, pack_total_qty: null, pack_unit: null, pack_count: null, pack_each_qty: null, pack_each_unit: null, density_kg_per_l: null, piece_weight_g: null };
        }
      }
    } else if (priceKind === "pack_simple") {
      const pp = parseNum(packPrice); const qty = parseNum(packTotalQty);
      if (pp != null && pp > 0 && qty != null && qty > 0) {
        if (newUnit === "l") {
          const dens = parseNum(newDensity);
          if (dens != null && dens > 0) d = { ingredient_id: "", supplier_id: "", price_kind: "pack_simple", unit: null, unit_price: null, pack_price: pp, pack_total_qty: qty, pack_unit: "l", pack_count: null, pack_each_qty: null, pack_each_unit: null, density_kg_per_l: dens, piece_weight_g: null };
        } else {
          d = { ingredient_id: "", supplier_id: "", price_kind: "pack_simple", unit: null, unit_price: null, pack_price: pp, pack_total_qty: qty, pack_unit: "kg", pack_count: null, pack_each_qty: null, pack_each_unit: null, density_kg_per_l: null, piece_weight_g: null };
        }
      }
    } else if (priceKind === "pack_composed") {
      const pp = parseNum(packPrice); const c = parseNum(packCount);
      if (pp != null && pp > 0 && c != null && c > 0) {
        if (packEachUnit === "pc") {
          const pw = parseNum(packPieceWeightG);
          if (pw != null && pw > 0) d = { ingredient_id: "", supplier_id: "", price_kind: "pack_composed", unit: null, unit_price: null, pack_price: pp, pack_total_qty: null, pack_unit: null, pack_count: c, pack_each_qty: null, pack_each_unit: "pc", density_kg_per_l: null, piece_weight_g: pw };
        } else {
          const each = parseNum(packEachQty);
          if (each != null && each > 0) {
            if (packEachUnit === "l") {
              const dens = parseNum(newDensity);
              if (dens != null && dens > 0) d = { ingredient_id: "", supplier_id: "", price_kind: "pack_composed", unit: null, unit_price: null, pack_price: pp, pack_total_qty: null, pack_unit: null, pack_count: c, pack_each_qty: each, pack_each_unit: "l", density_kg_per_l: dens, piece_weight_g: null };
            } else {
              d = { ingredient_id: "", supplier_id: "", price_kind: "pack_composed", unit: null, unit_price: null, pack_price: pp, pack_total_qty: null, pack_unit: null, pack_count: c, pack_each_qty: each, pack_each_unit: "kg", density_kg_per_l: null, piece_weight_g: null };
            }
          }
        }
      }
    }
    if (!d) return "";
    const line = fmtOfferPriceLine(d, { piece_volume_ml: parseNum(newPieceVolumeMl) });
    return `${line.main} • ${line.sub}`;
  }, [priceKind, newUnit, newUnitPrice, newDensity, newPieceWeightG, newPieceVolumeMl, packPrice, packTotalQty, packCount, packEachQty, packEachUnit, packPieceWeightG]);

  type SupplierOfferPayload = {
    user_id: string; ingredient_id: string; supplier_id: string; price_kind: PriceKind;
    is_active: boolean; price: number; unit?: "kg" | "l" | "pc" | null; unit_price?: number | null;
    pack_price?: number | null; pack_total_qty?: number | null; pack_unit?: "kg" | "l" | null;
    pack_count?: number | null; pack_each_qty?: number | null; pack_each_unit?: "kg" | "l" | "pc" | null;
    density_kg_per_l?: number | null; piece_weight_g?: number | null;
  };

  function buildOfferFromCreate(ingredient_id: string, uid: string): SupplierOfferPayload | null {
    const supplier_id = normalizeSupplierId(newSupplierId);
    if (!supplier_id) { alert("Fournisseur obligatoire pour enregistrer une offre."); return null; }
    if (!uid) { alert("Utilisateur non connecté. Impossible d'enregistrer l'offre."); return null; }
    if (priceKind === "unit") {
      const p = parseNum(newUnitPrice);
      if (p == null || p <= 0) { alert("Prix unitaire invalide."); return null; }
      if (newUnit === "pc") { const pw = parseNum(newPieceWeightG) ?? null; return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "pc", unit_price: p, price: p, piece_weight_g: pw, density_kg_per_l: null, is_active: true }; }
      if (newUnit === "l") { const d = parseNum(newDensity); if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; } return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "l", unit_price: p, price: p, density_kg_per_l: d, piece_weight_g: null, is_active: true }; }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "kg", unit_price: p, price: p, density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }
    if (priceKind === "pack_simple") {
      const pp = parseNum(packPrice); const qty = parseNum(packTotalQty);
      if (pp == null || pp <= 0) { alert("Prix du pack invalide."); return null; }
      if (qty == null || qty <= 0) { alert("Quantité totale du pack invalide."); return null; }
      if (newUnit === "l") { const d = parseNum(newDensity); if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; } return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true }; }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }
    if (priceKind === "pack_composed") {
      const pp = parseNum(packPrice); const c = parseNum(packCount);
      if (pp == null || pp <= 0) { alert("Prix du pack invalide."); return null; }
      if (c == null || c <= 0) { alert("Nombre d'unités invalide."); return null; }
      if (packEachUnit === "pc") { const pw = parseNum(packPieceWeightG); if (pw == null || pw <= 0) { alert("Poids pièce obligatoire (g)."); return null; } return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_unit: "pc", piece_weight_g: pw, density_kg_per_l: null, is_active: true }; }
      const each = parseNum(packEachQty);
      if (each == null || each <= 0) { alert("Quantité par élément invalide."); return null; }
      if (packEachUnit === "l") { const d = parseNum(newDensity); if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; } return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_qty: each, pack_each_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true }; }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_qty: each, pack_each_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }
    return null;
  }

  async function addIngredient(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) { alert("Nom obligatoire."); return; }
    const supplier_id = newCategory === "preparation" ? null : (normalizeSupplierId(newSupplierId) || null);
    const baseIngredient: IngredientUpsert = {
      name, category: newCategory,
      allergens: detectAllergensFromName(name).length ? detectAllergensFromName(name) : null,
      is_active: true, default_unit: "g", purchase_price: null, purchase_unit: null,
      purchase_unit_label: null, purchase_unit_name: newUnit, density_g_per_ml: 1.0,
      piece_weight_g: null,
      piece_volume_ml: (() => {
        const fromForm = parseNum(newPieceVolumeMl);
        if (fromForm != null && fromForm > 0) return fromForm;
        const fromName = extractVolumeFromName(name);
        if (fromName != null) return fromName;
        if (newCategory === "alcool_spiritueux" || newCategory === "boisson") return 750;
        return null;
      })(),
      supplier_id,
      import_name: name,
    };
    const ins = await supabase.from("ingredients").insert(baseIngredient).select("id").single();
    if (ins.error) { alert(ins.error.message); return; }
    const ingredient_id = ins.data.id as string;
    if (supplier_id && newCategory !== "preparation") {
      if (!userId) { alert("Utilisateur non connecté. Impossible d'enregistrer l'offre."); return; }
      const offerPayload = buildOfferFromCreate(ingredient_id, userId);
      if (!offerPayload) return;
      const dPrev = await supabase.from("supplier_offers").update({ is_active: false }).eq("ingredient_id", ingredient_id).eq("supplier_id", supplier_id).eq("is_active", true);
      if (dPrev.error) { alert(dPrev.error.message); return; }
      let off = await supabase.from("supplier_offers").insert(offerPayload);
      if (off.error && (off.error as { code?: string }).code === "23505") {
        const dPrev2 = await supabase.from("supplier_offers").update({ is_active: false }).eq("ingredient_id", ingredient_id).eq("supplier_id", supplier_id).eq("is_active", true);
        if (dPrev2.error) { alert(dPrev2.error.message); return; }
        off = await supabase.from("supplier_offers").insert(offerPayload);
      }
      if (off.error) { alert(off.error.message); return; }
    }
    setNewName(""); setNewCategory("preparation"); setNewSupplierId(""); setPriceKind("unit"); resetCreatePriceBlocks();
    await load();
  }

  function startEdit(x: Ingredient) {
    const off = offersByIngredientId.get(x.id);
    const isPrep = x.category === "preparation";
    const supplierId = isPrep ? "" : (off?.supplier_id ?? (x.supplier_id ?? ""));
    setEditingId(x.id);
    setEdit({
      name: x.name, category: x.category, is_active: x.is_active, supplierId,
      importName: x.import_name ?? x.name,
      useOffer: isPrep ? false : true, priceKind: isPrep ? "unit" : (off?.price_kind ?? "unit"),
      unit: (off?.unit ?? "kg") as "kg" | "l" | "pc", unitPrice: off?.unit_price != null ? String(off.unit_price) : "",
      density: off?.density_kg_per_l != null ? String(off.density_kg_per_l) : "1.0",
      pieceWeightG: off?.piece_weight_g != null ? String(off.piece_weight_g) : "",
      pieceVolumeMl: x.piece_volume_ml != null ? String(x.piece_volume_ml) : "",
      packTotalQty: off?.pack_total_qty != null ? String(off.pack_total_qty) : "",
      packPrice: off?.pack_price != null ? String(off.pack_price) : "",
      packUnit: (off?.pack_unit ?? "kg") as "kg" | "l",
      packCount: off?.pack_count != null ? String(off.pack_count) : "",
      packEachQty: off?.pack_each_qty != null ? String(off.pack_each_qty) : "",
      packEachUnit: (off?.pack_each_unit ?? "l") as "kg" | "l" | "pc",
      packPieceWeightG: off?.piece_weight_g != null ? String(off.piece_weight_g) : "",
      allergens: parseAllergens(x.allergens),
    });
  }

  function buildOfferFromEdit(ingredient_id: string, uid: string): OfferPayload | null {
    if (!edit) return null;
    if (!edit.useOffer) return null;
    const supplier_id = edit.category === "preparation" ? null : (normalizeSupplierId(edit.supplierId) || null);
    if (!supplier_id) { alert("Fournisseur obligatoire pour l'offre."); return null; }
    if (!uid) { alert("Utilisateur non connecté. Impossible d'enregistrer l'offre."); return null; }
    if (edit.priceKind === "unit") {
      const p = parseNum(edit.unitPrice);
      if (p == null || p <= 0) { alert("Prix unitaire invalide."); return null; }
      if (edit.unit === "pc") { const pw = parseNum(edit.pieceWeightG) ?? null; return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "pc", unit_price: p, price: p, piece_weight_g: pw, density_kg_per_l: null, is_active: true }; }
      if (edit.unit === "l") { const d = parseNum(edit.density); if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; } return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "l", unit_price: p, price: p, density_kg_per_l: d, piece_weight_g: null, is_active: true }; }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "kg", unit_price: p, price: p, density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }
    if (edit.priceKind === "pack_simple") {
      const pp = parseNum(edit.packPrice); const qty = parseNum(edit.packTotalQty);
      if (pp == null || pp <= 0) { alert("Prix du pack invalide."); return null; }
      if (qty == null || qty <= 0) { alert("Quantité totale du pack invalide."); return null; }
      if (edit.packUnit === "l") { const d = parseNum(edit.density); if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; } return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true }; }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }
    if (edit.priceKind === "pack_composed") {
      const pp = parseNum(edit.packPrice); const c = parseNum(edit.packCount);
      if (pp == null || pp <= 0) { alert("Prix du pack invalide."); return null; }
      if (c == null || c <= 0) { alert("Nombre d'unités invalide."); return null; }
      if (edit.packEachUnit === "pc") { const pw = parseNum(edit.packPieceWeightG); if (pw == null || pw <= 0) { alert("Poids pièce obligatoire (g)."); return null; } return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_unit: "pc", piece_weight_g: pw, density_kg_per_l: null, is_active: true }; }
      const each = parseNum(edit.packEachQty);
      if (each == null || each <= 0) { alert("Quantité par élément invalide."); return null; }
      if (edit.packEachUnit === "l") { const d = parseNum(edit.density); if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; } return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_qty: each, pack_each_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true }; }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_qty: each, pack_each_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }
    return null;
  }

  const previewEditPack = useMemo(() => {
    if (!edit) return "";
    if (!edit.useOffer) return "";
    const d: LatestOffer = {
      ingredient_id: "", supplier_id: "", price_kind: edit.priceKind,
      unit: edit.priceKind === "unit" ? edit.unit : null,
      unit_price: edit.priceKind === "unit" ? parseNum(edit.unitPrice) : null,
      pack_price: edit.priceKind !== "unit" ? parseNum(edit.packPrice) : null,
      pack_total_qty: edit.priceKind === "pack_simple" ? parseNum(edit.packTotalQty) : null,
      pack_unit: edit.priceKind === "pack_simple" ? edit.packUnit : null,
      pack_count: edit.priceKind === "pack_composed" ? parseNum(edit.packCount) : null,
      pack_each_qty: edit.priceKind === "pack_composed" && edit.packEachUnit !== "pc" ? parseNum(edit.packEachQty) : null,
      pack_each_unit: edit.priceKind === "pack_composed" ? edit.packEachUnit : null,
      density_kg_per_l: edit.unit === "l" || edit.packUnit === "l" || edit.packEachUnit === "l" ? parseNum(edit.density) : null,
      piece_weight_g: (edit.unit === "pc" ? parseNum(edit.pieceWeightG) : null) ?? (edit.packEachUnit === "pc" ? parseNum(edit.packPieceWeightG) : null),
    };
    const line = fmtOfferPriceLine(d, { piece_volume_ml: parseNum(edit.pieceVolumeMl) });
    return `${line.main} • ${line.sub}`;
  }, [edit]);

  async function saveEdit() {
    if (!editingId || !edit) return;
    const name = edit.name.trim();
    if (!name) { alert("Nom obligatoire."); return; }
    const supplier_id = normalizeSupplierId(edit.supplierId);
    const up: Partial<IngredientUpsert> = {
      name, category: edit.category, is_active: edit.is_active, supplier_id,
      piece_volume_ml: parseNum(edit.pieceVolumeMl) ?? null,
      allergens: edit.allergens.length ? edit.allergens : null,
    };
    const u1 = await supabase.from("ingredients").update(up).eq("id", editingId);
    if (u1.error) { alert(u1.error.message); return; }
    if (edit.useOffer && supplier_id) {
      if (!userId) { alert("Utilisateur non connecté. Impossible d'enregistrer l'offre."); return; }
      const offerPayload = buildOfferFromEdit(editingId, userId);
      if (!offerPayload) return;
      const dPrev = await supabase.from("supplier_offers").update({ is_active: false }).eq("ingredient_id", editingId).eq("supplier_id", supplier_id).eq("is_active", true);
      if (dPrev.error) { alert(dPrev.error.message); return; }
      let off = await supabase.from("supplier_offers").insert(offerPayload);
      if (off.error && (off.error as { code?: string }).code === "23505") {
        const dPrev2 = await supabase.from("supplier_offers").update({ is_active: false }).eq("ingredient_id", editingId).eq("supplier_id", supplier_id).eq("is_active", true);
        if (dPrev2.error) { alert(dPrev2.error.message); return; }
        off = await supabase.from("supplier_offers").insert(offerPayload);
      }
      if (off.error) { alert(off.error.message); return; }
    }
    setEditingId(null); setEdit(null);
    if (backUrl) { router.push(backUrl); return; }
    await load();
  }

  async function del(id: string, name: string) {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    const d1 = await supabase.from("supplier_offers").delete().eq("ingredient_id", id);
    if (d1.error) { alert(d1.error.message); return; }
    const d2 = await supabase.from("ingredients").delete().eq("id", id);
    if (d2.error) { alert(d2.error.message); return; }
    await load();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const isVariations = tab === ("variations" as Tab);

  const TABS_MAIN = [
    { t: "all"       as Tab, label: "Tous",         count: counts.all },
    { t: "validated" as Tab, label: "Validés",      count: counts.validated },
    { t: "to_check"  as Tab, label: "À contrôler",  count: counts.to_check },
    { t: "unknown"   as Tab, label: "Incompris",    count: counts.unknown },
  ] as const;

  const headerBtnStyle: CSSProperties = {
    height: 32, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: "pointer", border: "1px solid #e5ddd0", background: "white", color: "#1a1a1a",
  };

  return (
    <div style={{ background: "#f5f0e8", minHeight: "100vh" }}>

      {/* ══════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "#ffffff", borderBottom: "1px solid #e5ddd0",
        height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", boxSizing: "border-box",
      }}>
        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, overflow: "hidden" }}>
          <Link href={backUrl ?? "/"} style={{ color: "#999", fontSize: 13, textDecoration: "none", flexShrink: 0, fontWeight: 500 }}>
            ← {backUrl ? "Retour" : "Accueil"}
          </Link>
          <span style={{ fontFamily: "'DM Serif Display', Georgia, 'Times New Roman', serif", fontSize: 18, color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Index ingrédients
          </span>
        </div>

        {/* Right */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
          {/* Variations (desktop) */}
          {userId && (
            <button
              onClick={() => setTab(isVariations ? "all" : "variations" as Tab)}
              className="hidden md:inline-flex"
              style={{ ...headerBtnStyle, color: isVariations ? "#8B1A1A" : "#1a1a1a", borderColor: isVariations ? "#8B1A1A" : "#e5ddd0" }}
            >Variations prix</button>
          )}
          {/* Rafraîchir (desktop) */}
          <button onClick={load} className="hidden md:inline-flex" style={headerBtnStyle}>Rafraîchir</button>
          {/* + Ingrédient */}
          <button
            onClick={() => {
              setShowCreateForm(v => {
                const next = !v;
                if (next) setTimeout(() => document.getElementById("create-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
                return next;
              });
            }}
            style={{ background: "#8B1A1A", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}
          >
            <span className="hidden md:inline" style={{ padding: "0 14px", lineHeight: "32px", display: "inline-block" }}>
              {showCreateForm ? "✕ Fermer" : "+ Ingrédient"}
            </span>
            <span className="md:hidden" style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, borderRadius: "50%" }}>+</span>
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════
          TOOLBAR
      ══════════════════════════════════════════════ */}
      <div style={{ position: "sticky", top: 56, zIndex: 40, background: "#faf7f2", borderBottom: "1px solid #e5ddd0" }}>

        {/* Desktop tabs — pill */}
        <div className="hidden md:flex" style={{ padding: "10px 20px 0", gap: 6, alignItems: "center" }}>
          {TABS_MAIN.map(({ t, label, count }) => (
            <button key={t} onClick={() => setTab(t)} style={{
              height: 32, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: tab === t ? "1px solid #8B1A1A" : "1px solid #e5ddd0",
              background: tab === t ? "#8B1A1A" : "white",
              color: tab === t ? "white" : "#666",
            }}>{label} ({count})</button>
          ))}
        </div>

        {/* Mobile tabs — underline scrollable */}
        <div className="md:hidden" style={{ overflowX: "auto", display: "flex", background: "white", borderBottom: "1px solid #e5ddd0" }}>
          {TABS_MAIN.map(({ t, label, count }) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flexShrink: 0, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: "none", background: "none", whiteSpace: "nowrap",
              color: tab === t ? "#8B1A1A" : "#999",
              borderBottom: tab === t ? "2px solid #8B1A1A" : "2px solid transparent",
            }}>{label} ({count})</button>
          ))}
          {userId && (
            <button onClick={() => setTab("variations" as Tab)} style={{
              flexShrink: 0, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: "none", background: "none", whiteSpace: "nowrap",
              color: isVariations ? "#8B1A1A" : "#999",
              borderBottom: isVariations ? "2px solid #8B1A1A" : "2px solid transparent",
            }}>Variations prix</button>
          )}
        </div>

        {!isVariations && (
          <>
            {/* Desktop filter row */}
            <div className="hidden md:grid" style={{ gridTemplateColumns: "1fr 1fr 1fr auto auto auto", gap: 8, padding: "10px 20px" }}>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as "all" | Category)}
                style={{ height: 34, borderRadius: 8, border: "1px solid #e5ddd0", padding: "0 10px", fontSize: 12, background: "white", color: "#1a1a1a" }}>
                <option value="all">Toutes catégories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
              </select>
              <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)}
                style={{ height: 34, borderRadius: 8, border: "1px solid #e5ddd0", padding: "0 10px", fontSize: 12, background: "white", color: "#1a1a1a" }}>
                <option value="all">Tous fournisseurs</option>
                {suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={filterEstablishment} onChange={(e) => setFilterEstablishment(e.target.value as "all" | "bellomio" | "piccola" | "both")}
                style={{ height: 34, borderRadius: 8, border: "1px solid #e5ddd0", padding: "0 10px", fontSize: 12, background: "white", color: "#1a1a1a" }}>
                <option value="all">Tous établissements</option>
                <option value="bellomio">Bello Mio</option>
                <option value="piccola">Piccola Mia</option>
                <option value="both">Les deux</option>
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={includeNoOffer} onChange={(e) => setIncludeNoOffer(e.target.checked)} />
                Sans offre
              </label>
              <button onClick={toggleAll} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid #e5ddd0", background: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                {allCollapsed ? "Tout déplier" : "Tout replier"}
              </button>
              <button onClick={load} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid #e5ddd0", background: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                ↺
              </button>
            </div>

            {/* Search bar — all sizes */}
            <div style={{ padding: "8px 20px 10px", display: "flex", gap: 8 }}>
              <input
                placeholder="Rechercher un ingrédient…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ flex: 1, height: 34, borderRadius: 8, border: "1px solid #e5ddd0", padding: "0 12px", fontSize: 13, background: "white", outline: "none", color: "#1a1a1a" }}
              />
              {/* Mobile only: Filtres + compact */}
              <button className="md:hidden" onClick={() => setShowFilters(true)} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid #e5ddd0", background: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                Filtres{filterActive ? " ●" : ""}
              </button>
              <button className="md:hidden" onClick={toggleCompact} style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid #e5ddd0", background: "white", fontSize: 14, cursor: "pointer" }}>
                {compactMode ? "⊞" : "☰"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          MAIN
      ══════════════════════════════════════════════ */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px 60px", boxSizing: "border-box" }}>

        {/* Variations panel */}
        {isVariations && userId && (
          <div style={{ marginTop: 20 }}><PriceAlertsPanel userId={userId} /></div>
        )}

        {!isVariations && (
          <>
            {/* ── Create form ── */}
            {showCreateForm && (
              <div id="create-form" style={{ background: "white", border: "1px solid #e5ddd0", borderRadius: 12, padding: "20px", marginTop: 16, marginBottom: 8, animation: "slideDown 0.2s ease-out" }}>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, color: "#1a1a1a" }}>Créer un ingrédient</div>
                <form onSubmit={addIngredient} className="grid gap-3">
                  <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
                    <div><div className={lCls}>Ingrédient</div><input className={iCls} placeholder="Ex: Huile d'olive" value={newName} onChange={(e) => handleNewNameChange(e.target.value)} /></div>
                    <div><div className={lCls}>Catégorie</div>
                      <select className={sCls} value={newCategory} onChange={(e) => { const next = e.target.value as Category; setNewCategory(next); if (next === "preparation") { setNewSupplierId(""); setPriceKind("unit"); resetCreatePriceBlocks(); } }}>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  {newCategory !== "preparation" ? (
                    <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
                      <div><div className={lCls}>Fournisseur</div>
                        <select className={sCls} value={newSupplierId} onChange={(e) => setNewSupplierId(e.target.value)}>
                          <option value="">—</option>
                          {suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="self-end"><button className="btn btnPrimary w-full !h-[44px]" type="submit">Ajouter</button></div>
                    </div>
                  ) : (
                    <div><button className="btn btnPrimary w-full !h-[44px]" type="submit">Ajouter</button></div>
                  )}
                  {newCategory !== "preparation" ? (
                    <>
                      <div><div className={lCls}>Offre fournisseur</div>
                        <select className={sCls} value={priceKind} onChange={(e) => setPriceKind(e.target.value as PriceKind)}>
                          <option value="unit">Unitaire (€/kg, €/L, €/pc)</option>
                          <option value="pack_simple">Pack simple (sac/caisse)</option>
                          <option value="pack_composed">Pack composé (ex: 8 × 1.5 L)</option>
                        </select>
                      </div>
                      {priceKind === "unit" && (
                        <>
                          <div className="grid grid-cols-2 gap-3 items-end">
                            <div><div className={lCls}>Unité</div>
                              <select className={sCls} value={newUnit} onChange={(e) => setNewUnit(e.target.value as "kg" | "l" | "pc")}>
                                <option value="kg">Kilo (kg)</option><option value="l">Litre (L)</option><option value="pc">Pièce (pc)</option>
                              </select>
                            </div>
                            <div><div className={lCls}>Prix</div><input className={iCls} placeholder={newUnit === "pc" ? "Ex: 1.79" : newUnit === "l" ? "Ex: 2.07" : "Ex: 12.50"} inputMode="decimal" value={newUnitPrice} onChange={(e) => setNewUnitPrice(e.target.value)} /></div>
                          </div>
                          {newUnit === "l" && <div><div className={lCls}>Densité (kg/L)</div><input className={iCls} value={newDensity} onChange={(e) => setNewDensity(e.target.value)} /></div>}
                          {newUnit === "pc" && <><div><div className={lCls}>Poids d&apos;une pièce (g)</div><input className={iCls} placeholder="Ex: 125" inputMode="decimal" value={newPieceWeightG} onChange={(e) => setNewPieceWeightG(e.target.value)} /></div><div><div className={lCls}>Volume pièce (ml)</div><input className={iCls} placeholder="ex: 700 pour 70cl" inputMode="decimal" value={newPieceVolumeMl} onChange={(e) => setNewPieceVolumeMl(e.target.value)} /></div></>}
                        </>
                      )}
                      {priceKind === "pack_simple" && (
                        <>
                          <div className="grid grid-cols-2 gap-3 items-end">
                            <div><div className={lCls}>Unité pack</div>
                              <select className={sCls} value={newUnit} onChange={(e) => setNewUnit(e.target.value as "kg" | "l" | "pc")}>
                                <option value="kg">Kilo (kg)</option><option value="l">Litre (L)</option>
                              </select>
                            </div>
                            <div><div className={lCls}>Prix du pack (€)</div><input className={iCls} placeholder="Ex: 53.99" inputMode="decimal" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} /></div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 items-end">
                            <div><div className={lCls}>Quantité totale ({newUnit === "kg" ? "kg" : "L"})</div><input className={iCls} placeholder={newUnit === "kg" ? "Ex: 25" : "Ex: 12"} inputMode="decimal" value={packTotalQty} onChange={(e) => setPackTotalQty(e.target.value)} /></div>
                            <div className="muted text-[12px]">{previewCreatePack || "—"}</div>
                          </div>
                          {newUnit === "l" && <div><div className={lCls}>Densité (kg/L)</div><input className={iCls} value={newDensity} onChange={(e) => setNewDensity(e.target.value)} /></div>}
                        </>
                      )}
                      {priceKind === "pack_composed" && (
                        <>
                          <div className="grid grid-cols-2 gap-3 items-end">
                            <div><div className={lCls}>Prix du pack (€)</div><input className={iCls} placeholder="Ex: 18.56" inputMode="decimal" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} /></div>
                            <div><div className={lCls}>Nombre d&apos;unités</div><input className={iCls} placeholder="Ex: 8" inputMode="decimal" value={packCount} onChange={(e) => setPackCount(e.target.value)} /></div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 items-end">
                            <div><div className={lCls}>Unité de chaque élément</div>
                              <select className={sCls} value={packEachUnit} onChange={(e) => setPackEachUnit(e.target.value as "kg" | "l" | "pc")}>
                                <option value="l">Litre (L)</option><option value="kg">Kilo (kg)</option><option value="pc">Pièce (pc)</option>
                              </select>
                            </div>
                            {packEachUnit !== "pc" ? <div><div className={lCls}>Quantité par élément ({packEachUnit === "kg" ? "kg" : "L"})</div><input className={iCls} placeholder={packEachUnit === "kg" ? "Ex: 1" : "Ex: 1.5"} inputMode="decimal" value={packEachQty} onChange={(e) => setPackEachQty(e.target.value)} /></div>
                              : <div><div className={lCls}>Poids d&apos;une pièce (g)</div><input className={iCls} placeholder="Ex: 125" inputMode="decimal" value={packPieceWeightG} onChange={(e) => setPackPieceWeightG(e.target.value)} /></div>}
                          </div>
                          {packEachUnit === "l" && <div><div className={lCls}>Densité (kg/L)</div><input className={iCls} value={newDensity} onChange={(e) => setNewDensity(e.target.value)} /></div>}
                        </>
                      )}
                    </>
                  ) : null}
                </form>
              </div>
            )}

            {/* Loading */}
            {loading && <div style={{ padding: "40px 0", textAlign: "center", color: "#999", fontSize: 14 }}>Chargement…</div>}

            {/* ── Table container ── */}
            {!loading && (
              <div style={{ background: "white", border: "1px solid #e5ddd0", borderRadius: 10, overflow: "hidden", marginTop: 12 }}>

                {/* Desktop thead */}
                <div className="hidden md:flex" style={{ background: "#ede6d9", padding: "8px 16px", alignItems: "center", gap: 8, borderBottom: "1px solid #e5ddd0" }}>
                  {[
                    { label: "Désignation", flex: "2.5" },
                    { label: "Prix", flex: "1" },
                    { label: "Conditionnement", flex: "1" },
                    { label: "Statut", flex: "0.8" },
                    { label: "Fournisseur", flex: "0.8" },
                  ].map(({ label, flex }) => (
                    <div key={label} style={{ flex, fontSize: 10, fontWeight: 700, color: "#999999", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                  ))}
                  <div style={{ width: 80, fontSize: 10, fontWeight: 700, color: "#999999", textTransform: "uppercase", letterSpacing: 1 }}>Actions</div>
                </div>

                {/* Grouped rows */}
                {grouped.map(({ cat, items: catItems }) => {
                  const isCollapsed = collapsedCats.has(cat);
                  return (
                    <div key={cat}>
                      {/* Category header */}
                      <button
                        onClick={() => toggleCat(cat)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 10,
                          padding: "7px 16px", background: "#f5f0e8", border: "none",
                          borderBottom: "1px solid #e5ddd0", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: CAT_COLORS[cat], flexShrink: 0 }} />
                        <span style={{ fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: "#1a1a1a" }}>{CAT_LABELS[cat]}</span>
                        <span style={{ fontSize: 11, color: "#999" }}>({catItems.length})</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: "#999" }}>{isCollapsed ? "▶" : "▼"}</span>
                      </button>

                      {!isCollapsed && catItems.map((x) => {
                        const isEditing = editingId === x.id;
                        const offer = offersByIngredientId.get(x.id);
                        const price = formatIngredientPrice(x, offer ?? null);
                        const estab = offer?.establishment ?? "both";
                        const estabBadge = estab === "bellomio"
                          ? { label: "BM", bg: "#FEF2F2", color: "#8B1A1A" }
                          : estab === "piccola"
                          ? { label: "PM", bg: "#F5F3FF", color: "#6B21A8" }
                          : { label: "BM·PM", bg: "#F3F4F6", color: "#6B7280" };
                        const supplierIdForDisplay = offer?.supplier_id ?? x.supplier_id;
                        const supplierName = supplierIdForDisplay ? suppliersMap.get(supplierIdForDisplay)?.name : null;
                        const st = (x.status ?? "to_check") as IngredientStatus;
                        const hasPrice = offerHasPrice(offer) || legacyHasPrice(x);
                        const canValidate = hasPrice;
                        const alg = parseAllergens(x.allergens);
                        const alert = alertMap.get(x.id);
                        const sb = stBadge(st);
                        const condInfo = offer?.density_kg_per_l != null ? `${fmtQty(offer.density_kg_per_l)} kg/L`
                          : offer?.piece_weight_g != null ? `${fmtQty(offer.piece_weight_g)} g/pc`
                          : x.piece_volume_ml != null ? fmtVolume(x.piece_volume_ml) + "/pc"
                          : x.purchase_unit_name === "l" ? `${x.density_g_per_ml ?? 1} kg/L`
                          : x.piece_weight_g ? `${x.piece_weight_g} g/pc` : "—";

                        return (
                          <div key={x.id} style={{ borderBottom: "1px solid #e5ddd0" }}>

                            {/* ── DESKTOP ROW ── */}
                            <div
                              className="hidden md:flex"
                              style={{ alignItems: "center", padding: "10px 16px", gap: 8, background: "white", transition: "background 0.1s" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#ede6d9")}
                              onMouseLeave={e => (e.currentTarget.style.background = "white")}
                            >
                              {/* Désignation */}
                              <div style={{ flex: 2.5, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <span style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", color: CAT_COLORS[x.category], letterSpacing: 0.3 }}>{x.name}</span>
                                  {alert && (
                                    <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 5px", borderRadius: 6, color: alert.direction === "up" ? "#DC2626" : "#16A34A", background: alert.direction === "up" ? "rgba(220,38,38,0.10)" : "rgba(22,163,74,0.10)", border: `1px solid ${alert.direction === "up" ? "rgba(220,38,38,0.30)" : "rgba(22,163,74,0.30)"}` }}>
                                      {alert.direction === "up" ? "↑" : "↓"} {(Math.abs(alert.change_pct) * 100).toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 10, color: "#999999", marginTop: 1 }}>
                                  {supplierName || CAT_LABELS[x.category]}
                                  {x.source_prep_recipe_name ? ` · Pivot: ${x.source_prep_recipe_name}` : ""}
                                  {x.status_note ? ` · ${x.status_note}` : ""}
                                </div>
                                {alg.length > 0 && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                                    {alg.map(a => (
                                      <span key={a} title={a} style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 4, background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.20)" }}>
                                        {ALLERGEN_SHORT[a as keyof typeof ALLERGEN_SHORT] ?? a}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {!hasPrice && <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", display: "inline-block", marginTop: 3 }}>prix manquant</span>}
                                {st !== "validated" && (
                                  <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                                    <button onClick={() => setIngredientStatus(x.id, "to_check")} style={{ height: 22, padding: "0 8px", borderRadius: 5, border: "1px solid #e5ddd0", background: "white", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>À contrôler</button>
                                    <button disabled={!canValidate} onClick={() => { if (!canValidate) return; setIngredientStatus(x.id, "validated"); }} style={{ height: 22, padding: "0 8px", borderRadius: 5, border: "1px solid #4a6741", background: "rgba(74,103,65,0.08)", fontSize: 10, fontWeight: 600, cursor: canValidate ? "pointer" : "not-allowed", color: "#4a6741", opacity: !canValidate ? 0.4 : 1 }}>Valider</button>
                                    <button onClick={() => setIngredientStatus(x.id, "unknown")} style={{ height: 22, padding: "0 8px", borderRadius: 5, border: "1px solid #e5ddd0", background: "white", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Incompris</button>
                                  </div>
                                )}
                              </div>

                              {/* Prix */}
                              <div style={{ flex: 1 }}>
                                <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{price}</span>
                              </div>

                              {/* Conditionnement */}
                              <div style={{ flex: 1, fontSize: 12, color: "#666" }}>{condInfo}</div>

                              {/* Statut */}
                              <div style={{ flex: 0.8 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: sb.bg, color: sb.color }}>{sb.label}</span>
                              </div>

                              {/* Fournisseur */}
                              <div style={{ flex: 0.8, fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                                {supplierName && supplierIdForDisplay ? (
                                  <Link href={`/fournisseurs/${supplierIdForDisplay}`} style={{ color: "inherit", textDecoration: "underline dotted", textUnderlineOffset: 2 }}>{supplierName}</Link>
                                ) : "—"}
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: estabBadge.bg, color: estabBadge.color }}>{estabBadge.label}</span>
                              </div>

                              {/* Actions */}
                              <div style={{ width: 80, display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
                                {!isEditing
                                  ? <button onClick={() => startEdit(x)} title="Modifier" style={{ ...BTN_ACTION, background: "#8B1A1A", color: "white", fontWeight: 700 }}>→</button>
                                  : <button onClick={saveEdit} style={{ ...BTN_ACTION, background: "#4a6741", color: "white", fontSize: 11, fontWeight: 700 }}>OK</button>}
                                <button onClick={() => del(x.id, x.name)} title="Supprimer" style={{ ...BTN_ACTION, background: "#ede6d9", color: "#aaa" }}>✕</button>
                              </div>
                            </div>

                            {/* ── MOBILE ROW ── */}
                            <div
                              className="md:hidden"
                              style={{ padding: "12px 14px", background: st === "to_check" ? "#fffbeb" : "white", borderBottom: st === "to_check" ? "1px solid #fde68a" : "none" }}
                            >
                              {compactMode ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ fontWeight: 800, fontSize: 11, textTransform: "uppercase", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: CAT_COLORS[x.category] }}>{x.name}</div>
                                  <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{price}</span>
                                  {alert && <span style={{ fontSize: 10, color: alert.direction === "up" ? "#DC2626" : "#16A34A", flexShrink: 0 }}>{alert.direction === "up" ? "↑" : "↓"}</span>}
                                  {!isEditing
                                    ? <button onClick={() => startEdit(x)} style={{ ...BTN_ACTION, background: "#8B1A1A", color: "white", fontWeight: 700 }}>→</button>
                                    : <button onClick={saveEdit} style={{ ...BTN_ACTION, background: "#4a6741", color: "white", fontSize: 10, fontWeight: 700 }}>OK</button>}
                                  <button onClick={() => del(x.id, x.name)} style={{ ...BTN_ACTION, background: "#ede6d9", color: "#aaa" }}>✕</button>
                                </div>
                              ) : (
                                <>
                                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontWeight: 800, fontSize: 11, textTransform: "uppercase", color: CAT_COLORS[x.category], letterSpacing: 0.3 }}>{x.name}</div>
                                      <div style={{ fontSize: 10, color: "#999999", marginTop: 2 }}>
                                        {supplierName || CAT_LABELS[x.category]}
                                        {x.status_note ? ` · ${x.status_note}` : ""}
                                      </div>
                                      {alg.length > 0 && (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                                          {alg.map(a => (
                                            <span key={a} style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 4, background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.18)" }}>
                                              {ALLERGEN_SHORT[a as keyof typeof ALLERGEN_SHORT] ?? a}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                      <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{price}</div>
                                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: sb.bg, color: sb.color, display: "inline-block", marginTop: 3 }}>{sb.label}</span>
                                      {alert && <div style={{ fontSize: 10, fontWeight: 800, color: alert.direction === "up" ? "#DC2626" : "#16A34A", marginTop: 2 }}>{alert.direction === "up" ? "↑" : "↓"} {(Math.abs(alert.change_pct) * 100).toFixed(0)}%</div>}
                                    </div>
                                  </div>
                                  {!hasPrice && <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", marginTop: 4 }}>prix manquant</div>}
                                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                                    {st !== "validated" && <button onClick={() => { if (!canValidate) return; setIngredientStatus(x.id, "validated"); }} disabled={!canValidate} style={{ flex: 1, height: 30, borderRadius: 7, border: "1px solid #4a6741", background: "rgba(74,103,65,0.08)", fontSize: 11, fontWeight: 700, cursor: canValidate ? "pointer" : "not-allowed", color: "#4a6741", opacity: !canValidate ? 0.4 : 1 }}>Valider</button>}
                                    {!isEditing
                                      ? <button onClick={() => startEdit(x)} style={{ flex: 1, height: 30, borderRadius: 7, border: "none", background: "#8B1A1A", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Modifier</button>
                                      : <button onClick={saveEdit} style={{ flex: 1, height: 30, borderRadius: 7, border: "none", background: "#4a6741", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>OK</button>}
                                    <button onClick={() => del(x.id, x.name)} style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: "#ede6d9", color: "#aaa", fontSize: 14, cursor: "pointer" }}>✕</button>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* ── EDIT FORM (logic unchanged) ── */}
                            {isEditing && edit && (
                              <div className="grid gap-2.5" style={{ padding: "14px 16px", borderTop: "1px solid #e5ddd0", background: "#faf7f2" }}>
                                <div className="grid gap-2.5" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
                                  <input className={iCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                                  <select className={sCls} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as Category })}>
                                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                  <select className={sCls} value={edit.supplierId} onChange={(e) => setEdit({ ...edit, supplierId: e.target.value })}>
                                    <option value="">—</option>
                                    {suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                  </select>
                                </div>
                                {/* Nom d'import (clé stable pour matching factures) */}
                                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#888" }}>
                                  <span style={{ fontWeight: 600, flexShrink: 0 }}>Nom d'import :</span>
                                  <span style={{ fontFamily: "monospace", background: "#ede6d9", padding: "1px 7px", borderRadius: 4, color: "#555", fontSize: 11 }}>{edit.importName}</span>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const next = window.prompt("Nouveau nom d'import :", edit.importName);
                                      if (!next || !next.trim() || next.trim() === edit.importName) return;
                                      const { error } = await supabase.from("ingredients").update({ import_name: next.trim() }).eq("id", editingId!);
                                      if (error) { window.alert(error.message); return; }
                                      setEdit({ ...edit, importName: next.trim() });
                                    }}
                                    style={{ fontSize: 11, padding: "1px 7px", borderRadius: 5, border: "1px solid #ddd", background: "white", color: "#888", cursor: "pointer", flexShrink: 0 }}
                                  >✎</button>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5 items-center">
                                  <div className="flex items-center gap-2.5">
                                    <span className="font-extrabold">Offre fournisseur</span>
                                    <label className="flex items-center gap-2">
                                      <input type="checkbox" checked={edit.useOffer} onChange={(e) => setEdit({ ...edit, useOffer: e.target.checked })} />
                                      <span className="muted">recommandé</span>
                                    </label>
                                  </div>
                                  <select className={sCls} value={edit.is_active ? "1" : "0"} onChange={(e) => setEdit({ ...edit, is_active: e.target.value === "1" })}>
                                    <option value="1">Actif</option><option value="0">Inactif</option>
                                  </select>
                                </div>
                                {edit.useOffer && (
                                  <>
                                    <div><div className={lCls}>Mode prix</div>
                                      <select className={sCls} value={edit.priceKind} onChange={(e) => setEdit({ ...edit, priceKind: e.target.value as PriceKind })}>
                                        <option value="unit">Unitaire</option><option value="pack_simple">Pack</option><option value="pack_composed">Pack composé</option>
                                      </select>
                                    </div>
                                    {edit.priceKind === "unit" && (
                                      <>
                                        <div className="grid grid-cols-2 gap-2.5">
                                          <input className={iCls} placeholder="Prix unitaire" value={edit.unitPrice} onChange={(e) => setEdit({ ...edit, unitPrice: e.target.value })} />
                                          <select className={sCls} value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value as "kg" | "l" | "pc" })}>
                                            <option value="kg">kg</option><option value="l">L</option><option value="pc">pc</option>
                                          </select>
                                        </div>
                                        {edit.unit === "l" && <input className={iCls} placeholder="Densité (kg/L)" value={edit.density} onChange={(e) => setEdit({ ...edit, density: e.target.value })} />}
                                        {edit.unit === "pc" && <input className={iCls} placeholder="Poids pièce (g)" value={edit.pieceWeightG} onChange={(e) => setEdit({ ...edit, pieceWeightG: e.target.value })} />}
                                        {edit.unit === "pc" && <input className={iCls} placeholder="Volume pièce (ml)" value={edit.pieceVolumeMl} onChange={(e) => setEdit({ ...edit, pieceVolumeMl: e.target.value })} />}
                                        <div className="muted text-[12px]">{previewEditPack || "—"}</div>
                                      </>
                                    )}
                                    {edit.priceKind === "pack_simple" && (
                                      <>
                                        <div className="grid grid-cols-3 gap-2.5">
                                          <input className={iCls} placeholder="Prix pack (€)" value={edit.packPrice} onChange={(e) => setEdit({ ...edit, packPrice: e.target.value })} />
                                          <input className={iCls} placeholder="Qté totale (kg/L)" value={edit.packTotalQty} onChange={(e) => setEdit({ ...edit, packTotalQty: e.target.value })} />
                                          <select className={sCls} value={edit.packUnit} onChange={(e) => setEdit({ ...edit, packUnit: e.target.value as "kg" | "l" })}>
                                            <option value="kg">kg</option><option value="l">L</option>
                                          </select>
                                        </div>
                                        {edit.packUnit === "l" && <input className={iCls} placeholder="Densité (kg/L)" value={edit.density} onChange={(e) => setEdit({ ...edit, density: e.target.value })} />}
                                        <div className="muted text-[12px]">{previewEditPack || "—"}</div>
                                      </>
                                    )}
                                    {edit.priceKind === "pack_composed" && (
                                      <>
                                        <div className="grid grid-cols-2 gap-2.5">
                                          <input className={iCls} placeholder="Prix pack (€)" value={edit.packPrice} onChange={(e) => setEdit({ ...edit, packPrice: e.target.value })} />
                                          <input className={iCls} placeholder="Nombre d'unités (ex: 8)" value={edit.packCount} onChange={(e) => setEdit({ ...edit, packCount: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2.5">
                                          <select className={sCls} value={edit.packEachUnit} onChange={(e) => setEdit({ ...edit, packEachUnit: e.target.value as "kg" | "l" | "pc" })}>
                                            <option value="l">L</option><option value="kg">kg</option><option value="pc">pc</option>
                                          </select>
                                          {edit.packEachUnit !== "pc"
                                            ? <input className={iCls} placeholder="Qté par unité (ex: 1.5)" value={edit.packEachQty} onChange={(e) => setEdit({ ...edit, packEachQty: e.target.value })} />
                                            : <input className={iCls} placeholder="Poids pièce (g)" value={edit.packPieceWeightG} onChange={(e) => setEdit({ ...edit, packPieceWeightG: e.target.value })} />}
                                        </div>
                                        {edit.packEachUnit === "l" && <input className={iCls} placeholder="Densité (kg/L)" value={edit.density} onChange={(e) => setEdit({ ...edit, density: e.target.value })} />}
                                        <div className="muted text-[12px]">{previewEditPack || "—"}</div>
                                      </>
                                    )}
                                  </>
                                )}
                                {/* Allergènes */}
                                <div className="pt-1">
                                  <div className="text-[11px] font-extrabold opacity-60 mb-2 uppercase tracking-wide">Allergènes</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {ALLERGENS.map(a => {
                                      const checked = edit.allergens.includes(a);
                                      return (
                                        <label key={a} title={a} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 800, background: checked ? "rgba(220,38,38,0.12)" : "rgba(0,0,0,0.04)", border: `1px solid ${checked ? "rgba(220,38,38,0.35)" : "rgba(0,0,0,0.10)"}`, color: checked ? "#DC2626" : "#6B6257", transition: "all 120ms" }}>
                                          <input type="checkbox" checked={checked} style={{ margin: 0 }}
                                            onChange={() => setEdit({ ...edit, allergens: checked ? edit.allergens.filter(v => v !== a) : [...edit.allergens, a] })} />
                                          {ALLERGEN_SHORT[a]}
                                        </label>
                                      );
                                    })}
                                  </div>
                                  <div className="muted text-[10px] mt-1">{edit.allergens.length === 0 ? "Aucun allergène" : edit.allergens.join(" · ")}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {grouped.length === 0 && !loading && (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>
                    Aucun ingrédient trouvé.
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 11, color: "#bbb" }}>
              User: {userId ?? "non connecté"}
            </div>
          </>
        )}
      </main>

      {/* ══════════════════════════════════════════════
          BOTTOM SHEET — Filtres mobile
      ══════════════════════════════════════════════ */}
      {showFilters && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.4)" }} onClick={() => setShowFilters(false)} />
          <div className="safe-bottom" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 61, background: "#faf7f2", borderRadius: "20px 20px 0 0", padding: 20, animation: "slideUp 0.25s ease-out" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 17, fontWeight: 800 }}>Filtres</span>
              <button onClick={() => setShowFilters(false)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid #e5ddd0", background: "white", cursor: "pointer", fontSize: 13 }}>✕ Fermer</button>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <div><div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>Catégorie</div>
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as "all" | Category)} style={{ width: "100%", height: 44, borderRadius: 10, border: "1px solid #e5ddd0", padding: "0 12px", fontSize: 14, background: "white" }}>
                  <option value="all">Tous</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                </select>
              </div>
              <div><div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>Fournisseur</div>
                <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} style={{ width: "100%", height: 44, borderRadius: 10, border: "1px solid #e5ddd0", padding: "0 12px", fontSize: 14, background: "white" }}>
                  <option value="all">Tous</option>
                  {suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>Établissement</div>
                <select value={filterEstablishment} onChange={(e) => setFilterEstablishment(e.target.value as "all" | "bellomio" | "piccola" | "both")} style={{ width: "100%", height: 44, borderRadius: 10, border: "1px solid #e5ddd0", padding: "0 12px", fontSize: 14, background: "white" }}>
                  <option value="all">Tous</option>
                  <option value="bellomio">Bello Mio</option>
                  <option value="piccola">Piccola Mia</option>
                  <option value="both">Les deux</option>
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <input type="checkbox" checked={includeNoOffer} onChange={(e) => setIncludeNoOffer(e.target.checked)} />
                Inclure sans offre
              </label>
            </div>
            <button onClick={() => setShowFilters(false)} style={{ width: "100%", height: 44, marginTop: 16, borderRadius: 10, border: "none", background: "#8B1A1A", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              Appliquer
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function IngredientsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#999" }}>Chargement…</div>}>
      <IngredientsPageInner />
    </Suspense>
  );
}

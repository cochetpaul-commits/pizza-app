"use client";

import { useEffect, useMemo, useState, useCallback, useRef, Suspense } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { useDebounce } from "@/lib/useDebounce";
import { useIngredientsData } from "@/lib/useIngredientsData";
import { useEtablissement } from "@/lib/EtablissementContext";

import {
  CATEGORIES,
  CAT_LABELS,
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
  legacyHasPrice,
  normalizeSupplierId,
  offerHasPrice,
  parseNum,
} from "@/lib/offers";
import { extractVolumeFromName, extractWeightGFromName, detectUnitFromName } from "@/lib/invoices/utils";
import { detectAllergensFromName } from "@/lib/invoices/allergenDetector";
import { detectCategoryFromName } from "@/lib/invoices/categoryDetector";
import { PriceAlertsPanel } from "@/components/PriceAlertsPanel";
import { parseAllergens } from "@/lib/allergens";
import { CategoryHeader, IngredientRow, type EditState, type StorageZoneOption } from "@/components/IngredientRow";
import { useProfile } from "@/lib/ProfileContext";
import { getSupplierColor } from "@/lib/supplierColors";
import { updateDerivedIngredients, computeDerivedPrice, computeRendement } from "@/lib/rendement";
import DuplicatePanel from "@/components/DuplicatePanel";
import { detectDuplicates, type DuplicatePair } from "@/lib/duplicateDetection";

type OfferPayload = Record<string, unknown>;

type IngredientPatch = Partial<
  Pick<Ingredient, "status" | "status_note" | "validated_at" | "validated_by">
>;

// ─── shared input style helpers ────────────────────────────────────────────
const iCls = "w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none";
const sCls = "w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65";
const lCls = "text-[12px] opacity-75 mb-1.5";

// ─── Skeleton loader ──────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      background: "white", borderRadius: 12, border: "1.5px solid #ddd6c8",
      borderLeft: "3px solid #ddd6c8", padding: "14px 16px", marginBottom: 6,
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ height: 13, borderRadius: 4, background: "#e5ddd0", width: "60%", marginBottom: 6, animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ height: 10, borderRadius: 3, background: "#ede6d9", width: "40%", animation: "pulse 1.5s ease-in-out infinite" }} />
      </div>
      <div style={{ height: 16, borderRadius: 4, background: "#e5ddd0", width: 60, animation: "pulse 1.5s ease-in-out infinite" }} />
    </div>
  );
}

function SkeletonTable() {
  return (
    <div style={{ marginTop: 16, padding: "0 4px" }}>
      {[0, 1, 2].map(i => (
        <div key={i}>
          <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, marginTop: 12, marginBottom: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ddd6c8" }} />
            <div style={{ height: 9, borderRadius: 3, background: "#ddd6c8", width: 100, animation: "pulse 1.5s ease-in-out infinite" }} />
          </div>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ))}
    </div>
  );
}

function IngredientsPageInner() {
  const router = useRouter();
  const { canWrite: userCanWrite } = useProfile();
  const { current: etab } = useEtablissement();

  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);
  const { items, suppliers, supplierAliases, offers, alertMap, loading, loadingMore, hasMore, totalCount, loadMore, error: dataError, mutate } = useIngredientsData(debouncedQ, etab?.id, etab?.slug);

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
  const backUrl = searchParams.get("back") ?? null;
  const editParam = searchParams.get("edit");
  const supplierParam = searchParams.get("supplier");

  const [tab, setTab] = useState<Tab>("all");
  const [filterCategory, setFilterCategory] = useState<"all" | Category>("all");
  const [filterSupplier, setFilterSupplier] = useState<"all" | string>(supplierParam ?? "all");
  const [includeNoOffer, setIncludeNoOffer] = useState(true);
  const [storageZones, setStorageZones] = useState<StorageZoneOption[]>([]);

  useEffect(() => {
    (async () => {
      let zq = supabase.from("storage_zones").select("id, name").order("display_order").order("name");
      if (etab?.id) zq = zq.eq("etablissement_id", etab.id);
      const { data: zData } = await zq;
      setStorageZones((zData ?? []) as StorageZoneOption[]);
    })();
  }, [etab?.id]);

  const suppliersMap = useMemo(() => {
    const m = new Map<string, Supplier>();
    for (const s of suppliers) {
      m.set(s.id, s);
      // Also index alias IDs (same supplier name in different establishments)
      const aliasSet = supplierAliases.get(s.id);
      if (aliasSet) {
        for (const aliasId of aliasSet) m.set(aliasId, s);
      }
    }
    return m;
  }, [suppliers, supplierAliases]);

  const offersByIngredientId = useMemo(() => {
    const m = new Map<string, LatestOffer>();
    for (const o of offers) m.set(o.ingredient_id, o);
    return m;
  }, [offers]);

  const counts = useMemo(() => {
    const c = { to_check: 0, validated: 0, all: items.length };
    for (const x of items) {
      const s = (x.status ?? "to_check") as IngredientStatus;
      if (s === "validated") c.validated += 1;
      else c.to_check += 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    // Deduplicate by id (pagination can produce duplicates)
    const seen = new Set<string>();
    let base = items.filter((x) => { if (seen.has(x.id)) return false; seen.add(x.id); return true; });
    if (tab !== "all") base = base.filter((x) => ((x.status ?? "to_check") as IngredientStatus) === tab);
    if (filterCategory !== "all") base = base.filter((x) => x.category === filterCategory);
    if (!includeNoOffer) base = base.filter((x) => offersByIngredientId.has(x.id));
    if (filterSupplier !== "all") {
      const aliasIds = supplierAliases.get(filterSupplier) ?? new Set([filterSupplier]);
      base = base.filter((x) => {
        const off = offersByIngredientId.get(x.id);
        const supplierForFilter = (off?.supplier_id ?? x.supplier_id ?? null) as string | null;
        return supplierForFilter != null && aliasIds.has(supplierForFilter);
      });
    }
    return base;
  }, [items, tab, filterCategory, filterSupplier, supplierAliases, includeNoOffer, offersByIngredientId]);

  const grouped = useMemo(() => {
    const byCategory = new Map<Category, Ingredient[]>();
    for (const cat of CATEGORIES) byCategory.set(cat, []);
    for (const x of filtered) byCategory.get(x.category)?.push(x);
    for (const arr of byCategory.values()) arr.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "fr"));
    return CATEGORIES.map((cat) => ({ cat, items: byCategory.get(cat) ?? [] })).filter((g) => g.items.length > 0);
  }, [filtered]);

  // Collapsed by default; open all when searching
  const [collapsedCats, setCollapsedCats] = useState<Set<Category>>(() => new Set(CATEGORIES));

  useEffect(() => {
    if (debouncedQ.trim()) {
      setCollapsedCats(new Set());
    } else {
      setCollapsedCats(new Set(CATEGORIES));
    }
  }, [debouncedQ]);

  const allCollapsed = grouped.length > 0 && collapsedCats.size >= grouped.length;
  const filterActive = filterCategory !== "all" || filterSupplier !== "all";

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
  const [showDuplicates, setShowDuplicates] = useState(false);

  // Supplier modal
  const [modalSupplierId, setModalSupplierId] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState({ contact_name: "", phone: "", email: "", franco_minimum: "", notes: "" });
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierSaved, setSupplierSaved] = useState(false);
  const [showRendementCalc, setShowRendementCalc] = useState(false);
  const [rcIngredientId, setRcIngredientId] = useState<string>("");
  const [rcPoidsBrut, setRcPoidsBrut] = useState<number | "">(1000);
  const [rcPoidsNet, setRcPoidsNet] = useState<number | "">(625);
  const [rcDeriveName, setRcDeriveName] = useState("");
  const [rcSaving, setRcSaving] = useState(false);
  const [ignoreKeys, setIgnoreKeys] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("ingredient-duplicate-ignores") ?? "[]")); }
    catch { return new Set(); }
  });

  const duplicatePairs = useMemo<DuplicatePair[]>(
    () => detectDuplicates(items, offersByIngredientId, ignoreKeys),
    [items, offersByIngredientId, ignoreKeys]
  );

  // ─── Stable callbacks ────────────────────────────────────────────────────
  const toggleAll = useCallback(() => {
    setCollapsedCats(prev => {
      const allCats = grouped.map(g => g.cat);
      const allAreCollapsed = allCats.length > 0 && allCats.every(c => prev.has(c));
      return allAreCollapsed ? new Set<Category>() : new Set<Category>(allCats);
    });
  }, [grouped]);

  const toggleCat = useCallback((cat: Category) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  const reload = useCallback(() => mutate(), [mutate]);

  const setIngredientStatus = useCallback(async (id: string, next: IngredientStatus) => {
    const ing = items.find((x) => x.id === id);
    const off = offersByIngredientId.get(id);
    if (next === "validated") {
      const hasPrice = offerHasPrice(off, { piece_volume_ml: ing?.piece_volume_ml }) || (ing ? legacyHasPrice(ing) : false);
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
    const r = await supabase.from("ingredients").update(patch).eq("id", id);
    if (r.error) { alert(r.error.message); return; }
    const sy = window.scrollY;
    await mutate();
    requestAnimationFrame(() => window.scrollTo(0, sy));
  }, [items, offersByIngredientId, userId, mutate]);

  const openDeriveModal = useCallback((x: Ingredient) => {
    setRcIngredientId(x.id);
    setRcDeriveName("");
    setRcPoidsBrut(1000);
    setRcPoidsNet(625);
    setShowRendementCalc(true);
  }, []);

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
  const [edit, setEdit] = useState<EditState | null>(null);

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

  function buildOfferFromCreate(ingredient_id: string, uid: string, ingEtabId?: string | null): SupplierOfferPayload | null {
    const supplier_id = normalizeSupplierId(newSupplierId);
    if (!supplier_id) { alert("Fournisseur obligatoire pour enregistrer une offre."); return null; }
    if (!uid) { alert("Utilisateur non connecté. Impossible d'enregistrer l'offre."); return null; }
    const resolvedEtabId = etab?.id ?? ingEtabId;
    const etabExtra = resolvedEtabId ? { etablissement_id: resolvedEtabId } : {};
    if (priceKind === "unit") {
      const p = parseNum(newUnitPrice);
      if (p == null || p <= 0) { alert("Prix unitaire invalide."); return null; }
      if (newUnit === "pc") { const pw = parseNum(newPieceWeightG) ?? null; return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "pc", unit_price: p, price: p, piece_weight_g: pw, density_kg_per_l: null, is_active: true, ...etabExtra }; }
      if (newUnit === "l") { const d = parseNum(newDensity); if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; } return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "l", unit_price: p, price: p, density_kg_per_l: d, piece_weight_g: null, is_active: true, ...etabExtra }; }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "kg", unit_price: p, price: p, density_kg_per_l: null, piece_weight_g: null, is_active: true, ...etabExtra };
    }
    if (priceKind === "pack_simple") {
      const pp = parseNum(packPrice); const qty = parseNum(packTotalQty);
      if (pp == null || pp <= 0) { alert("Prix du pack invalide."); return null; }
      if (qty == null || qty <= 0) { alert("Quantité totale du pack invalide."); return null; }
      if (newUnit === "l") { const d = parseNum(newDensity); if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; } return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true, ...etabExtra }; }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true, ...etabExtra };
    }
    if (priceKind === "pack_composed") {
      const pp = parseNum(packPrice); const c = parseNum(packCount);
      if (pp == null || pp <= 0) { alert("Prix du pack invalide."); return null; }
      if (c == null || c <= 0) { alert("Nombre d'unités invalide."); return null; }
      if (packEachUnit === "pc") { const pw = parseNum(packPieceWeightG); if (pw == null || pw <= 0) { alert("Poids pièce obligatoire (g)."); return null; } return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_unit: "pc", piece_weight_g: pw, density_kg_per_l: null, is_active: true, ...etabExtra }; }
      const each = parseNum(packEachQty);
      if (each == null || each <= 0) { alert("Quantité par élément invalide."); return null; }
      if (packEachUnit === "l") { const d = parseNum(newDensity); if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; } return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_qty: each, pack_each_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true, ...etabExtra }; }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_qty: each, pack_each_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true, ...etabExtra };
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
      ...(etab ? { etablissement_id: etab.id } : {}),
    };
    const ins = await supabase.from("ingredients").insert(baseIngredient).select("id").single();
    if (ins.error) {
      if (ins.error.message.includes("ingredients_etab_name")) {
        alert(`Un ingredient "${name}" existe deja. Choisissez un autre nom.`);
      } else {
        alert(ins.error.message);
      }
      return;
    }
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
    await mutate();
  }

  const guessOrderUnit = useCallback((off: LatestOffer | undefined): string => {
    if (!off) return "";
    const kind = off.price_kind;
    if (kind === "pack_composed" && off.pack_count && off.pack_each_qty && off.pack_each_unit) {
      const u = off.pack_each_unit === "kg" ? "kg" : off.pack_each_unit === "l" ? "L" : "pcs";
      return `colis ${off.pack_count} × ${off.pack_each_qty}${u}`;
    }
    if (kind === "pack_simple" && off.pack_total_qty && off.pack_unit) {
      const u = off.pack_unit === "kg" ? "kg" : "L";
      return `${off.pack_total_qty}${u}`;
    }
    if (kind === "unit") {
      if (off.unit === "kg") return "kg";
      if (off.unit === "l") return "L";
      if (off.unit === "pc") return "pièce";
    }
    return "";
  }, []);

  const startEdit = useCallback((x: Ingredient) => {
    const off = offersByIngredientId.get(x.id);
    const isPrep = x.category === "preparation";
    const supplierId = isPrep ? "" : (off?.supplier_id ?? (x.supplier_id ?? ""));

    // ── Map old DB offer to new EditState ──
    let baseUnit: "piece" | "kg" | "litre" = "kg";
    let baseUnitLabel = "";
    let pieceContentQty = "";
    let pieceContentUnit = "cl";
    let hasConditionnement = false;
    let conditionnementLabel = "carton";
    let qtyPerConditionnement = "";
    let pricePerBaseUnit = "";
    let pricePerConditionnement = "";
    const pricePerKgOrL = "";
    let priceSource: EditState["priceSource"] = null;

    if (off) {
      const pk = off.price_kind;
      if (pk === "unit") {
        if (off.unit === "kg") {
          baseUnit = "kg";
          pricePerBaseUnit = off.unit_price != null ? String(off.unit_price) : "";
          priceSource = pricePerBaseUnit ? "base" : null;
        } else if (off.unit === "l") {
          baseUnit = "litre";
          pricePerBaseUnit = off.unit_price != null ? String(off.unit_price) : "";
          priceSource = pricePerBaseUnit ? "base" : null;
        } else {
          // pc
          baseUnit = "piece";
          baseUnitLabel = x.purchase_unit_label || x.order_unit_label || "piece";
          // Piece-type labels that correspond to base unit piece
          const PIECE_LABELS = new Set(["bouteille", "barquette", "brick", "poche", "sachet", "piece", "pièce"]);
          if (!PIECE_LABELS.has(baseUnitLabel.toLowerCase())) baseUnitLabel = "piece";
          else baseUnitLabel = baseUnitLabel.toLowerCase() === "pièce" ? "piece" : baseUnitLabel.toLowerCase();
          pricePerBaseUnit = off.unit_price != null ? String(off.unit_price) : "";
          priceSource = pricePerBaseUnit ? "base" : null;
          // Derive piece content from piece_volume_ml or piece_weight_g
          if (x.piece_volume_ml != null && x.piece_volume_ml > 0) {
            if (x.piece_volume_ml >= 1000) {
              pieceContentQty = String(x.piece_volume_ml / 1000);
              pieceContentUnit = "L";
            } else if (x.piece_volume_ml % 10 === 0) {
              pieceContentQty = String(x.piece_volume_ml / 10);
              pieceContentUnit = "cl";
            } else {
              pieceContentQty = String(x.piece_volume_ml);
              pieceContentUnit = "ml";
            }
          } else if (off.piece_weight_g != null && off.piece_weight_g > 0) {
            if (off.piece_weight_g >= 1000) {
              pieceContentQty = String(off.piece_weight_g / 1000);
              pieceContentUnit = "kg";
            } else {
              pieceContentQty = String(off.piece_weight_g);
              pieceContentUnit = "g";
            }
          }
        }
      } else if (pk === "pack_simple") {
        // pack_simple: baseUnit = kg or litre, cond = the pack
        baseUnit = off.pack_unit === "l" ? "litre" : "kg";
        hasConditionnement = true;
        conditionnementLabel = x.order_unit_label || "carton";
        // If the order_unit_label is a base unit, default to carton
        const BASE_LABELS = new Set(["kg", "litre", "pièce", ""]);
        if (BASE_LABELS.has(conditionnementLabel)) conditionnementLabel = "carton";
        qtyPerConditionnement = off.pack_total_qty != null ? String(off.pack_total_qty) : "";
        pricePerConditionnement = off.pack_price != null ? String(off.pack_price) : "";
        priceSource = pricePerConditionnement ? "cond" : null;
        // Compute base price from cond
        const pp = off.pack_price ?? 0;
        const qty = off.pack_total_qty ?? 0;
        if (pp > 0 && qty > 0) pricePerBaseUnit = (pp / qty).toFixed(2);
      } else if (pk === "pack_composed") {
        // pack_composed: baseUnit = piece, cond = the pack
        baseUnit = "piece";
        baseUnitLabel = "piece";
        // Try to guess from pack_each_unit
        if (off.pack_each_unit === "pc") {
          baseUnitLabel = x.purchase_unit_label || x.order_unit_label || "bouteille";
          const PIECE_LABELS = new Set(["bouteille", "barquette", "brick", "poche", "sachet", "piece", "pièce"]);
          if (!PIECE_LABELS.has(baseUnitLabel.toLowerCase())) baseUnitLabel = "bouteille";
          else baseUnitLabel = baseUnitLabel.toLowerCase() === "pièce" ? "piece" : baseUnitLabel.toLowerCase();
        }
        hasConditionnement = true;
        conditionnementLabel = "carton";
        qtyPerConditionnement = off.pack_count != null ? String(off.pack_count) : "";
        pricePerConditionnement = off.pack_price != null ? String(off.pack_price) : "";
        priceSource = pricePerConditionnement ? "cond" : null;
        // Compute base price
        const pp = off.pack_price ?? 0;
        const cnt = off.pack_count ?? 0;
        if (pp > 0 && cnt > 0) pricePerBaseUnit = (pp / cnt).toFixed(2);
        // Piece content
        if (x.piece_volume_ml != null && x.piece_volume_ml > 0) {
          if (x.piece_volume_ml >= 1000) {
            pieceContentQty = String(x.piece_volume_ml / 1000);
            pieceContentUnit = "L";
          } else if (x.piece_volume_ml % 10 === 0) {
            pieceContentQty = String(x.piece_volume_ml / 10);
            pieceContentUnit = "cl";
          } else {
            pieceContentQty = String(x.piece_volume_ml);
            pieceContentUnit = "ml";
          }
        } else if (off.piece_weight_g != null && off.piece_weight_g > 0) {
          if (off.piece_weight_g >= 1000) {
            pieceContentQty = String(off.piece_weight_g / 1000);
            pieceContentUnit = "kg";
          } else {
            pieceContentQty = String(off.piece_weight_g);
            pieceContentUnit = "g";
          }
        }
      }
    }

    const editState: EditState = {
      name: x.name, category: x.category, is_active: x.is_active, supplierId,
      importName: x.import_name ?? x.name,
      useOffer: !isPrep,
      baseUnit, baseUnitLabel, pieceContentQty, pieceContentUnit,
      hasConditionnement, conditionnementLabel, qtyPerConditionnement,
      pricePerBaseUnit, pricePerConditionnement, pricePerKgOrL,
      priceSource,
      allergens: parseAllergens(x.allergens),
      orderUnitLabel: x.order_unit_label || guessOrderUnit(off),
      orderQuantity: x.order_quantity != null ? String(x.order_quantity) : "",
      storageZone: x.storage_zone ?? "",
      stockMin: x.stock_min != null ? String(x.stock_min) : "",
      stockObjectif: x.stock_objectif != null ? String(x.stock_objectif) : "",
      stockMax: x.stock_max != null ? String(x.stock_max) : "",
      establishments: x.establishments ?? ["bellomio", "piccola"],
    };

    // Run auto-calc to fill missing prices (e.g. kgL from base price)
    if (editState.priceSource) {
      const contentQty = parseFloat(editState.pieceContentQty) || 0;
      const isWeightContent = (u: string) => u === "g" || u === "kg";
      const isVolumeContent = (u: string) => u === "cl" || u === "ml" || u === "L";
      const contentToMl = (q: number, u: string) => u === "cl" ? q * 10 : u === "ml" ? q : u === "L" ? q * 1000 : null;
      const contentToG = (q: number, u: string) => u === "g" ? q : u === "kg" ? q * 1000 : null;
      const bp = parseFloat(editState.pricePerBaseUnit) || 0;
      if (editState.baseUnit === "piece" && contentQty > 0 && bp > 0 && !editState.pricePerKgOrL) {
        const cu = editState.pieceContentUnit;
        if (isWeightContent(cu)) {
          const g = contentToG(contentQty, cu);
          if (g && g > 0) editState.pricePerKgOrL = (bp / g * 1000).toFixed(2);
        } else if (isVolumeContent(cu)) {
          const ml = contentToMl(contentQty, cu);
          if (ml && ml > 0) editState.pricePerKgOrL = (bp / ml * 1000).toFixed(2);
        }
      }
    }

    setEditingId(x.id);
    setEdit(editState);
  }, [offersByIngredientId, guessOrderUnit]);

  function buildOfferFromEdit(ingredient_id: string, uid: string, ingEtabId?: string | null): OfferPayload | null {
    if (!edit) return null;
    if (!edit.useOffer) return null;
    const supplier_id = edit.category === "preparation" ? null : (normalizeSupplierId(edit.supplierId) || null);
    if (!supplier_id) return null;
    if (!uid) return null;
    const resolvedEtabId = etab?.id ?? ingEtabId;
    const etabExtra = resolvedEtabId ? { etablissement_id: resolvedEtabId } : {};

    const basePrice = parseNum(edit.pricePerBaseUnit);
    const condPrice = parseNum(edit.pricePerConditionnement);
    const condQty = parseNum(edit.qtyPerConditionnement);
    const contentQty = parseNum(edit.pieceContentQty);
    const cu = edit.pieceContentUnit;

    // Compute piece_weight_g from content if weight-based
    let pieceWeightG: number | null = null;
    if (edit.baseUnit === "piece" && contentQty != null && contentQty > 0) {
      if (cu === "g") pieceWeightG = contentQty;
      else if (cu === "kg") pieceWeightG = contentQty * 1000;
    }

    // Compute density from content if volume-based (for pieces: price per volume → density not directly applicable, but we preserve it)
    // We don't compute density automatically; the pricing system handles unit conversion via CpuByUnit

    if (edit.baseUnit === "kg") {
      if (!edit.hasConditionnement) {
        if (basePrice == null || basePrice <= 0) return null;
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "kg", unit_price: basePrice, price: basePrice, density_kg_per_l: null, piece_weight_g: null, is_active: true, ...etabExtra };
      } else {
        if (condPrice == null || condPrice <= 0) return null;
        if (condQty == null || condQty <= 0) return null;
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: condPrice, price: condPrice, pack_total_qty: condQty, pack_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true, ...etabExtra };
      }
    } else if (edit.baseUnit === "litre") {
      if (!edit.hasConditionnement) {
        if (basePrice == null || basePrice <= 0) return null;
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "l", unit_price: basePrice, price: basePrice, density_kg_per_l: null, piece_weight_g: null, is_active: true, ...etabExtra };
      } else {
        if (condPrice == null || condPrice <= 0) return null;
        if (condQty == null || condQty <= 0) return null;
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: condPrice, price: condPrice, pack_total_qty: condQty, pack_unit: "l", density_kg_per_l: null, piece_weight_g: null, is_active: true, ...etabExtra };
      }
    } else {
      // piece
      if (!edit.hasConditionnement) {
        if (basePrice == null || basePrice <= 0) return null;
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "pc", unit_price: basePrice, price: basePrice, density_kg_per_l: null, piece_weight_g: pieceWeightG, is_active: true, ...etabExtra };
      } else {
        if (condPrice == null || condPrice <= 0) return null;
        if (condQty == null || condQty <= 0) return null;
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: condPrice, price: condPrice, pack_count: condQty, pack_each_unit: "pc", pack_each_qty: null, piece_weight_g: pieceWeightG, density_kg_per_l: null, is_active: true, ...etabExtra };
      }
    }
  }

  const previewEditPack = useMemo(() => {
    if (!edit) return "";
    if (!edit.useOffer) return "";
    // Build a summary from the new pricing fields
    const bp = parseNum(edit.pricePerBaseUnit);
    const baseLabel = edit.baseUnit === "kg" ? "kg" : edit.baseUnit === "litre" ? "L" : (edit.baseUnitLabel || "piece");
    if (bp == null || bp <= 0) return "";
    let summary = `${bp.toFixed(2)}EUR/${baseLabel}`;
    if (edit.hasConditionnement) {
      const cp = parseNum(edit.pricePerConditionnement);
      const cq = parseNum(edit.qtyPerConditionnement);
      if (cp != null && cp > 0) summary += ` -- ${cp.toFixed(2)}EUR/${edit.conditionnementLabel || "cond."}${cq ? ` (${cq} ${baseLabel})` : ""}`;
    }
    if (edit.baseUnit === "piece" && (parseNum(edit.pieceContentQty) ?? 0) > 0) {
      const kp = parseNum(edit.pricePerKgOrL);
      const isWeight = edit.pieceContentUnit === "g" || edit.pieceContentUnit === "kg";
      if (kp != null && kp > 0) summary += ` -- ${kp.toFixed(2)}EUR/${isWeight ? "kg" : "L"}`;
    }
    return summary;
  }, [edit]);

  const saveEdit = useCallback(async () => {
    if (!editingId || !edit) return;
    const name = edit.name.trim();
    if (!name) { alert("Nom obligatoire."); return; }
    const supplier_id = normalizeSupplierId(edit.supplierId);
    const orderQuantity = parseNum(edit.orderQuantity) ?? null;
    const orderLabel = edit.orderUnitLabel.trim();

    // Compute piece_volume_ml from pieceContentQty + pieceContentUnit
    let pieceVolumeMl: number | null = null;
    if (edit.baseUnit === "piece") {
      const cq = parseNum(edit.pieceContentQty);
      if (cq != null && cq > 0) {
        const cu = edit.pieceContentUnit;
        if (cu === "cl") pieceVolumeMl = cq * 10;
        else if (cu === "ml") pieceVolumeMl = cq;
        else if (cu === "L") pieceVolumeMl = cq * 1000;
        // For weight-based content, don't set piece_volume_ml
      }
    }

    // Persist piece type label (barquette, bouteille, etc.) in purchase_unit_label
    const purchaseUnitLabel = edit.baseUnit === "piece" ? (edit.baseUnitLabel || "piece") : edit.baseUnit === "litre" ? "L" : "kg";

    const up: Partial<IngredientUpsert> = {
      name, category: edit.category, is_active: edit.is_active, supplier_id,
      piece_volume_ml: pieceVolumeMl,
      purchase_unit_label: purchaseUnitLabel,
      allergens: edit.allergens.length ? edit.allergens : null,
      order_unit_label: orderLabel || null,
      order_quantity: orderQuantity,
      storage_zone: edit.storageZone || null,
      stock_min: parseNum(edit.stockMin) ?? null,
      stock_objectif: parseNum(edit.stockObjectif) ?? null,
      stock_max: parseNum(edit.stockMax) ?? null,
      establishments: edit.establishments.length ? edit.establishments : ["bellomio", "piccola"],
    } as Record<string, unknown>;
    const u1 = await supabase.from("ingredients").update(up).eq("id", editingId);
    if (u1.error) {
      if (u1.error.message.includes("ingredients_etab_name")) {
        alert(`Un ingredient "${name}" existe deja. Choisissez un autre nom.`);
      } else {
        alert(u1.error.message);
      }
      return;
    }
    if (edit.useOffer && supplier_id && userId) {
      const editedIng = items.find((i) => i.id === editingId);
      const offerPayload = buildOfferFromEdit(editingId, userId, editedIng?.etablissement_id);
      if (offerPayload) {
        // Désactiver TOUTES les offres actives de cet ingrédient (tous fournisseurs)
        const dPrev = await supabase.from("supplier_offers").update({ is_active: false }).eq("ingredient_id", editingId).eq("is_active", true);
        if (dPrev.error) { alert(dPrev.error.message); return; }
        const off = await supabase.from("supplier_offers").insert(offerPayload);
        if (off.error) { alert(off.error.message); return; }

        // Mettre à jour les ingrédients dérivés si le prix unitaire a changé
        if (edit.pricePerBaseUnit) {
          const newPrice = parseNum(edit.pricePerBaseUnit);
          if (newPrice) {
            await updateDerivedIngredients(supabase, editingId, newPrice);
          }
        }
      }
    }
    const scrollY = window.scrollY;
    setEditingId(null); setEdit(null);
    if (backUrl) { router.push(backUrl); return; }
    await mutate();
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, edit, userId, backUrl, router, mutate]);

  const del = useCallback(async (id: string, name: string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    // Check if ingredient is used in any recipe
    const recipeTables = [
      { table: "pizza_ingredients", label: "pizza" },
      { table: "kitchen_recipe_lines", label: "recette cuisine" },
      { table: "prep_recipe_lines", label: "préparation" },
      { table: "cocktail_ingredients", label: "cocktail" },
      { table: "recipe_ingredients", label: "empâtement" },
    ] as const;
    for (const { table, label } of recipeTables) {
      const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("ingredient_id", id);
      if (count && count > 0) {
        alert(`Impossible de supprimer "${name}" : utilisé dans ${count} ${label}(s).`);
        return;
      }
    }
    // Cascade delete related rows that are not recipes
    await supabase.from("commande_lignes").delete().eq("ingredient_id", id);
    await supabase.from("supplier_invoice_lines").delete().eq("ingredient_id", id);
    const d1 = await supabase.from("supplier_offers").delete().eq("ingredient_id", id);
    if (d1.error) { alert(d1.error.message); return; }
    const d2 = await supabase.from("ingredients").delete().eq("id", id);
    if (d2.error) { alert(d2.error.message); return; }
    const sy = window.scrollY;
    await mutate();
    requestAnimationFrame(() => window.scrollTo(0, sy));
  }, [mutate]);

  const onEditChange = useCallback((next: EditState) => {
    setEdit(next);
  }, []);

  const onEditImportName = useCallback(async (id: string, current: string) => {
    const next = window.prompt("Nouveau nom d'import :", current);
    if (!next || !next.trim() || next.trim() === current) return;
    const { error } = await supabase.from("ingredients").update({ import_name: next.trim() }).eq("id", id);
    if (error) { window.alert(error.message); return; }
    setEdit(prev => prev ? { ...prev, importName: next.trim() } : prev);
  }, []);

  // ─── Supplier modal ─────────────────────────────────────────────────────
  const openSupplierModal = useCallback(async (supplierId: string) => {
    setModalSupplierId(supplierId);
    setSupplierSaved(false);
    const { data } = await supabase.from("suppliers").select("contact_name,phone,email,franco_minimum,notes").eq("id", supplierId).single();
    if (data) {
      setSupplierForm({
        contact_name: data.contact_name ?? "", phone: data.phone ?? "",
        email: data.email ?? "", franco_minimum: data.franco_minimum != null ? String(data.franco_minimum) : "",
        notes: data.notes ?? "",
      });
    }
  }, []);

  const saveSupplierModal = useCallback(async () => {
    if (!modalSupplierId) return;
    setSupplierSaving(true);
    const francoVal = supplierForm.franco_minimum.trim();
    const { error } = await supabase.from("suppliers").update({
      email: supplierForm.email.trim() || null,
      phone: supplierForm.phone.trim() || null,
      contact_name: supplierForm.contact_name.trim() || null,
      notes: supplierForm.notes.trim() || null,
      franco_minimum: francoVal ? parseFloat(francoVal) : null,
    }).eq("id", modalSupplierId);
    setSupplierSaving(false);
    if (error) { alert(error.message); return; }
    setSupplierSaved(true);
    setTimeout(() => setSupplierSaved(false), 2000);
  }, [modalSupplierId, supplierForm]);

  // ─── Infinite scroll sentinel ────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // ?edit=<id> scroll to item
  useEffect(() => {
    if (!editParam || items.length === 0) return;
    const target = items.find((x) => x.id === editParam);
    if (target) {
      startEdit(target);
      setTab("all");
      setCollapsedCats((prev) => { const n = new Set(prev); n.delete(target.category); return n; });
      requestAnimationFrame(() => {
        document.getElementById(`ing-${editParam}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, items]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const isVariations = tab === ("variations" as Tab);

  const TABS_MAIN = [
    { t: "all"       as Tab, label: "Tous",         count: totalCount ?? counts.all },
    { t: "validated" as Tab, label: "Validés",      count: counts.validated },
    { t: "to_check"  as Tab, label: "À contrôler",  count: counts.to_check },
  ] as const;

  const headerBtnStyle: CSSProperties = {
    height: 34, padding: "0 14px", borderRadius: 12, fontSize: 13, fontWeight: 600,
    cursor: "pointer", border: "1.5px solid #ddd6c8", background: "white", color: "#1a1a1a",
    display: "inline-flex", alignItems: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  };

  // Shared select style — appearance:none is required for Chrome/Safari to respect border/radius
  const selStyle: CSSProperties = {
    appearance: "none", WebkitAppearance: "none",
    borderRadius: 12, border: "1.5px solid #ddd6c8",
    padding: "8px 14px", fontSize: 13,
    background: "white", color: "#1a1a1a", cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  };

  return (
    <div style={{ background: "#f2ede4", minHeight: "100vh" }}>

      {/* ══════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "#fff", borderBottom: "1.5px solid #ddd6c8",
        height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", boxSizing: "border-box",
      }}>
        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, overflow: "hidden" }}>
          <Link href={backUrl ?? "/"} style={{ color: "#999", fontSize: 13, textDecoration: "none", flexShrink: 0, fontWeight: 500 }}>
            ← {backUrl ? "Retour" : "Accueil"}
          </Link>
          <span style={{ fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontSize: 22, fontWeight: 700, color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: 0.5 }}>
            Achats
          </span>
        </div>

        {/* Right */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
          {/* Rafraîchir (desktop) */}
          <button onClick={reload} className="hidden md:inline-flex" style={headerBtnStyle}>Rafraîchir</button>
          {/* Doublons */}
          <button onClick={() => setShowDuplicates(true)} style={headerBtnStyle}>
            Doublons
            {duplicatePairs.length > 0 && (
              <span style={{
                background: "#D4775A", color: "white", borderRadius: 10,
                fontSize: 10, padding: "1px 6px", marginLeft: 5,
              }}>
                {duplicatePairs.length}
              </span>
            )}
          </button>
          {/* + Ingrédient */}
          {userCanWrite && (
          <button
            onClick={() => {
              setShowCreateForm(v => {
                const next = !v;
                if (next) setTimeout(() => document.getElementById("create-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
                return next;
              });
            }}
            style={{ background: "#D4775A", color: "white", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 13, padding: "8px 16px", whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(212,119,90,0.25)" }}
          >
            {showCreateForm ? "✕ Fermer" : "+ Ingredient"}
          </button>
          )}
        </div>
      </header>

      {/* ══════════════════════════════════════════════
          TOOLBAR
      ══════════════════════════════════════════════ */}
      <div style={{ position: "sticky", top: 56, zIndex: 40, background: "#f2ede4", borderBottom: "1px solid #ddd6c8" }}>

        {/* Tabs — pill toggle scrollable */}
        <div style={{ overflowX: "auto", display: "flex", gap: 6, padding: "10px 20px", background: "#f2ede4" }}>
          {TABS_MAIN.map(({ t, label, count }) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flexShrink: 0, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              borderRadius: 12, whiteSpace: "nowrap",
              border: tab === t ? "1.5px solid #D4775A" : "1.5px solid #ddd6c8",
              background: tab === t ? "#D4775A" : "#fff",
              color: tab === t ? "#fff" : "#999",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              transition: "all 0.15s",
            }}>{label} ({count})</button>
          ))}
          {/* Variations prix tab removed — accessible via sidebar */}
        </div>

        {!isVariations && (
          <>
            {/* Desktop filter row */}
            <div className="hidden md:grid" style={{ gridTemplateColumns: "1fr 1fr auto auto auto", gap: 8, padding: "10px 20px" }}>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as "all" | Category)} style={selStyle}>
                <option value="all">Toutes categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
              </select>
              <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} style={selStyle}>
                <option value="all">Tous fournisseurs</option>
                {suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={includeNoOffer} onChange={(e) => setIncludeNoOffer(e.target.checked)} style={{ accentColor: "#D4775A" }} />
                Sans offre
              </label>
              <button onClick={toggleAll} title={allCollapsed ? "Tout déplier" : "Tout replier"} style={{ width: 34, height: 34, borderRadius: 12, border: "1.5px solid #ddd6c8", background: "white", fontSize: 16, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                {allCollapsed ? "▸▸" : "▾▾"}
              </button>
              <button onClick={reload} style={{ padding: "8px 12px", borderRadius: 12, border: "1.5px solid #ddd6c8", background: "white", fontSize: 14, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                ↺
              </button>
            </div>

            {/* Search bar — all sizes */}
            <div style={{ padding: "8px 20px 10px", display: "flex", gap: 8 }}>
              <input
                placeholder="Rechercher un ingredient…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ flex: 1, borderRadius: 12, border: "1.5px solid #ddd6c8", padding: "10px 16px", fontSize: 13, background: "white", outline: "none", color: "#1a1a1a", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
              />
              {/* Mobile only: Filtres + compact */}
              <button className="md:hidden" onClick={() => setShowFilters(true)} style={{ padding: "10px 14px", borderRadius: 12, border: "1.5px solid #ddd6c8", background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                Filtres{filterActive ? " ●" : ""}
              </button>
              <button className="md:hidden" onClick={toggleCompact} style={{ padding: "10px 12px", borderRadius: 12, border: "1.5px solid #ddd6c8", background: "white", fontSize: 14, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                {compactMode ? "⊞" : "☰"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          MAIN
      ══════════════════════════════════════════════ */}
      <main style={{ padding: "0 20px 60px", boxSizing: "border-box" }}>

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

            {/* Skeleton loader */}
            {loading && <SkeletonTable />}

            {/* Erreur de chargement */}
            {!loading && dataError && (
              <div style={{ margin: "12px 0", padding: "14px 16px", background: "#FEF2F2", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 10, fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                Erreur de chargement : {(dataError as Error).message ?? String(dataError)}
              </div>
            )}

            {/* ── Card-based list container ── */}
            {!loading && !dataError && (
              <div style={{ marginTop: 4 }}>

                {/* Rows */}
                {grouped.map(({ cat, items: catItems }) => (
                  <div key={cat}>
                    <CategoryHeader
                      cat={cat}
                      count={catItems.length}
                      isCollapsed={collapsedCats.has(cat)}
                      onToggle={toggleCat}
                    />
                    {!collapsedCats.has(cat) && catItems.map((x) => {
                      const offer = offersByIngredientId.get(x.id);
                      const supplierIdForDisplay = offer?.supplier_id ?? x.supplier_id ?? null;
                      const supplierName = supplierIdForDisplay ? suppliersMap.get(supplierIdForDisplay)?.name ?? null : null;
                      return (
                        <div key={x.id} id={`ing-${x.id}`}>
                          <IngredientRow
                            item={x}
                            offer={offer}
                            supplierName={supplierName}
                            supplierIdForDisplay={supplierIdForDisplay}
                            alert={alertMap.get(x.id)}
                            isEditing={editingId === x.id}
                            compactMode={compactMode}
                            edit={editingId === x.id ? edit : null}
                            suppliers={suppliers}
                            storageZones={storageZones}
                            previewEditPack={editingId === x.id ? previewEditPack : ""}
                            onStartEdit={userCanWrite ? startEdit : () => {}}
                            onSaveEdit={userCanWrite ? saveEdit : () => {}}
                            onDelete={userCanWrite ? del : () => {}}
                            onSetStatus={userCanWrite ? setIngredientStatus : () => {}}
                            onEditChange={onEditChange}
                            onEditImportName={onEditImportName}
                            onCreateDerived={userCanWrite ? openDeriveModal : undefined}
                            onOpenSupplier={openSupplierModal}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}

                {grouped.length === 0 && !loading && (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>
                    Aucun ingredient trouve.
                  </div>
                )}
              </div>
            )}

            {/* Infinite scroll sentinel */}
            {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
            {loadingMore && (
              <div style={{ padding: "16px 0", textAlign: "center", fontSize: 13, color: "#888" }}>
                Chargement…
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
      {/* ══════════════════════════════════════════════
          DUPLICATE PANEL
      ══════════════════════════════════════════════ */}
      {showDuplicates && (
        <DuplicatePanel
          pairs={duplicatePairs}
          offersByIngredientId={offersByIngredientId}
          suppliers={suppliers}
          onClose={() => setShowDuplicates(false)}
          onMerged={() => { setShowDuplicates(false); mutate(); }}
          onIgnore={(key) => {
            const next = new Set(ignoreKeys);
            next.add(key);
            setIgnoreKeys(next);
            localStorage.setItem("ingredient-duplicate-ignores", JSON.stringify([...next]));
          }}
        />
      )}

      {/* ══════════════════════════════════════════════
          RENDEMENT CALCULATOR MODAL
      ══════════════════════════════════════════════ */}
      {showRendementCalc && (() => {
        const selectedIng = items.find(x => x.id === rcIngredientId);
        const parentOffer = selectedIng ? offersByIngredientId.get(selectedIng.id) : undefined;
        const parentPrice = parentOffer?.unit_price
          ?? (selectedIng?.purchase_price && selectedIng?.purchase_unit
            ? selectedIng.purchase_price / selectedIng.purchase_unit : null)
          ?? selectedIng?.cost_per_unit
          ?? null;
        const rendement = (Number(rcPoidsBrut) > 0 && Number(rcPoidsNet) > 0)
          ? computeRendement(Number(rcPoidsBrut), Number(rcPoidsNet)) : null;
        const derivedPrice = (parentPrice && rendement) ? computeDerivedPrice(parentPrice, rendement) : null;

        return (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.45)" }} onClick={() => setShowRendementCalc(false)} />
            <div style={{
              position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
              zIndex: 71, background: "#faf7f2", borderRadius: 16, padding: 24, width: "min(420px, 92vw)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#1a1a1a" }}>Créer un dérivé</span>
                <button onClick={() => setShowRendementCalc(false)} style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "1px solid #e5ddd0", background: "white", cursor: "pointer", fontSize: 13 }}>✕</button>
              </div>

              {/* Ingredient parent */}
              <div style={{ marginBottom: 14, padding: "10px 12px", background: "white", borderRadius: 10, border: "1px solid #e5ddd0" }}>
                <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>Ingrédient parent</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{selectedIng?.name ?? "—"}</div>
              </div>

              {/* Weights */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>Poids brut (g)</div>
                  <input type="number" value={rcPoidsBrut} onChange={e => setRcPoidsBrut(e.target.value === "" ? "" : Number(e.target.value))}
                    style={{ width: "100%", height: 40, borderRadius: 8, border: "1px solid #e5ddd0", padding: "0 10px", fontSize: 14, background: "white", boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>Poids net (g)</div>
                  <input type="number" value={rcPoidsNet} onChange={e => setRcPoidsNet(e.target.value === "" ? "" : Number(e.target.value))}
                    style={{ width: "100%", height: 40, borderRadius: 8, border: "1px solid #e5ddd0", padding: "0 10px", fontSize: 14, background: "white", boxSizing: "border-box" }} />
                </div>
              </div>

              {/* Result */}
              <div style={{ background: "white", borderRadius: 10, padding: 14, border: "1px solid #e5ddd0", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "#666" }}>Rendement</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: rendement ? "#7C3AED" : "#ccc" }}>
                    {rendement ? `${(rendement * 100).toFixed(1)} %` : "—"}
                  </span>
                </div>
                {parentPrice != null && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "#999" }}>Prix parent</span>
                      <span style={{ fontSize: 13 }}>{parentPrice.toFixed(2)} EUR/unité</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "#999" }}>Prix dérivé</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: derivedPrice ? "#16A34A" : "#ccc" }}>
                        {derivedPrice ? `${derivedPrice.toFixed(2)} EUR/unité` : "—"}
                      </span>
                    </div>
                  </>
                )}
                {parentPrice == null && (
                  <div style={{ fontSize: 12, color: "#D97706", marginTop: 4 }}>Aucun prix trouvé pour cet ingrédient.</div>
                )}
              </div>

              {/* Derive name + actions */}
              {userCanWrite && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>Nom du dérivé (pour créer)</div>
                  <input type="text" value={rcDeriveName} onChange={e => setRcDeriveName(e.target.value)}
                    placeholder={selectedIng ? `${selectedIng.name} (paré)` : ""}
                    style={{ width: "100%", height: 40, borderRadius: 8, border: "1px solid #e5ddd0", padding: "0 10px", fontSize: 14, background: "white", boxSizing: "border-box" }} />
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowRendementCalc(false)} style={{
                  flex: 1, height: 42, borderRadius: 10, border: "1px solid #e5ddd0",
                  background: "white", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}>Fermer</button>
                {userCanWrite && rendement && (
                  <button
                    disabled={rcSaving || !rendement}
                    onClick={async () => {
                      if (!selectedIng || !rendement) return;
                      setRcSaving(true);
                      try {
                        const name = rcDeriveName.trim() || `${selectedIng.name} (paré)`;
                        const { error } = await supabase.from("ingredients").insert({
                          name,
                          category: selectedIng.category,
                          is_active: true,
                          default_unit: selectedIng.default_unit,
                          parent_ingredient_id: selectedIng.id,
                          rendement,
                          is_derived: true,
                          purchase_price: derivedPrice,
                          purchase_unit: 1,
                          purchase_unit_label: "kg",
                          allergens: selectedIng.allergens ?? null,
                          supplier_id: selectedIng.supplier_id ?? null,
                          ...(etab ? { etablissement_id: etab.id } : {}),
                        });
                        if (error) { alert(error.message); return; }
                        setShowRendementCalc(false);
                        mutate();
                      } finally { setRcSaving(false); }
                    }}
                    style={{
                      flex: 1, height: 42, borderRadius: 10, border: "none",
                      background: "#7C3AED", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer",
                      opacity: rcSaving ? 0.6 : 1,
                    }}
                  >
                    {rcSaving ? "Création..." : "Créer dérivé"}
                  </button>
                )}
              </div>
            </div>
          </>
        );
      })()}

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
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as "all" | Category)} style={{ ...selStyle, width: "100%", padding: "12px 14px", fontSize: 14 }}>
                  <option value="all">Tous</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                </select>
              </div>
              <div><div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>Fournisseur</div>
                <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} style={{ ...selStyle, width: "100%", padding: "12px 14px", fontSize: 14 }}>
                  <option value="all">Tous</option>
                  {suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <input type="checkbox" checked={includeNoOffer} onChange={(e) => setIncludeNoOffer(e.target.checked)} style={{ accentColor: "#D4775A" }} />
                Inclure sans offre
              </label>
            </div>
            <button onClick={() => setShowFilters(false)} style={{ width: "100%", height: 44, marginTop: 16, borderRadius: 10, border: "none", background: "#D4775A", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              Appliquer
            </button>
          </div>
        </>
      )}

      {/* ═══ MODALE FICHE FOURNISSEUR ═══ */}
      {modalSupplierId && (() => {
        const sup = suppliersMap.get(modalSupplierId);
        const supName = sup?.name ?? "Fournisseur";
        const supColor = getSupplierColor(supName);
        const lblSt: CSSProperties = { fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 4 };
        const inpSt: CSSProperties = { fontFamily: "DM Sans, sans-serif", fontSize: 14, padding: "10px 12px", border: "1.5px solid #e5ddd0", borderRadius: 10, width: "100%", background: "#fff", color: "#1a1a1a", outline: "none" };
        return (
          <div onClick={() => setModalSupplierId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 12px 40px rgba(0,0,0,0.18)", borderLeft: `5px solid ${supColor}`, maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px 12px" }}>
                <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 20, color: supColor, textTransform: "uppercase" }}>{supName}</span>
                <button onClick={() => setModalSupplierId(null)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.06)", color: "#999", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
              <div style={{ padding: "0 20px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div><div style={lblSt}>Contact</div><input style={inpSt} value={supplierForm.contact_name} onChange={(e) => setSupplierForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Prenom Nom" /></div>
                  <div><div style={lblSt}>Telephone</div><input style={inpSt} value={supplierForm.phone} onChange={(e) => setSupplierForm(f => ({ ...f, phone: e.target.value }))} placeholder="06 xx xx xx xx" type="tel" /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div><div style={lblSt}>Email</div><input style={inpSt} value={supplierForm.email} onChange={(e) => setSupplierForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@fournisseur.fr" type="email" /></div>
                  <div><div style={lblSt}>Franco minimum (EUR HT)</div><input style={inpSt} value={supplierForm.franco_minimum} onChange={(e) => setSupplierForm(f => ({ ...f, franco_minimum: e.target.value }))} placeholder="ex: 800" /></div>
                </div>
                <div style={{ marginBottom: 16 }}><div style={lblSt}>Notes</div><textarea style={{ ...inpSt, resize: "vertical" }} value={supplierForm.notes} onChange={(e) => setSupplierForm(f => ({ ...f, notes: e.target.value }))} placeholder="Delai de livraison, conditions..." rows={2} /></div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={saveSupplierModal} disabled={supplierSaving} style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600, background: supColor, color: "#fff", border: "none", borderRadius: 20, padding: "8px 20px", cursor: "pointer", opacity: supplierSaving ? 0.6 : 1 }}>
                    {supplierSaving ? "..." : supplierSaved ? "Enregistre !" : "Enregistrer"}
                  </button>
                  <Link href={`/ingredients?supplier=${modalSupplierId}`} onClick={() => setModalSupplierId(null)} style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: supColor, textDecoration: "none", fontWeight: 600 }}>Voir les articles →</Link>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
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

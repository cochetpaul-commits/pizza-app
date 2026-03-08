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
import { NavBar } from "@/components/NavBar";
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


function statusLabel(s: IngredientStatus): string {
  if (s === "validated") return "validé";
  if (s === "unknown") return "incompris";
  return "à contrôler";
}

function statusBadgeStyle(s: IngredientStatus): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 800,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.65)",
  };
  if (s === "validated") return { ...base, borderColor: "rgba(22,163,74,0.35)" };
  if (s === "unknown") return { ...base, borderColor: "rgba(234,88,12,0.35)" };
  return { ...base, borderColor: "rgba(2,132,199,0.35)" };
}

type IngredientPatch = Partial<
  Pick<Ingredient, "status" | "status_note" | "validated_at" | "validated_by">
>;

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

    return () => {
      if (unsub) unsub.unsubscribe();
    };
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

    if (tab !== "all") {
      base = base.filter((x) => ((x.status ?? "to_check") as IngredientStatus) === tab);
    }

    if (filterCategory !== "all") {
      base = base.filter((x) => x.category === filterCategory);
    }

    if (!includeNoOffer) {
      base = base.filter((x) => offersByIngredientId.has(x.id));
    }

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
    if (allCollapsed) {
      setCollapsedCats(new Set());
    } else {
      setCollapsedCats(new Set(grouped.map((g) => g.cat)));
    }
  }

  function toggleCat(cat: Category) {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
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

    // Price alerts badges
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
      if (!hasPrice) {
        alert("Impossible de valider : ajoute un prix (offre fournisseur ou legacy) avant.");
        return;
      }
    }

    const patch: IngredientPatch = { status: next };

    if (next === "validated") {
      if (!userId) {
        alert("Utilisateur non connecté.");
        return;
      }
      patch.validated_at = new Date().toISOString();
      patch.validated_by = userId;
      patch.status_note = null;
    }

    if (next === "to_check") {
      patch.status_note = null;
      patch.validated_at = null;
      patch.validated_by = null;
    }

    if (next === "unknown") {
      const note = prompt("Pourquoi incompris ? (optionnel)") ?? "";
      patch.status_note = note.trim() ? note.trim() : null;
      patch.validated_at = null;
      patch.validated_by = null;
    }

    const r = await supabase.from("ingredients").update(patch).eq("id", id);
    if (r.error) {
      alert(r.error.message);
      return;
    }
    await load();
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!editParam || items.length === 0) return;
    const target = items.find((x) => x.id === editParam);
    if (target) {
      startEdit(target);
      setTab("all");
    }
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
    name: string;
    category: Category;
    is_active: boolean;
    supplierId: string;
    useOffer: boolean;
    priceKind: PriceKind;
    unit: "kg" | "l" | "pc";
    unitPrice: string;
    density: string;
    pieceWeightG: string;
    packTotalQty: string;
    packPrice: string;
    packUnit: "kg" | "l";
    packCount: string;
    packEachQty: string;
    packEachUnit: "kg" | "l" | "pc";
    packPieceWeightG: string;
    pieceVolumeMl: string;
    allergens: string[];
  } | null>(null);

  function handleNewNameChange(value: string) {
    setNewName(value);
    if (!value.trim()) return;

    // Catégorie
    const detectedCat = detectCategoryFromName(value);
    if (detectedCat !== "autre") setNewCategory(detectedCat);

    // Unité
    const detectedUnit = detectUnitFromName(value);
    setNewUnit(detectedUnit);

    // Volume pièce (bouteilles)
    const vol = extractVolumeFromName(value);
    if (vol != null) setNewPieceVolumeMl(String(vol));

    // Poids pièce
    const weightG = extractWeightGFromName(value);
    if (weightG != null) setNewPieceWeightG(String(weightG));
  }

  function resetCreatePriceBlocks() {
    setNewUnit("kg");
    setNewUnitPrice("");
    setNewDensity("1.0");
    setNewPieceWeightG("");
    setNewPieceVolumeMl("");
    setPackTotalQty("");
    setPackPrice("");
    setPackCount("");
    setPackEachQty("");
    setPackEachUnit("l");
    setPackPieceWeightG("");
  }

  const previewCreatePack = useMemo(() => {
  let d: LatestOffer | null = null;

  if (priceKind === "unit") {
    const p = parseNum(newUnitPrice);
    if (p != null && p > 0) {
      if (newUnit === "pc") {
        const pw = parseNum(newPieceWeightG);
        d = {
          ingredient_id: "",
          supplier_id: "",
          price_kind: "unit",
          unit: "pc",
          unit_price: p,
          pack_price: null,
          pack_total_qty: null,
          pack_unit: null,
          pack_count: null,
          pack_each_qty: null,
          pack_each_unit: null,
          density_kg_per_l: null,
          piece_weight_g: pw ?? null,
        };
      } else if (newUnit === "l") {
          const dens = parseNum(newDensity);
          if (dens != null && dens > 0) {
            d = {
              ingredient_id: "",
              supplier_id: "",
              price_kind: "unit",
              unit: "l",
              unit_price: p,
              pack_price: null,
              pack_total_qty: null,
              pack_unit: null,
              pack_count: null,
              pack_each_qty: null,
              pack_each_unit: null,
              density_kg_per_l: dens,
              piece_weight_g: null,
            };
          }
        } else {
          d = {
            ingredient_id: "",
            supplier_id: "",
            price_kind: "unit",
            unit: "kg",
            unit_price: p,
            pack_price: null,
            pack_total_qty: null,
            pack_unit: null,
            pack_count: null,
            pack_each_qty: null,
            pack_each_unit: null,
            density_kg_per_l: null,
            piece_weight_g: null,
          };
        }
      }
    } else if (priceKind === "pack_simple") {
      const pp = parseNum(packPrice);
      const qty = parseNum(packTotalQty);
      if (pp != null && pp > 0 && qty != null && qty > 0) {
        if (newUnit === "l") {
          const dens = parseNum(newDensity);
          if (dens != null && dens > 0) {
            d = {
              ingredient_id: "",
              supplier_id: "",
              price_kind: "pack_simple",
              unit: null,
              unit_price: null,
              pack_price: pp,
              pack_total_qty: qty,
              pack_unit: "l",
              pack_count: null,
              pack_each_qty: null,
              pack_each_unit: null,
              density_kg_per_l: dens,
              piece_weight_g: null,
            };
          }
        } else {
          d = {
            ingredient_id: "",
            supplier_id: "",
            price_kind: "pack_simple",
            unit: null,
            unit_price: null,
            pack_price: pp,
            pack_total_qty: qty,
            pack_unit: "kg",
            pack_count: null,
            pack_each_qty: null,
            pack_each_unit: null,
            density_kg_per_l: null,
            piece_weight_g: null,
          };
        }
      }
    } else if (priceKind === "pack_composed") {
      const pp = parseNum(packPrice);
      const c = parseNum(packCount);
      if (pp != null && pp > 0 && c != null && c > 0) {
        if (packEachUnit === "pc") {
          const pw = parseNum(packPieceWeightG);
          if (pw != null && pw > 0) {
            d = {
              ingredient_id: "",
              supplier_id: "",
              price_kind: "pack_composed",
              unit: null,
              unit_price: null,
              pack_price: pp,
              pack_total_qty: null,
              pack_unit: null,
              pack_count: c,
              pack_each_qty: null,
              pack_each_unit: "pc",
              density_kg_per_l: null,
              piece_weight_g: pw,
            };
          }
        } else {
          const each = parseNum(packEachQty);
          if (each != null && each > 0) {
            if (packEachUnit === "l") {
              const dens = parseNum(newDensity);
              if (dens != null && dens > 0) {
                d = {
                  ingredient_id: "",
                  supplier_id: "",
                  price_kind: "pack_composed",
                  unit: null,
                  unit_price: null,
                  pack_price: pp,
                  pack_total_qty: null,
                  pack_unit: null,
                  pack_count: c,
                  pack_each_qty: each,
                  pack_each_unit: "l",
                  density_kg_per_l: dens,
                  piece_weight_g: null,
                };
              }
            } else {
              d = {
                ingredient_id: "",
                supplier_id: "",
                price_kind: "pack_composed",
                unit: null,
                unit_price: null,
                pack_price: pp,
                pack_total_qty: null,
                pack_unit: null,
                pack_count: c,
                pack_each_qty: each,
                pack_each_unit: "kg",
                density_kg_per_l: null,
                piece_weight_g: null,
              };
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
    user_id: string;
    ingredient_id: string;
    supplier_id: string;
    price_kind: PriceKind;
    is_active: boolean;
    price: number;
    unit?: "kg" | "l" | "pc" | null;
    unit_price?: number | null;
    pack_price?: number | null;
    pack_total_qty?: number | null;
    pack_unit?: "kg" | "l" | null;
    pack_count?: number | null;
    pack_each_qty?: number | null;
    pack_each_unit?: "kg" | "l" | "pc" | null;
    density_kg_per_l?: number | null;
    piece_weight_g?: number | null;
  };

  function buildOfferFromCreate(ingredient_id: string, uid: string): SupplierOfferPayload | null {
    const supplier_id = normalizeSupplierId(newSupplierId);
    if (!supplier_id) {
      alert("Fournisseur obligatoire pour enregistrer une offre.");
      return null;
    }
    if (!uid) {
      alert("Utilisateur non connecté. Impossible d'enregistrer l'offre.");
      return null;
    }

    if (priceKind === "unit") {
      const p = parseNum(newUnitPrice);
      if (p == null || p <= 0) { alert("Prix unitaire invalide."); return null; }

      if (newUnit === "pc") {
        const pw = parseNum(newPieceWeightG) ?? null;
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "pc", unit_price: p, price: p, piece_weight_g: pw, density_kg_per_l: null, is_active: true };
      }
      if (newUnit === "l") {
        const d = parseNum(newDensity);
        if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "l", unit_price: p, price: p, density_kg_per_l: d, piece_weight_g: null, is_active: true };
      }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "kg", unit_price: p, price: p, density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }

    if (priceKind === "pack_simple") {
      const pp = parseNum(packPrice);
      const qty = parseNum(packTotalQty);
      if (pp == null || pp <= 0) { alert("Prix du pack invalide."); return null; }
      if (qty == null || qty <= 0) { alert("Quantité totale du pack invalide."); return null; }

      if (newUnit === "l") {
        const d = parseNum(newDensity);
        if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true };
      }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }

    if (priceKind === "pack_composed") {
      const pp = parseNum(packPrice);
      const c = parseNum(packCount);
      if (pp == null || pp <= 0) { alert("Prix du pack invalide."); return null; }
      if (c == null || c <= 0) { alert("Nombre d'unités invalide."); return null; }

      if (packEachUnit === "pc") {
        const pw = parseNum(packPieceWeightG);
        if (pw == null || pw <= 0) { alert("Poids pièce obligatoire (g)."); return null; }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_unit: "pc", piece_weight_g: pw, density_kg_per_l: null, is_active: true };
      }

      const each = parseNum(packEachQty);
      if (each == null || each <= 0) { alert("Quantité par élément invalide."); return null; }

      if (packEachUnit === "l") {
        const d = parseNum(newDensity);
        if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_qty: each, pack_each_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true };
      }
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
      name,
      category: newCategory,
      allergens: detectAllergensFromName(name).length ? detectAllergensFromName(name) : null,
      is_active: true,
      default_unit: "g",
      purchase_price: null,
      purchase_unit: null,
      purchase_unit_label: null,
      purchase_unit_name: newUnit,
      density_g_per_ml: 1.0,
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
    };

    const ins = await supabase.from("ingredients").insert(baseIngredient).select("id").single();
    if (ins.error) { alert(ins.error.message); return; }

    const ingredient_id = ins.data.id as string;

    if (supplier_id && newCategory !== "preparation") {
      if (!userId) { alert("Utilisateur non connecté. Impossible d'enregistrer l'offre."); return; }

      const offerPayload = buildOfferFromCreate(ingredient_id, userId);
      if (!offerPayload) return;

      const dPrev = await supabase
        .from("supplier_offers")
        .update({ is_active: false })
        .eq("ingredient_id", ingredient_id)
        .eq("supplier_id", supplier_id)
        .eq("is_active", true);

      if (dPrev.error) { alert(dPrev.error.message); return; }

      let off = await supabase.from("supplier_offers").insert(offerPayload);

      if (off.error && (off.error as { code?: string }).code === "23505") {
        const dPrev2 = await supabase
          .from("supplier_offers")
          .update({ is_active: false })
          .eq("ingredient_id", ingredient_id)
          .eq("supplier_id", supplier_id)
          .eq("is_active", true);

        if (dPrev2.error) { alert(dPrev2.error.message); return; }
        off = await supabase.from("supplier_offers").insert(offerPayload);
      }

      if (off.error) { alert(off.error.message); return; }
    }

    setNewName("");
    setNewCategory("preparation");
    setNewSupplierId("");
    setPriceKind("unit");
    resetCreatePriceBlocks();
    await load();
  }

  function startEdit(x: Ingredient) {
    const off = offersByIngredientId.get(x.id);

    const isPrep = x.category === "preparation";
    const supplierId = isPrep ? "" : (off?.supplier_id ?? (x.supplier_id ?? ""));

    setEditingId(x.id);
    setEdit({
      name: x.name,
      category: x.category,
      is_active: x.is_active,
      supplierId,
      useOffer: isPrep ? false : true,
      priceKind: isPrep ? "unit" : (off?.price_kind ?? "unit"),
      unit: (off?.unit ?? "kg") as "kg" | "l" | "pc",
      unitPrice: off?.unit_price != null ? String(off.unit_price) : "",
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

      if (edit.unit === "pc") {
        const pw = parseNum(edit.pieceWeightG) ?? null;
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "pc", unit_price: p, price: p, piece_weight_g: pw, density_kg_per_l: null, is_active: true };
      }
      if (edit.unit === "l") {
        const d = parseNum(edit.density);
        if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "l", unit_price: p, price: p, density_kg_per_l: d, piece_weight_g: null, is_active: true };
      }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "kg", unit_price: p, price: p, density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }

    if (edit.priceKind === "pack_simple") {
      const pp = parseNum(edit.packPrice);
      const qty = parseNum(edit.packTotalQty);
      if (pp == null || pp <= 0) { alert("Prix du pack invalide."); return null; }
      if (qty == null || qty <= 0) { alert("Quantité totale du pack invalide."); return null; }

      if (edit.packUnit === "l") {
        const d = parseNum(edit.density);
        if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true };
      }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }

    if (edit.priceKind === "pack_composed") {
      const pp = parseNum(edit.packPrice);
      const c = parseNum(edit.packCount);
      if (pp == null || pp <= 0) { alert("Prix du pack invalide."); return null; }
      if (c == null || c <= 0) { alert("Nombre d'unités invalide."); return null; }

      if (edit.packEachUnit === "pc") {
        const pw = parseNum(edit.packPieceWeightG);
        if (pw == null || pw <= 0) { alert("Poids pièce obligatoire (g)."); return null; }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_unit: "pc", piece_weight_g: pw, density_kg_per_l: null, is_active: true };
      }

      const each = parseNum(edit.packEachQty);
      if (each == null || each <= 0) { alert("Quantité par élément invalide."); return null; }

      if (edit.packEachUnit === "l") {
        const d = parseNum(edit.density);
        if (d == null || d <= 0) { alert("Densité obligatoire (kg/L)."); return null; }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_qty: each, pack_each_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true };
      }
      return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_qty: each, pack_each_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }

    return null;
  }

  const previewEditPack = useMemo(() => {
    if (!edit) return "";
    if (!edit.useOffer) return "";

    const d: LatestOffer = {
      ingredient_id: "",
      supplier_id: "",
      price_kind: edit.priceKind,
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
      name,
      category: edit.category,
      is_active: edit.is_active,
      supplier_id,
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

    setEditingId(null);
    setEdit(null);

    if (backUrl) {
      router.push(backUrl);
      return;
    }

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

  return (
    <>
    <NavBar
      backHref={backUrl ?? undefined}
      backLabel="Retour"
      right={<>
        <button className="btn btnPrimary"
          onClick={() => {
            setShowCreateForm(v => {
              const next = !v;
              if (next) setTimeout(() => document.getElementById("create-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
              return next;
            });
          }}>
          {showCreateForm ? "✕ Fermer" : "+ Ingrédient"}
        </button>
        <button className="btn hidden md:inline-flex" onClick={load}>Rafraîchir</button>
      </>}
    />
    <main className="max-w-[1100px] mx-auto p-4 safe-bottom">
      <div style={{ marginBottom: 12 }}>
        <h1 className="h1">Index ingrédients</h1>
        <p className="muted" style={{ marginTop: 4 }}>Gérez vos coûts au kg, au litre, à la pièce — et par fournisseur.</p>
      </div>

      {/* ── Sticky filter bar ── */}
      <div className="sticky top-[44px] z-40 bg-[#FAF7F2] -mx-4 px-4 pt-2 border-b border-gray-200">
        <div role="tablist" aria-label="Filtre statut ingrédients" className="flex gap-1.5 flex-wrap items-center">
          {([
            ["all", `Tous (${counts.all})`],
            ["validated", `Validés (${counts.validated})`],
            ["to_check", `À contrôler (${counts.to_check})`],
            ["unknown", `Incompris (${counts.unknown})`],
          ] as const).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className="py-[7px] px-4 rounded-lg border border-transparent cursor-pointer font-bold text-[13px] transition-all duration-150"
              style={{
                background: tab === t ? "#8B1A1A" : "#fff",
                color: tab === t ? "#fff" : "#6B6257",
                boxShadow: tab === t ? "0 2px 6px rgba(139,26,26,0.25)" : "0 1px 3px rgba(0,0,0,0.08)",
              }}>{label}</button>
          ))}
          {userId && (
            <button role="tab" aria-selected={tab === ("variations" as Tab)} onClick={() => setTab("variations" as Tab)}
              className="ml-auto py-[7px] px-4 rounded-lg border border-transparent cursor-pointer font-bold text-[13px] transition-all duration-150"
              style={{
                background: tab === ("variations" as Tab) ? "#92400E" : "#fff",
                color: tab === ("variations" as Tab) ? "#fff" : "#92400E",
                boxShadow: tab === ("variations" as Tab) ? "0 2px 6px rgba(146,64,14,0.25)" : "0 1px 3px rgba(0,0,0,0.08)",
              }}>Variations prix</button>
          )}
        </div>

        {tab !== ("variations" as Tab) && (
          <>
            {/* Desktop : filtre grid (md+) */}
            <div className="card !shadow-none !p-3 mt-2 hidden md:block">
              <div className="grid grid-cols-4 gap-3 items-end">
                <div>
                  <div className="text-[12px] opacity-75 mb-1.5">Catégorie</div>
                  <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={filterCategory} onChange={(e) => setFilterCategory((e.target.value as "all" | Category))}>
                    <option value="all">Tous</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-[12px] opacity-75 mb-1.5">Fournisseur</div>
                  <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)}>
                    <option value="all">Tous</option>
                    {suppliers.filter((s) => s.is_active).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-[12px] opacity-75 mb-1.5">Établissement</div>
                  <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={filterEstablishment} onChange={(e) => setFilterEstablishment(e.target.value as "all" | "bellomio" | "piccola" | "both")}>
                    <option value="all">Tous</option>
                    <option value="bellomio">Bello Mio</option>
                    <option value="piccola">Piccola Mia</option>
                    <option value="both">Les deux</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 h-[44px]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={includeNoOffer} onChange={(e) => setIncludeNoOffer(e.target.checked)} />
                    <span className="font-extrabold text-[12px]">Inclure sans offre</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Mobile : bouton "Filtres" + compact toggle */}
            <div className="flex gap-2 mt-2 items-center md:hidden">
              <button className="btn flex-1" onClick={() => setShowFilters(true)}>
                Filtres {filterActive ? "●" : "▾"}
              </button>
              <button className="btn" onClick={toggleCompact}>
                {compactMode ? "⊞" : "☰"}
              </button>
            </div>

            <div className="flex gap-2 mt-2 mb-2 items-center">
              <input
                className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none flex-1"
                placeholder="Rechercher..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="btn" onClick={toggleAll} style={{ whiteSpace: "nowrap" }}>
                {allCollapsed ? "Tout déplier" : "Tout replier"}
              </button>
            </div>
          </>
        )}
      </div>

      {tab === ("variations" as Tab) && userId && <div className="mt-3"><PriceAlertsPanel userId={userId} /></div>}

      {tab !== ("variations" as Tab) && showCreateForm && <div id="create-form" className="card mt-4" style={{ animation: "slideDown 0.2s ease-out" }}>
        <div className="font-black text-[18px]">Créer un ingrédient</div>

        <form onSubmit={addIngredient} className="mt-3 grid gap-3">
          <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <div>
              <div className="text-[12px] opacity-75 mb-1.5">Ingrédient</div>
              <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Ex: Huile d'olive" value={newName} onChange={(e) => handleNewNameChange(e.target.value)} />
            </div>
            <div>
              <div className="text-[12px] opacity-75 mb-1.5">Catégorie</div>
              <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={newCategory} onChange={(e) => {
                const next = e.target.value as Category;
                setNewCategory(next);
                if (next === "preparation") {
                  setNewSupplierId("");
                  setPriceKind("unit");
                  resetCreatePriceBlocks();
                }
              }}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {newCategory !== "preparation" ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
              <div>
                <div className="text-[12px] opacity-75 mb-1.5">Fournisseur</div>
                <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={newSupplierId} onChange={(e) => setNewSupplierId(e.target.value)}>
                  <option value="">—</option>
                  {suppliers.filter((s) => s.is_active).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="self-end">
                <button className="btn btnPrimary w-full !h-[44px]" type="submit">
                  Ajouter
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button className="btn btnPrimary w-full !h-[44px]" type="submit">
                Ajouter
              </button>
            </div>
          )}

          {newCategory !== "preparation" ? (
            <>
              <div>
                <div className="text-[12px] opacity-75 mb-1.5">Offre fournisseur</div>
                <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={priceKind} onChange={(e) => setPriceKind(e.target.value as PriceKind)}>
                  <option value="unit">Unitaire (€/kg, €/L, €/pc)</option>
                  <option value="pack_simple">Pack simple (sac/caisse)</option>
                  <option value="pack_composed">Pack composé (ex: 8 × 1.5 L)</option>
                </select>
              </div>

              {priceKind === "unit" && (
                <>
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <div className="text-[12px] opacity-75 mb-1.5">Unité</div>
                      <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={newUnit} onChange={(e) => setNewUnit(e.target.value as "kg" | "l" | "pc")}>
                        <option value="kg">Kilo (kg)</option>
                        <option value="l">Litre (L)</option>
                        <option value="pc">Pièce (pc)</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-[12px] opacity-75 mb-1.5">Prix</div>
                      <input
                        className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none"
                        placeholder={newUnit === "pc" ? "Ex: 1.79" : newUnit === "l" ? "Ex: 2.07" : "Ex: 12.50"}
                        inputMode="decimal"
                        value={newUnitPrice}
                        onChange={(e) => setNewUnitPrice(e.target.value)}
                      />
                    </div>
                  </div>

                  {newUnit === "l" && (
                    <div>
                      <div className="text-[12px] opacity-75 mb-1.5">Densité (kg/L)</div>
                      <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" value={newDensity} onChange={(e) => setNewDensity(e.target.value)} />
                    </div>
                  )}

                  {newUnit === "pc" && (
                    <>
                      <div>
                        <div className="text-[12px] opacity-75 mb-1.5">Poids d&apos;une pièce (g)</div>
                        <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Ex: 125" inputMode="decimal" value={newPieceWeightG} onChange={(e) => setNewPieceWeightG(e.target.value)} />
                      </div>
                      <div>
                        <div className="text-[12px] opacity-75 mb-1.5">Volume pièce (ml)</div>
                        <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="ex: 700 pour 70cl" inputMode="decimal" value={newPieceVolumeMl} onChange={(e) => setNewPieceVolumeMl(e.target.value)} />
                      </div>
                    </>
                  )}
                </>
              )}

              {priceKind === "pack_simple" && (
                <>
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <div className="text-[12px] opacity-75 mb-1.5">Unité pack</div>
                      <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={newUnit} onChange={(e) => setNewUnit(e.target.value as "kg" | "l" | "pc")}>
                        <option value="kg">Kilo (kg)</option>
                        <option value="l">Litre (L)</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-[12px] opacity-75 mb-1.5">Prix du pack (€)</div>
                      <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Ex: 53.99" inputMode="decimal" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <div className="text-[12px] opacity-75 mb-1.5">Quantité totale du pack ({newUnit === "kg" ? "kg" : "L"})</div>
                      <input
                        className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none"
                        placeholder={newUnit === "kg" ? "Ex: 25" : "Ex: 12"}
                        inputMode="decimal"
                        value={packTotalQty}
                        onChange={(e) => setPackTotalQty(e.target.value)}
                      />
                    </div>
                    <div className="muted text-[12px]">
                      {previewCreatePack ? previewCreatePack : "—"}
                    </div>
                  </div>

                  {newUnit === "l" && (
                    <div>
                      <div className="text-[12px] opacity-75 mb-1.5">Densité (kg/L)</div>
                      <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" value={newDensity} onChange={(e) => setNewDensity(e.target.value)} />
                    </div>
                  )}
                </>
              )}

              {priceKind === "pack_composed" && (
                <>
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <div className="text-[12px] opacity-75 mb-1.5">Prix du pack (€)</div>
                      <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Ex: 18.56" inputMode="decimal" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} />
                    </div>
                    <div>
                      <div className="text-[12px] opacity-75 mb-1.5">Nombre d&apos;unités</div>
                      <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Ex: 8" inputMode="decimal" value={packCount} onChange={(e) => setPackCount(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <div className="text-[12px] opacity-75 mb-1.5">Unité de chaque élément</div>
                      <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={packEachUnit} onChange={(e) => setPackEachUnit(e.target.value as "kg" | "l" | "pc")}>
                        <option value="l">Litre (L)</option>
                        <option value="kg">Kilo (kg)</option>
                        <option value="pc">Pièce (pc)</option>
                      </select>
                    </div>

                    {packEachUnit !== "pc" ? (
                      <div>
                        <div className="text-[12px] opacity-75 mb-1.5">Quantité par élément ({packEachUnit === "kg" ? "kg" : "L"})</div>
                        <input
                          className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none"
                          placeholder={packEachUnit === "kg" ? "Ex: 1" : "Ex: 1.5"}
                          inputMode="decimal"
                          value={packEachQty}
                          onChange={(e) => setPackEachQty(e.target.value)}
                        />
                      </div>
                    ) : (
                      <div>
                        <div className="text-[12px] opacity-75 mb-1.5">Poids d&apos;une pièce (g)</div>
                        <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Ex: 125" inputMode="decimal" value={packPieceWeightG} onChange={(e) => setPackPieceWeightG(e.target.value)} />
                      </div>
                    )}
                  </div>

                  {packEachUnit === "l" && (
                    <div>
                      <div className="text-[12px] opacity-75 mb-1.5">Densité (kg/L)</div>
                      <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" value={newDensity} onChange={(e) => setNewDensity(e.target.value)} />
                    </div>
                  )}
                </>
              )}
            </>
          ) : null}
        </form>
      </div>}

      {tab !== ("variations" as Tab) && loading && <div className="muted mt-3">Chargement…</div>}

      {grouped.map(({ cat, items: catItems }) => {
        const isCollapsed = collapsedCats.has(cat);
        return (
          <div key={cat} className="mt-3.5">
            <button
              onClick={() => toggleCat(cat)}
              className="flex items-center gap-2 w-full px-[14px] py-2 bg-black/[.04] border border-black/[.08] rounded-[10px] cursor-pointer text-left font-[inherit]"
            >
              <span className="font-extrabold text-[14px]" style={{ color: CAT_COLORS[cat] }}>{CAT_LABELS[cat]}</span>
              <span className="text-[13px] text-[#999]">({catItems.length})</span>
              <span className="ml-auto text-[12px] text-[#666]">{isCollapsed ? "▶" : "▼"}</span>
            </button>

            {!isCollapsed && (
              <div className="card mt-1.5">
                <div className="grid md:grid-cols-2 gap-2.5">
                  {catItems.map((x) => {
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

                    return (
                      <div key={x.id} className="border border-black/10 rounded-xl p-3" style={{ background: "#FAF7F2" }}>

                        {/* ── Desktop layout (md+) ── */}
                        <div className="hidden md:grid gap-3" style={{ gridTemplateColumns: "2fr 1fr 1fr auto" }}>
                          <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <div style={{ fontWeight: 900, color: CAT_COLORS[x.category] }}>{x.name}</div>
                              <span style={statusBadgeStyle(st)}>{statusLabel(st)}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: estabBadge.bg, color: estabBadge.color }}>{estabBadge.label}</span>
                              {alertMap.has(x.id) && (() => { const a = alertMap.get(x.id)!; return <span style={{ fontSize: 11, fontWeight: 800, color: a.direction === "up" ? "#DC2626" : "#16A34A", background: a.direction === "up" ? "rgba(220,38,38,0.10)" : "rgba(22,163,74,0.10)", border: `1px solid ${a.direction === "up" ? "rgba(220,38,38,0.30)" : "rgba(22,163,74,0.30)"}`, borderRadius: 8, padding: "1px 6px" }}>{a.direction === "up" ? "↑" : "↓"} {(Math.abs(a.change_pct) * 100).toFixed(0)} %</span>; })()}
                            </div>
                            <div className="muted text-[12px]">
                              {supplierName && supplierIdForDisplay ? (
                                <Link href={`/fournisseurs/${supplierIdForDisplay}`} style={{ color: "inherit", textDecoration: "underline dotted", textUnderlineOffset: 2 }}>
                                  {supplierName}
                                </Link>
                              ) : x.category}
                              {x.source_prep_recipe_name ? ` • Pivot: ${x.source_prep_recipe_name}` : ""}
                              {offer ? " • offre" : ""}
                              {x.status_note ? ` • note: ${x.status_note}` : ""}
                            </div>
                            <>
                              {(() => { const alg = parseAllergens(x.allergens); return alg.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {alg.map(a => (
                                    <span key={a} title={a} style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 5, background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.20)" }}>
                                      {ALLERGEN_SHORT[a as keyof typeof ALLERGEN_SHORT] ?? a}
                                    </span>
                                  ))}
                                </div>
                              ); })()}
                              {!hasPrice && <div className="mt-1.5"><span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[12px] font-extrabold bg-red-600/10 text-red-600 border border-red-600/25">prix manquant</span></div>}
                              {st !== "validated" && (
                                <div className="flex gap-1.5 mt-2 flex-wrap">
                                  <button className="btn" onClick={() => setIngredientStatus(x.id, "to_check")}>À contrôler</button>
                                  <button className="btn" disabled={!canValidate} onClick={() => { if (!canValidate) return; setIngredientStatus(x.id, "validated"); }} style={!canValidate ? { opacity: 0.45, cursor: "not-allowed" } : undefined} title={!canValidate ? "Ajoute un prix avant de valider." : ""}>Valider</button>
                                  <button className="btn" onClick={() => setIngredientStatus(x.id, "unknown")}>Incompris</button>
                                </div>
                              )}
                            </>
                          </div>
                          <div>
                            <div className="text-[12px] opacity-75 mb-1.5">Densité / Poids / Vol.</div>
                            <div className="font-semibold">
                              {offer?.density_kg_per_l != null ? `${fmtQty(offer.density_kg_per_l)} kg/L` : offer?.piece_weight_g != null ? `${fmtQty(offer.piece_weight_g)} g/pc` : x.piece_volume_ml != null ? fmtVolume(x.piece_volume_ml) + "/pc" : x.purchase_unit_name === "l" ? `${x.density_g_per_ml ?? 1} kg/L` : x.piece_weight_g ? `${x.piece_weight_g} g/pc` : "—"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[18px]" style={{ fontWeight: 950 }}>{price}</div>
                            <div className="muted text-[11px]">
                              {supplierName && supplierIdForDisplay ? (
                                <Link href={`/fournisseurs/${supplierIdForDisplay}`} style={{ color: "inherit", textDecoration: "underline dotted", textUnderlineOffset: 2 }}>
                                  {supplierName}
                                </Link>
                              ) : (offer ? "offre" : "—")}
                            </div>
                          </div>
                          <div className="flex gap-1.5 items-center">
                            {!isEditing ? <button className="btn btnPrimary" onClick={() => startEdit(x)} title="Contrôler / modifier" style={{ fontSize: 18, padding: "0 12px", height: 36 }}>→</button> : <button className="btn btnPrimary" onClick={saveEdit}>OK</button>}
                            <button className="btn btnDanger" onClick={() => del(x.id, x.name)} title="Supprimer" style={{ fontSize: 16, padding: "0 12px", height: 36 }}>✕</button>
                          </div>
                        </div>

                        {/* ── Mobile layout ── */}
                        <div className="md:hidden">
                          {compactMode ? (
                            // Compact : une ligne
                            <div className="flex items-center gap-2">
                              <div className="font-black flex-1 min-w-0 line-clamp-1" style={{ color: CAT_COLORS[x.category] }}>{x.name}</div>
                              <div className="text-[14px] shrink-0" style={{ fontWeight: 950 }}>{price}</div>
                              {alertMap.has(x.id) && (() => { const a = alertMap.get(x.id)!; return <span style={{ fontSize: 10, fontWeight: 800, color: a.direction === "up" ? "#DC2626" : "#16A34A", background: a.direction === "up" ? "rgba(220,38,38,0.10)" : "rgba(22,163,74,0.10)", border: `1px solid ${a.direction === "up" ? "rgba(220,38,38,0.30)" : "rgba(22,163,74,0.30)"}`, borderRadius: 6, padding: "1px 5px", flexShrink: 0 }}>{a.direction === "up" ? "↑" : "↓"}</span>; })()}
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: estabBadge.bg, color: estabBadge.color, flexShrink: 0 }}>{estabBadge.label}</span>
                              {!isEditing
                                ? <button className="btn btnPrimary shrink-0 !h-8 !px-2" onClick={() => startEdit(x)}>→</button>
                                : <button className="btn btnPrimary shrink-0 !h-8 !px-2" onClick={saveEdit}>OK</button>}
                              <button className="btn btnDanger shrink-0 !h-8 !px-2" onClick={() => del(x.id, x.name)}>✕</button>
                            </div>
                          ) : (
                            // Full : carte améliorée
                            <>
                              {/* Ligne 1 : Nom + badges */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="font-black flex-1 min-w-0 line-clamp-2 leading-tight" style={{ color: CAT_COLORS[x.category] }}>{x.name}</div>
                                <span style={statusBadgeStyle(st)}>{statusLabel(st)}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: estabBadge.bg, color: estabBadge.color }}>{estabBadge.label}</span>
                                {alertMap.has(x.id) && (() => { const a = alertMap.get(x.id)!; return <span style={{ fontSize: 11, fontWeight: 800, color: a.direction === "up" ? "#DC2626" : "#16A34A", background: a.direction === "up" ? "rgba(220,38,38,0.10)" : "rgba(22,163,74,0.10)", border: `1px solid ${a.direction === "up" ? "rgba(220,38,38,0.30)" : "rgba(22,163,74,0.30)"}`, borderRadius: 8, padding: "1px 6px" }}>{a.direction === "up" ? "↑" : "↓"} {(Math.abs(a.change_pct) * 100).toFixed(0)} %</span>; })()}
                              </div>
                              {/* Ligne 2 : Fournisseur · Prix */}
                              <div className="flex justify-between items-baseline mt-2">
                                <div className="muted text-[12px]">
                                  {supplierName && supplierIdForDisplay ? (
                                    <Link href={`/fournisseurs/${supplierIdForDisplay}`} style={{ color: "inherit", textDecoration: "underline dotted", textUnderlineOffset: 2 }}>
                                      {supplierName}
                                    </Link>
                                  ) : x.category}
                                  {x.status_note ? ` • ${x.status_note}` : ""}
                                </div>
                                <div className="text-[17px]" style={{ fontWeight: 950 }}>{price}</div>
                              </div>
                              {/* Allergènes */}
                              {(() => { const alg = parseAllergens(x.allergens); return alg.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {alg.map(a => (
                                    <span key={a} title={a} style={{ fontSize: 9, fontWeight: 800, padding: "1px 4px", borderRadius: 4, background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.18)" }}>
                                      {ALLERGEN_SHORT[a as keyof typeof ALLERGEN_SHORT] ?? a}
                                    </span>
                                  ))}
                                </div>
                              ); })()}
                              {/* Prix manquant */}
                              {!hasPrice && <div className="mt-1"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-red-600/10 text-red-600 border border-red-600/25">prix manquant</span></div>}
                              {/* Ligne 3 : Actions */}
                              <div className="flex gap-2 mt-2">
                                {st !== "validated" && <button className="btn flex-1" disabled={!canValidate} onClick={() => { if (!canValidate) return; setIngredientStatus(x.id, "validated"); }} title={!canValidate ? "Ajoute un prix avant de valider." : ""}>Valider</button>}
                                {!isEditing
                                  ? <button className="btn btnPrimary flex-1" onClick={() => startEdit(x)}>Modifier</button>
                                  : <button className="btn btnPrimary flex-1" onClick={saveEdit}>OK</button>}
                                <button className="btn btnDanger" onClick={() => del(x.id, x.name)}>✕</button>
                              </div>
                            </>
                          )}
                        </div>

                        {isEditing && edit && (
                          <div className="mt-3 pt-3 border-t border-gray-200 grid gap-2.5">
                            <div className="grid gap-2.5" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
                              <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                              <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as Category })}>
                                {CATEGORIES.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                              <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={edit.supplierId} onChange={(e) => setEdit({ ...edit, supplierId: e.target.value })}>
                                <option value="">—</option>
                                {suppliers.filter((s) => s.is_active).map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5 items-center">
                              <div className="flex items-center gap-2.5">
                                <span className="font-extrabold">Offre fournisseur</span>
                                <label className="flex items-center gap-2">
                                  <input type="checkbox" checked={edit.useOffer} onChange={(e) => setEdit({ ...edit, useOffer: e.target.checked })} />
                                  <span className="muted">recommandé</span>
                                </label>
                              </div>
                              <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={edit.is_active ? "1" : "0"} onChange={(e) => setEdit({ ...edit, is_active: e.target.value === "1" })}>
                                <option value="1">Actif</option>
                                <option value="0">Inactif</option>
                              </select>
                            </div>

                            {edit.useOffer && (
                              <>
                                <div>
                                  <div className="text-[12px] opacity-75 mb-1.5">Mode prix</div>
                                  <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={edit.priceKind} onChange={(e) => setEdit({ ...edit, priceKind: e.target.value as PriceKind })}>
                                    <option value="unit">Unitaire</option>
                                    <option value="pack_simple">Pack</option>
                                    <option value="pack_composed">Pack composé</option>
                                  </select>
                                </div>

                                {edit.priceKind === "unit" && (
                                  <>
                                    <div className="grid grid-cols-2 gap-2.5">
                                      <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Prix unitaire" value={edit.unitPrice} onChange={(e) => setEdit({ ...edit, unitPrice: e.target.value })} />
                                      <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value as "kg" | "l" | "pc" })}>
                                        <option value="kg">kg</option>
                                        <option value="l">L</option>
                                        <option value="pc">pc</option>
                                      </select>
                                    </div>
                                    {edit.unit === "l" && <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Densité (kg/L)" value={edit.density} onChange={(e) => setEdit({ ...edit, density: e.target.value })} />}
                                    {edit.unit === "pc" && <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Poids pièce (g)" value={edit.pieceWeightG} onChange={(e) => setEdit({ ...edit, pieceWeightG: e.target.value })} />}
                                    {edit.unit === "pc" && <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Volume pièce (ml)" value={edit.pieceVolumeMl} onChange={(e) => setEdit({ ...edit, pieceVolumeMl: e.target.value })} />}
                                    <div className="muted text-[12px]">{previewEditPack ? previewEditPack : "—"}</div>
                                  </>
                                )}

                                {edit.priceKind === "pack_simple" && (
                                  <>
                                    <div className="grid grid-cols-3 gap-2.5">
                                      <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Prix pack (€)" value={edit.packPrice} onChange={(e) => setEdit({ ...edit, packPrice: e.target.value })} />
                                      <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Quantité totale (kg/L)" value={edit.packTotalQty} onChange={(e) => setEdit({ ...edit, packTotalQty: e.target.value })} />
                                      <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={edit.packUnit} onChange={(e) => setEdit({ ...edit, packUnit: e.target.value as "kg" | "l" })}>
                                        <option value="kg">kg</option>
                                        <option value="l">L</option>
                                      </select>
                                    </div>
                                    {edit.packUnit === "l" && <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Densité (kg/L)" value={edit.density} onChange={(e) => setEdit({ ...edit, density: e.target.value })} />}
                                    <div className="muted text-[12px]">{previewEditPack ? previewEditPack : "—"}</div>
                                  </>
                                )}

                                {edit.priceKind === "pack_composed" && (
                                  <>
                                    <div className="grid grid-cols-2 gap-2.5">
                                      <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Prix pack (€)" value={edit.packPrice} onChange={(e) => setEdit({ ...edit, packPrice: e.target.value })} />
                                      <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Nombre d'unités (ex: 8)" value={edit.packCount} onChange={(e) => setEdit({ ...edit, packCount: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2.5">
                                      <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={edit.packEachUnit} onChange={(e) => setEdit({ ...edit, packEachUnit: e.target.value as "kg" | "l" | "pc" })}>
                                        <option value="l">L</option>
                                        <option value="kg">kg</option>
                                        <option value="pc">pc</option>
                                      </select>
                                      {edit.packEachUnit !== "pc" ? (
                                        <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Quantité par unité (ex: 1.5)" value={edit.packEachQty} onChange={(e) => setEdit({ ...edit, packEachQty: e.target.value })} />
                                      ) : (
                                        <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Poids pièce (g)" value={edit.packPieceWeightG} onChange={(e) => setEdit({ ...edit, packPieceWeightG: e.target.value })} />
                                      )}
                                    </div>
                                    {edit.packEachUnit === "l" && <input className="w-full h-[44px] rounded-[10px] border border-black/[.12] px-3 text-base bg-white/65 outline-none" placeholder="Densité (kg/L)" value={edit.density} onChange={(e) => setEdit({ ...edit, density: e.target.value })} />}
                                    <div className="muted text-[12px]">{previewEditPack ? previewEditPack : "—"}</div>
                                  </>
                                )}
                              </>
                            )}

                            {/* ── Allergènes ── */}
                            <div className="pt-1">
                              <div className="text-[11px] font-extrabold opacity-60 mb-2 uppercase tracking-wide">Allergènes</div>
                              <div className="flex flex-wrap gap-1.5">
                                {ALLERGENS.map(a => {
                                  const checked = edit.allergens.includes(a);
                                  return (
                                    <label key={a}
                                      title={a}
                                      style={{
                                        display: "inline-flex", alignItems: "center", gap: 4,
                                        padding: "3px 8px", borderRadius: 8, cursor: "pointer",
                                        fontSize: 11, fontWeight: 800,
                                        background: checked ? "rgba(220,38,38,0.12)" : "rgba(0,0,0,0.04)",
                                        border: `1px solid ${checked ? "rgba(220,38,38,0.35)" : "rgba(0,0,0,0.10)"}`,
                                        color: checked ? "#DC2626" : "#6B6257",
                                        transition: "all 120ms",
                                      }}>
                                      <input type="checkbox" checked={checked} style={{ margin: 0 }}
                                        onChange={() => setEdit({
                                          ...edit,
                                          allergens: checked
                                            ? edit.allergens.filter(v => v !== a)
                                            : [...edit.allergens, a],
                                        })} />
                                      {ALLERGEN_SHORT[a]}
                                    </label>
                                  );
                                })}
                              </div>
                              <div className="muted text-[10px] mt-1">
                                {edit.allergens.length === 0 ? "Aucun allergène" : edit.allergens.join(" · ")}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="muted mt-2.5 text-[12px]">
        User: {userId ? userId : "non connecté"}
      </div>
    </main>

    {/* ── Bottom sheet filtres (mobile) ── */}
    {showFilters && (
      <>
        <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setShowFilters(false)} />
        <div className="fixed bottom-0 left-0 right-0 z-[61] bg-[#FAF7F2] rounded-t-[20px] p-5 safe-bottom"
          style={{ animation: "slideUp 0.25s ease-out" }}>
          <div className="flex justify-between items-center mb-4">
            <span className="text-[17px] font-black">Filtres</span>
            <button className="btn" onClick={() => setShowFilters(false)}>✕ Fermer</button>
          </div>
          <div className="grid gap-3">
            <div>
              <div className="text-[12px] opacity-75 mb-1.5">Catégorie</div>
              <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as "all" | Category)}>
                <option value="all">Tous</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[12px] opacity-75 mb-1.5">Fournisseur</div>
              <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)}>
                <option value="all">Tous</option>
                {suppliers.filter((s) => s.is_active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[12px] opacity-75 mb-1.5">Établissement</div>
              <select className="w-full h-[44px] rounded-[10px] border border-black/[.12] pl-3 pr-[34px] text-base bg-white/65" value={filterEstablishment} onChange={(e) => setFilterEstablishment(e.target.value as "all" | "bellomio" | "piccola" | "both")}>
                <option value="all">Tous</option>
                <option value="bellomio">Bello Mio</option>
                <option value="piccola">Piccola Mia</option>
                <option value="both">Les deux</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={includeNoOffer} onChange={(e) => setIncludeNoOffer(e.target.checked)} />
                <span className="font-extrabold text-[12px]">Inclure sans offre</span>
              </label>
            </div>
          </div>
          <button className="btn btnPrimary w-full !h-[44px] mt-4" onClick={() => setShowFilters(false)}>
            Appliquer
          </button>
        </div>
      </>
    )}
    </>
  );
}

export default function IngredientsPage() {
  return (
    <Suspense fallback={<div>Chargement…</div>}>
      <IngredientsPageInner />
    </Suspense>
  );
}

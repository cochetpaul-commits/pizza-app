"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
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
  fmtLegacyPriceLine,
  fmtOfferPriceLine,
  fmtVolume,
  legacyHasPrice,
  normalizeSupplierId,
  offerHasPrice,
  parseNum,
  fmtQty,
} from "@/lib/offers";

type OfferPayload = Record<string, unknown>;

const CAT_LABELS: Record<Category, string> = {
  cremerie:    "Crémerie",
  fromage:     "Fromages",
  charcuterie: "Charcuterie",
  viande:      "Viandes",
  maree:       "Marée",
  boisson:     "Boissons",
  alcool:      "Alcools",
  epicerie:    "Épicerie",
  legume:      "Légumes",
  fruit:       "Fruits",
  herbe:       "Herbes & aromates",
  preparation: "Préparations",
  sauce:       "Sauces",
  surgele:     "Surgelés",
  recette:     "Recettes",
  emballage:   "Emballages",
  autre:       "Autre",
};

const CAT_EMOJIS: Record<Category, string> = {
  cremerie:    "🥛",
  fromage:     "🧀",
  charcuterie: "🥓",
  viande:      "🥩",
  maree:       "🐟",
  boisson:     "🫗",
  alcool:      "🍷",
  epicerie:    "🫙",
  legume:      "🥦",
  fruit:       "🍎",
  herbe:       "🌿",
  preparation: "🍳",
  sauce:       "🫒",
  surgele:     "❄️",
  recette:     "📝",
  emballage:   "📦",
  autre:       "📌",
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

export default function IngredientsPage() {
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

  const [tab, setTab] = useState<Tab>("to_check");
  const [filterCategory, setFilterCategory] = useState<"all" | Category>("all");
  const [filterSupplier, setFilterSupplier] = useState<"all" | string>("all");
  const [includeNoOffer, setIncludeNoOffer] = useState(true);

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

    if (filterSupplier !== "all") {
      base = base.filter((x) => {
        const off = offersByIngredientId.get(x.id);
        const supplierForFilter = (off?.supplier_id ?? x.supplier_id ?? null) as string | null;
        return supplierForFilter != null && supplierForFilter === filterSupplier;
      });
    }

    if (!qq) return base;
    return base.filter((x) => (x.name ?? "").toLowerCase().includes(qq));
  }, [items, q, tab, filterCategory, filterSupplier, includeNoOffer, offersByIngredientId]);

  const grouped = useMemo(() => {
    const byCategory = new Map<Category, Ingredient[]>();
    for (const cat of CATEGORIES) byCategory.set(cat, []);
    for (const x of filtered) byCategory.get(x.category)?.push(x);
    for (const arr of byCategory.values()) arr.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "fr"));
    return CATEGORIES.map((cat) => ({ cat, items: byCategory.get(cat) ?? [] })).filter((g) => g.items.length > 0);
  }, [filtered]);

  const [collapsedCats, setCollapsedCats] = useState<Set<Category>>(new Set());

  const allCollapsed = grouped.length > 0 && collapsedCats.size >= grouped.length;

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
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void load();
  }, []);

  const cardPad: CSSProperties = { padding: 16 };
  const label: CSSProperties = { fontSize: 12, opacity: 0.75, marginBottom: 6 };
  const input: CSSProperties = {
    width: "100%",
    height: 44,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.12)",
    padding: "0 12px",
    fontSize: 16,
    background: "rgba(255,255,255,0.65)",
  };
  const select: CSSProperties = { ...input, paddingRight: 34 };

  const tabsWrap: CSSProperties = {
    display: "inline-flex",
    gap: 0,
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.55)",
    overflow: "hidden",
  };

  const tabBtn = (active: boolean): CSSProperties => ({
    height: 36,
    padding: "0 12px",
    border: "none",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
    background: active ? "rgba(17,24,39,0.92)" : "transparent",
    color: active ? "white" : "rgba(17,24,39,0.8)",
  });

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("preparation");
  const [newSupplierId, setNewSupplierId] = useState<string>("");

  const [priceKind, setPriceKind] = useState<PriceKind>("unit");

  const [newUnit, setNewUnit] = useState<"kg" | "l" | "pc">("kg");
  const [newUnitPrice, setNewUnitPrice] = useState("");

  const [newDensity, setNewDensity] = useState("1.0");
  const [newPieceWeightG, setNewPieceWeightG] = useState("");

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
  } | null>(null);

  function resetCreatePriceBlocks() {
    setNewUnit("kg");
    setNewUnitPrice("");
    setNewDensity("1.0");
    setNewPieceWeightG("");

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
        if (pw != null && pw > 0) {
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
            piece_weight_g: pw,
          };
        }
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
  const line = fmtOfferPriceLine(d);
  return `${line.main} • ${line.sub}`;
}, [priceKind, newUnit, newUnitPrice, newDensity, newPieceWeightG, packPrice, packTotalQty, packCount, packEachQty, packEachUnit, packPieceWeightG]);

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
      if (p == null || p <= 0) {
        alert("Prix unitaire invalide.");
        return null;
      }

      if (newUnit === "pc") {
        const pw = parseNum(newPieceWeightG);
        if (pw == null || pw <= 0) {
          alert("Poids pièce obligatoire (g).");
          return null;
        }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "pc", unit_price: p, price: p, piece_weight_g: pw, density_kg_per_l: null, is_active: true };
      }

      if (newUnit === "l") {
        const d = parseNum(newDensity);
        if (d == null || d <= 0) {
          alert("Densité obligatoire (kg/L).");
          return null;
        }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "l", unit_price: p, price: p, density_kg_per_l: d, piece_weight_g: null, is_active: true };
      }

      return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "kg", unit_price: p, price: p, density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }

    if (priceKind === "pack_simple") {
      const pp = parseNum(packPrice);
      const qty = parseNum(packTotalQty);
      if (pp == null || pp <= 0) {
        alert("Prix du pack invalide.");
        return null;
      }
      if (qty == null || qty <= 0) {
        alert("Quantité totale du pack invalide.");
        return null;
      }

      if (newUnit === "l") {
        const d = parseNum(newDensity);
        if (d == null || d <= 0) {
          alert("Densité obligatoire (kg/L).");
          return null;
        }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true };
      }

      return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }

    if (priceKind === "pack_composed") {
      const pp = parseNum(packPrice);
      const c = parseNum(packCount);
      if (pp == null || pp <= 0) {
        alert("Prix du pack invalide.");
        return null;
      }
      if (c == null || c <= 0) {
        alert("Nombre d'unités invalide.");
        return null;
      }

      if (packEachUnit === "pc") {
        const pw = parseNum(packPieceWeightG);
        if (pw == null || pw <= 0) {
          alert("Poids pièce obligatoire (g).");
          return null;
        }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_unit: "pc", piece_weight_g: pw, density_kg_per_l: null, is_active: true };
      }

      const each = parseNum(packEachQty);
      if (each == null || each <= 0) {
        alert("Quantité par élément invalide.");
        return null;
      }

      if (packEachUnit === "l") {
        const d = parseNum(newDensity);
        if (d == null || d <= 0) {
          alert("Densité obligatoire (kg/L).");
          return null;
        }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_qty: each, pack_each_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true };
      }

      return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_qty: each, pack_each_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }

    return null;
  }

  async function addIngredient(e: React.FormEvent) {
    e.preventDefault();

    const name = newName.trim();
    if (!name) {
      alert("Nom obligatoire.");
      return;
    }

    const supplier_id = newCategory === "preparation" ? null : (normalizeSupplierId(newSupplierId) || null);

    const baseIngredient: IngredientUpsert = {
      name,
      category: newCategory,
      allergens: null,
      is_active: true,
      default_unit: "g",

      purchase_price: null,
      purchase_unit: null,
      purchase_unit_label: null,
      purchase_unit_name: newUnit,

      density_g_per_ml: 1.0,
      piece_weight_g: null,
      piece_volume_ml: null,

      supplier_id,
    };

    const ins = await supabase.from("ingredients").insert(baseIngredient).select("id").single();
    if (ins.error) {
      alert(ins.error.message);
      return;
    }

    const ingredient_id = ins.data.id as string;

    if (supplier_id && newCategory !== "preparation") {
      if (!userId) {
        alert("Utilisateur non connecté. Impossible d'enregistrer l'offre.");
        return;
      }

      const offerPayload = buildOfferFromCreate(ingredient_id, userId);
      if (!offerPayload) return;

      const dPrev = await supabase
        .from("supplier_offers")
        .update({ is_active: false })
        .eq("ingredient_id", ingredient_id)
        .eq("supplier_id", supplier_id)
        .eq("is_active", true);

      if (dPrev.error) {
        alert(dPrev.error.message);
        return;
      }

      let off = await supabase.from("supplier_offers").insert(offerPayload);

      if (off.error && (off.error as { code?: string }).code === "23505") {
        const dPrev2 = await supabase
          .from("supplier_offers")
          .update({ is_active: false })
          .eq("ingredient_id", ingredient_id)
          .eq("supplier_id", supplier_id)
          .eq("is_active", true);

        if (dPrev2.error) {
          alert(dPrev2.error.message);
          return;
        }
        off = await supabase.from("supplier_offers").insert(offerPayload);
      }

      if (off.error) {
        alert(off.error.message);
        return;
      }
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

      packTotalQty: off?.pack_total_qty != null ? String(off.pack_total_qty) : "",
      packPrice: off?.pack_price != null ? String(off.pack_price) : "",
      packUnit: (off?.pack_unit ?? "kg") as "kg" | "l",

      packCount: off?.pack_count != null ? String(off.pack_count) : "",
      packEachQty: off?.pack_each_qty != null ? String(off.pack_each_qty) : "",
      packEachUnit: (off?.pack_each_unit ?? "l") as "kg" | "l" | "pc",
      packPieceWeightG: off?.piece_weight_g != null ? String(off.piece_weight_g) : "",
    });
  }
  function buildOfferFromEdit(ingredient_id: string, uid: string): OfferPayload | null {
    if (!edit) return null;
    if (!edit.useOffer) return null;

     const supplier_id = edit.category === "preparation" ? null : (normalizeSupplierId(edit.supplierId) || null);
    if (!supplier_id) {
      alert("Fournisseur obligatoire pour l'offre.");
      return null;
    }

    if (!uid) {
      alert("Utilisateur non connecté. Impossible d'enregistrer l'offre.");
      return null;
    }

    if (edit.priceKind === "unit") {
      const p = parseNum(edit.unitPrice);
      if (p == null || p <= 0) {
        alert("Prix unitaire invalide.");
        return null;
      }

      if (edit.unit === "pc") {
        const pw = parseNum(edit.pieceWeightG);
        if (pw == null || pw <= 0) {
          alert("Poids pièce obligatoire (g).");
          return null;
        }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "pc", unit_price: p, price: p, piece_weight_g: pw, density_kg_per_l: null, is_active: true };
      }

      if (edit.unit === "l") {
        const d = parseNum(edit.density);
        if (d == null || d <= 0) {
          alert("Densité obligatoire (kg/L).");
          return null;
        }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "l", unit_price: p, price: p, density_kg_per_l: d, piece_weight_g: null, is_active: true };
      }

      return { user_id: uid, ingredient_id, supplier_id, price_kind: "unit", unit: "kg", unit_price: p, price: p, density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }

    if (edit.priceKind === "pack_simple") {
      const pp = parseNum(edit.packPrice);
      const qty = parseNum(edit.packTotalQty);
      if (pp == null || pp <= 0) {
        alert("Prix du pack invalide.");
        return null;
      }
      if (qty == null || qty <= 0) {
        alert("Quantité totale du pack invalide.");
        return null;
      }

      if (edit.packUnit === "l") {
        const d = parseNum(edit.density);
        if (d == null || d <= 0) {
          alert("Densité obligatoire (kg/L).");
          return null;
        }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "l", density_kg_per_l: d, piece_weight_g: null, is_active: true };
      }

      return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_simple", pack_price: pp, price: pp, pack_total_qty: qty, pack_unit: "kg", density_kg_per_l: null, piece_weight_g: null, is_active: true };
    }

    if (edit.priceKind === "pack_composed") {
      const pp = parseNum(edit.packPrice);
      const c = parseNum(edit.packCount);
      if (pp == null || pp <= 0) {
        alert("Prix du pack invalide.");
        return null;
      }
      if (c == null || c <= 0) {
        alert("Nombre d'unités invalide.");
        return null;
      }

      if (edit.packEachUnit === "pc") {
        const pw = parseNum(edit.packPieceWeightG);
        if (pw == null || pw <= 0) {
          alert("Poids pièce obligatoire (g).");
          return null;
        }
        return { user_id: uid, ingredient_id, supplier_id, price_kind: "pack_composed", pack_price: pp, price: pp, pack_count: c, pack_each_unit: "pc", piece_weight_g: pw, density_kg_per_l: null, is_active: true };
      }

      const each = parseNum(edit.packEachQty);
      if (each == null || each <= 0) {
        alert("Quantité par élément invalide.");
        return null;
      }

      if (edit.packEachUnit === "l") {
        const d = parseNum(edit.density);
        if (d == null || d <= 0) {
          alert("Densité obligatoire (kg/L).");
          return null;
        }
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

    const line = fmtOfferPriceLine(d);
    return `${line.main} • ${line.sub}`;
  }, [edit]);

  async function saveEdit() {
    if (!editingId || !edit) return;

    const name = edit.name.trim();
    if (!name) {
      alert("Nom obligatoire.");
      return;
    }

    const supplier_id = normalizeSupplierId(edit.supplierId);

    const up: Partial<IngredientUpsert> = {
      name,
      category: edit.category,
      is_active: edit.is_active,
      supplier_id,
    };

    const u1 = await supabase.from("ingredients").update(up).eq("id", editingId);
    if (u1.error) {
      alert(u1.error.message);
      return;
    }

    if (edit.useOffer && supplier_id) {
      if (!userId) {
        alert("Utilisateur non connecté. Impossible d'enregistrer l'offre.");
        return;
      }

      const offerPayload = buildOfferFromEdit(editingId, userId);
      if (!offerPayload) return;

      const dPrev = await supabase.from("supplier_offers").update({ is_active: false }).eq("ingredient_id", editingId).eq("supplier_id", supplier_id).eq("is_active", true);
      if (dPrev.error) {
        alert(dPrev.error.message);
        return;
      }

      let off = await supabase.from("supplier_offers").insert(offerPayload);

      if (off.error && (off.error as { code?: string }).code === "23505") {
        const dPrev2 = await supabase.from("supplier_offers").update({ is_active: false }).eq("ingredient_id", editingId).eq("supplier_id", supplier_id).eq("is_active", true);
        if (dPrev2.error) {
          alert(dPrev2.error.message);
          return;
        }
        off = await supabase.from("supplier_offers").insert(offerPayload);
      }

      if (off.error) {
        alert(off.error.message);
        return;
      }
    }

    setEditingId(null);
    setEdit(null);
    await load();
  }

  async function del(id: string, name: string) {
    if (!confirm(`Supprimer "${name}" ?`)) return;

    const d1 = await supabase.from("supplier_offers").delete().eq("ingredient_id", id);
    if (d1.error) {
      alert(d1.error.message);
      return;
    }

    const d2 = await supabase.from("ingredients").delete().eq("id", id);
    if (d2.error) {
      alert(d2.error.message);
      return;
    }

    await load();
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>Index ingrédients</div>
          <div className="muted" style={{ marginTop: 2 }}>
            Gérez vos coûts au kg, au litre, à la pièce — et par fournisseur.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => router.push("/")}>
            Accueil
          </button>
          <button className="btn" onClick={load}>
            Rafraîchir
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div role="tablist" aria-label="Filtre statut ingrédients" style={tabsWrap}>
          <button role="tab" aria-selected={tab === "to_check"} style={tabBtn(tab === "to_check")} onClick={() => setTab("to_check")}>
            À contrôler ({counts.to_check})
          </button>
          <button role="tab" aria-selected={tab === "validated"} style={tabBtn(tab === "validated")} onClick={() => setTab("validated")}>
            Validés ({counts.validated})
          </button>
          <button role="tab" aria-selected={tab === "unknown"} style={tabBtn(tab === "unknown")} onClick={() => setTab("unknown")}>
            Incompris ({counts.unknown})
          </button>
          <button role="tab" aria-selected={tab === "all"} style={tabBtn(tab === "all")} onClick={() => setTab("all")}>
            Tous ({counts.all})
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <div style={label}>Filtre catégorie</div>
            <select
  style={select}
  value={filterCategory}
  onChange={(e) => setFilterCategory((e.target.value as "all" | Category))}
>
              <option value="all">Tous</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={label}>Filtre fournisseur</div>
            <select style={select} value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)}>
              <option value="all">Tous</option>
              {suppliers
                .filter((s) => s.is_active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, height: 44 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={includeNoOffer} onChange={(e) => setIncludeNoOffer(e.target.checked)} />
              <span style={{ fontWeight: 800 }}>Inclure sans offre</span>
            </label>
            <span className="muted" style={{ fontSize: 12 }}>
              (sinon: uniquement ceux avec une offre)
            </span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Créer un ingrédient</div>

        <form onSubmit={addIngredient} style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div>
              <div style={label}>Ingrédient</div>
              <input style={input} placeholder="Ex: Huile d'olive" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <div style={label}>Catégorie</div>
              <select
  style={select}
  value={newCategory}
  onChange={(e) => {
    const next = e.target.value as Category;
    setNewCategory(next);
    if (next === "preparation") {
      setNewSupplierId("");
      setPriceKind("unit");
      resetCreatePriceBlocks();
    }
  }}
>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {newCategory !== "preparation" ? (
  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
    <div>
      <div style={label}>Fournisseur</div>
      <select style={select} value={newSupplierId} onChange={(e) => setNewSupplierId(e.target.value)}>
        <option value="">—</option>
        {suppliers
          .filter((s) => s.is_active)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
    </div>

    <div style={{ alignSelf: "end" }}>
      <button className="btn btnPrimary" type="submit" style={{ height: 44, width: "100%" }}>
        Ajouter
      </button>
    </div>
  </div>
) : (
  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
    <div style={{ alignSelf: "end" }}>
      <button className="btn btnPrimary" type="submit" style={{ height: 44, width: "100%" }}>
        Ajouter
      </button>
    </div>
  </div>
)}

{newCategory !== "preparation" ? (
  <>
    <div>
      <div style={label}>Offre fournisseur</div>
      <select style={select} value={priceKind} onChange={(e) => setPriceKind(e.target.value as PriceKind)}>
        <option value="unit">Unitaire (€/kg, €/L, €/pc)</option>
        <option value="pack_simple">Pack simple (sac/caisse)</option>
        <option value="pack_composed">Pack composé (ex: 8 × 1.5 L)</option>
      </select>
    </div>

    {priceKind === "unit" && (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <div style={label}>Unité</div>
            <select style={select} value={newUnit} onChange={(e) => setNewUnit(e.target.value as "kg" | "l" | "pc")}>
              <option value="kg">Kilo (kg)</option>
              <option value="l">Litre (L)</option>
              <option value="pc">Pièce (pc)</option>
            </select>
          </div>

          <div>
            <div style={label}>Prix</div>
            <input
              style={input}
              placeholder={newUnit === "pc" ? "Ex: 1.79" : newUnit === "l" ? "Ex: 2.07" : "Ex: 12.50"}
              inputMode="decimal"
              value={newUnitPrice}
              onChange={(e) => setNewUnitPrice(e.target.value)}
            />
          </div>
        </div>

        {newUnit === "l" && (
          <div>
            <div style={label}>Densité (kg/L)</div>
            <input style={input} value={newDensity} onChange={(e) => setNewDensity(e.target.value)} />
          </div>
        )}

        {newUnit === "pc" && (
          <div>
            <div style={label}>Poids d&apos;une pièce (g)</div>
            <input style={input} placeholder="Ex: 125" inputMode="decimal" value={newPieceWeightG} onChange={(e) => setNewPieceWeightG(e.target.value)} />
          </div>
        )}
      </>
    )}

    {priceKind === "pack_simple" && (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <div style={label}>Unité pack</div>
            <select style={select} value={newUnit} onChange={(e) => setNewUnit(e.target.value as "kg" | "l" | "pc")}>
              <option value="kg">Kilo (kg)</option>
              <option value="l">Litre (L)</option>
            </select>
          </div>

          <div>
            <div style={label}>Prix du pack (€)</div>
            <input style={input} placeholder="Ex: 53.99" inputMode="decimal" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <div style={label}>Quantité totale du pack ({newUnit === "kg" ? "kg" : "L"})</div>
            <input
              style={input}
              placeholder={newUnit === "kg" ? "Ex: 25" : "Ex: 12"}
              inputMode="decimal"
              value={packTotalQty}
              onChange={(e) => setPackTotalQty(e.target.value)}
            />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {previewCreatePack ? previewCreatePack : "—"}
          </div>
        </div>

        {newUnit === "l" && (
          <div>
            <div style={label}>Densité (kg/L)</div>
            <input style={input} value={newDensity} onChange={(e) => setNewDensity(e.target.value)} />
          </div>
        )}
      </>
    )}

    {priceKind === "pack_composed" && (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <div style={label}>Prix du pack (€)</div>
            <input style={input} placeholder="Ex: 18.56" inputMode="decimal" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} />
          </div>

          <div>
            <div style={label}>Nombre d&apos;unités</div>
            <input style={input} placeholder="Ex: 8" inputMode="decimal" value={packCount} onChange={(e) => setPackCount(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <div style={label}>Unité de chaque élément</div>
            <select style={select} value={packEachUnit} onChange={(e) => setPackEachUnit(e.target.value as "kg" | "l" | "pc")}>
              <option value="l">Litre (L)</option>
              <option value="kg">Kilo (kg)</option>
              <option value="pc">Pièce (pc)</option>
            </select>
          </div>

          {packEachUnit !== "pc" ? (
            <div>
              <div style={label}>Quantité par élément ({packEachUnit === "kg" ? "kg" : "L"})</div>
              <input
                style={input}
                placeholder={packEachUnit === "kg" ? "Ex: 1" : "Ex: 1.5"}
                inputMode="decimal"
                value={packEachQty}
                onChange={(e) => setPackEachQty(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <div style={label}>Poids d&apos;une pièce (g)</div>
              <input style={input} placeholder="Ex: 125" inputMode="decimal" value={packPieceWeightG} onChange={(e) => setPackPieceWeightG(e.target.value)} />
            </div>
          )}
        </div>

        {(packEachUnit === "l") && (
          <div>
            <div style={label}>Densité (kg/L)</div>
            <input style={input} value={newDensity} onChange={(e) => setNewDensity(e.target.value)} />
          </div>
        )}
      </>
    )}
  </>
) : null}

        </form>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <input style={{ ...input, flex: 1 }} placeholder="Rechercher..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button
          className="btn"
          onClick={toggleAll}
          style={{ whiteSpace: "nowrap", height: 44, padding: "0 14px" }}
        >
          {allCollapsed ? "Tout déplier" : "Tout replier"}
        </button>
      </div>

      {loading ? <div className="muted" style={{ marginTop: 12 }}>Chargement…</div> : null}

      {grouped.map(({ cat, items: catItems }) => {
        const isCollapsed = collapsedCats.has(cat);
        return (
          <div key={cat} style={{ marginTop: 14 }}>
            <button
              onClick={() => toggleCat(cat)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 14px",
                background: "rgba(0,0,0,0.04)",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 10,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <span style={{ fontSize: 18 }}>{CAT_EMOJIS[cat]}</span>
              <span style={{ fontWeight: 800, color: CAT_COLORS[cat], fontSize: 14 }}>{CAT_LABELS[cat]}</span>
              <span style={{ color: "#999", fontSize: 13 }}>({catItems.length})</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>{isCollapsed ? "▶" : "▼"}</span>
            </button>

            {!isCollapsed && (
              <div className="card" style={{ ...cardPad, marginTop: 6 }}>
                <div style={{ display: "grid", gap: 10 }}>
                  {catItems.map((x) => {
            const isEditing = editingId === x.id;
            const offer = offersByIngredientId.get(x.id);

            const price = offer ? fmtOfferPriceLine(offer, { piece_volume_ml: x.piece_volume_ml }) : fmtLegacyPriceLine(x);

            const supplierIdForDisplay = offer?.supplier_id ?? x.supplier_id;
            const supplierName = supplierIdForDisplay ? suppliersMap.get(supplierIdForDisplay)?.name : null;

            const st = (x.status ?? "to_check") as IngredientStatus;

            return (
              <div key={x.id} style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 900, color: CAT_COLORS[x.category] }}>{x.name}</div>
                      <span style={statusBadgeStyle(st)}>{statusLabel(st)}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {supplierName ? `Fournisseur: ${supplierName}` : x.category}
                      {x.source_prep_recipe_name ? ` • Pivot: ${x.source_prep_recipe_name}` : ""}
                      {offer ? " • offre" : ""}
                      {x.status_note ? ` • note: ${x.status_note}` : ""}
                    </div>

                    {(() => {
                      const hasPrice = offerHasPrice(offer) || legacyHasPrice(x);
                      const canValidate = hasPrice;

                      return (
                        <>
                          {!hasPrice ? (
                            <div style={{ marginTop: 6 }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 800,
                                  background: "rgba(220,38,38,0.10)",
                                  color: "#DC2626",
                                  border: "1px solid rgba(220,38,38,0.25)",
                                }}
                              >
                                prix manquant
                              </span>
                            </div>
                          ) : null}

                          {st !== "validated" ? (
                            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                              <button className="btn" onClick={() => setIngredientStatus(x.id, "to_check")}>
                                À contrôler
                              </button>

                              <button
                                className="btn"
                                disabled={!canValidate}
                                onClick={() => {
                                  if (!canValidate) return;
                                  setIngredientStatus(x.id, "validated");
                                }}
                                style={!canValidate ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                                title={!canValidate ? "Ajoute un prix (offre fournisseur ou legacy) avant de valider." : ""}
                              >
                                Valider
                              </button>

                              <button className="btn" onClick={() => setIngredientStatus(x.id, "unknown")}>
                                Incompris
                              </button>
                            </div>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>

                  <div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Densité / Poids / Vol.</div>
                    <div style={{ fontWeight: 600 }}>
                      {offer?.density_kg_per_l != null
                        ? `${fmtQty(offer.density_kg_per_l)} kg/L`
                        : offer?.piece_weight_g != null
                        ? `${fmtQty(offer.piece_weight_g)} g/pc`
                        : x.piece_volume_ml != null
                        ? fmtVolume(x.piece_volume_ml) + "/pc"
                        : x.purchase_unit_name === "l"
                        ? `${x.density_g_per_ml ?? 1} kg/L`
                        : x.piece_weight_g
                        ? `${x.piece_weight_g} g/pc`
                        : "—"}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 950, fontSize: 18 }}>{price.main}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {price.sub}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    {!isEditing ? (
                      <button className="btn btnPrimary" onClick={() => startEdit(x)}>
                        Modifier
                      </button>
                    ) : (
                      <button className="btn btnPrimary" onClick={saveEdit}>
                        OK
                      </button>
                    )}
                    <button className="btn btnDanger" onClick={() => del(x.id, x.name)}>
                      X
                    </button>
                  </div>
                </div>

                {isEditing && edit && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee", display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                      <input style={input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                                            <select style={select} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as Category })}>
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>

                      <select style={select} value={edit.supplierId} onChange={(e) => setEdit({ ...edit, supplierId: e.target.value })}>
                        <option value="">—</option>
                        {suppliers
                          .filter((s) => s.is_active)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 800 }}>Offre fournisseur</span>
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="checkbox" checked={edit.useOffer} onChange={(e) => setEdit({ ...edit, useOffer: e.target.checked })} />
                          <span className="muted">recommandé</span>
                        </label>
                      </div>

                      <select style={select} value={edit.is_active ? "1" : "0"} onChange={(e) => setEdit({ ...edit, is_active: e.target.value === "1" })}>
                        <option value="1">Actif</option>
                        <option value="0">Inactif</option>
                      </select>
                    </div>

                    {edit.useOffer && (
                      <>
                        <div>
                          <div style={label}>Mode prix</div>
                          <select style={select} value={edit.priceKind} onChange={(e) => setEdit({ ...edit, priceKind: e.target.value as PriceKind })}>
                            <option value="unit">Unitaire</option>
                            <option value="pack_simple">Pack</option>
                            <option value="pack_composed">Pack composé</option>
                          </select>
                        </div>

                        {edit.priceKind === "unit" && (
                          <>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                              <input style={input} placeholder="Prix unitaire" value={edit.unitPrice} onChange={(e) => setEdit({ ...edit, unitPrice: e.target.value })} />
                             <select style={select} value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value as "kg" | "l" | "pc" })}>
                                <option value="kg">kg</option>
                                <option value="l">L</option>
                                <option value="pc">pc</option>
                              </select>
                            </div>

                            {edit.unit === "l" && <input style={input} placeholder="Densité (kg/L)" value={edit.density} onChange={(e) => setEdit({ ...edit, density: e.target.value })} />}

                            {edit.unit === "pc" && <input style={input} placeholder="Poids pièce (g)" value={edit.pieceWeightG} onChange={(e) => setEdit({ ...edit, pieceWeightG: e.target.value })} />}

                            <div className="muted" style={{ fontSize: 12 }}>
                              {previewEditPack ? previewEditPack : "—"}
                            </div>
                          </>
                        )}

                        {edit.priceKind === "pack_simple" && (
                          <>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                              <input style={input} placeholder="Prix pack (€)" value={edit.packPrice} onChange={(e) => setEdit({ ...edit, packPrice: e.target.value })} />
                              <input style={input} placeholder="Quantité totale (kg/L)" value={edit.packTotalQty} onChange={(e) => setEdit({ ...edit, packTotalQty: e.target.value })} />
                             <select style={select} value={edit.packUnit} onChange={(e) => setEdit({ ...edit, packUnit: e.target.value as "kg" | "l" })}>
                                <option value="kg">kg</option>
                                <option value="l">L</option>
                              </select>
                            </div>

                            {edit.packUnit === "l" && <input style={input} placeholder="Densité (kg/L)" value={edit.density} onChange={(e) => setEdit({ ...edit, density: e.target.value })} />}

                            <div className="muted" style={{ fontSize: 12 }}>
                              {previewEditPack ? previewEditPack : "—"}
                            </div>
                          </>
                        )}

                        {edit.priceKind === "pack_composed" && (
                          <>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                              <input style={input} placeholder="Prix pack (€)" value={edit.packPrice} onChange={(e) => setEdit({ ...edit, packPrice: e.target.value })} />
                              <input style={input} placeholder="Nombre d'unités (ex: 8)" value={edit.packCount} onChange={(e) => setEdit({ ...edit, packCount: e.target.value })} />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                             <select style={select} value={edit.packEachUnit} onChange={(e) => setEdit({ ...edit, packEachUnit: e.target.value as "kg" | "l" | "pc" })}>
                                <option value="l">L</option>
                                <option value="kg">kg</option>
                                <option value="pc">pc</option>
                              </select>

                              {edit.packEachUnit !== "pc" ? (
                                <input style={input} placeholder="Quantité par unité (ex: 1.5)" value={edit.packEachQty} onChange={(e) => setEdit({ ...edit, packEachQty: e.target.value })} />
                              ) : (
                                <input style={input} placeholder="Poids pièce (g)" value={edit.packPieceWeightG} onChange={(e) => setEdit({ ...edit, packPieceWeightG: e.target.value })} />
                              )}
                            </div>

                            {edit.packEachUnit === "l" && <input style={input} placeholder="Densité (kg/L)" value={edit.density} onChange={(e) => setEdit({ ...edit, density: e.target.value })} />}

                            <div className="muted" style={{ fontSize: 12 }}>
                              {previewEditPack ? previewEditPack : "—"}
                            </div>
                          </>
                        )}
                      </>
                    )}
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

      <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        User: {userId ? userId : "non connecté"}
      </div>
    </main>
  );
}

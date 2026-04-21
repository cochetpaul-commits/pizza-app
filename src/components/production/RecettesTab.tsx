"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import ProductionModal from "@/components/ProductionModal";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { useBottomBarActions, BottomBarButton } from "@/lib/BottomBarContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type PizzaRow = {
  id: string; name: string | null; photo_url: string | null;
  total_cost: number | null;
  margin_rate: number | null; vat_rate: number | null;
  sell_price: number | null;
  establishments: string[] | null;
  pivot_ingredient_id: string | null;
};
type KitchenRow = {
  id: string; name: string | null; category: string | null; photo_url: string | null;
  total_cost: number | null; cost_per_kg: number | null;
  cost_per_portion: number | null;
  margin_rate: number | null; vat_rate: number | null;
  sell_price: number | null;
  establishments: string[] | null;
  pivot_ingredient_id: string | null;
};
type CocktailRow = {
  id: string; name: string | null; type: string | null; image_url: string | null;
  total_cost: number | null; sell_price: number | null;
  establishments: string[] | null;
  pivot_ingredient_id: string | null;
};
type EmpRow = {
  id: string; name: string; type: string; created_at: string;
  pivot_ingredient_id: string | null;
};

type MainTab = "tous" | "pizza" | "cuisine" | "cocktail" | "empatement" | "bar";
type SortKey = "name" | "cost" | "fc" | "price";
type SortDir = "asc" | "desc";
// "all" or any category id (built-in or custom-discovered)
type CuisineCatFilter = string;
type FoodCostFilter = "all" | "bon" | "attention" | "alerte";

// ─── Constants ────────────────────────────────────────────────────────────────

const PIZZA_COLOR    = "#8B1A1A";
const CUISINE_COLOR  = "#4a6741";
const COCKTAIL_COLOR = "#D4775A";
const EMP_COLOR      = "#8a7b6b";

const CUISINE_CATS = [
  { id: "preparation",    label: "Préparation" },
  { id: "sauce",          label: "Sauce" },
  { id: "entree",         label: "Entrée" },
  { id: "plat_cuisine",   label: "Plat cuisiné" },
  { id: "accompagnement", label: "Accompagnement" },
  { id: "dessert",        label: "Dessert" },
  { id: "autre",          label: "Autre" },
];

const CUISINE_CAT_COLORS: Record<string, string> = {
  all: CUISINE_COLOR, plat_cuisine: "#B45309", preparation: "#7C3AED",
  entree: "#0284C7", sauce: "#DC2626", dessert: "#D4775A",
  accompagnement: "#16A34A", autre: "#6B7280",
};

const FOOD_COST_FILTERS: { id: FoodCostFilter; label: string }[] = [
  { id: "all",       label: "Tous" },
  { id: "bon",       label: "≤28%" },
  { id: "attention", label: "≤32%" },
  { id: "alerte",    label: ">32%" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function matchesSearch(name: string | null, q: string): boolean {
  if (!q) return true;
  return (name ?? "").toLowerCase().includes(q.toLowerCase());
}

function normRate(r: number | null): number {
  if (r == null) return 0;
  return r >= 1 ? r / 100 : r;
}

function pvTTCPizza(r: PizzaRow): number | null {
  const cost = r.total_cost;
  if (!cost || cost <= 0) return null;
  const m = normRate(r.margin_rate);
  const v = normRate(r.vat_rate);
  if (m <= 0 || m >= 1) return null;
  return cost / (1 - m) * (1 + v);
}

function pvTTCKitchen(r: KitchenRow): number | null {
  const cost = r.cost_per_portion ?? r.cost_per_kg;
  if (!cost || cost <= 0) return null;
  const mr = r.margin_rate ?? 0;
  const m = mr >= 1 ? mr / 100 : mr;
  const vr = r.vat_rate ?? 0.1;
  const v = vr >= 1 ? vr / 100 : vr;
  if (m <= 0 || m >= 1) return null;
  return cost / (1 - m) * (1 + v);
}

function computeFoodCost(cost: number | null, sellPrice: number | null, pvConseille?: number | null): number | null {
  const price = (sellPrice != null && sellPrice > 0) ? sellPrice : (pvConseille != null && pvConseille > 0 ? pvConseille : null);
  if (!cost || cost <= 0 || !price || price <= 0) return null;
  return (cost / price) * 100;
}

function foodCostColor(fc: number): string {
  if (fc <= 28) return "#4a6741";
  if (fc <= 32) return "#d97706";
  return "#8B1A1A";
}

function foodCostBg(fc: number): string {
  if (fc <= 28) return "rgba(74,103,65,0.12)";
  if (fc <= 32) return "rgba(217,119,6,0.12)";
  return "rgba(139,26,26,0.12)";
}

function doSort<T>(arr: T[], sk: SortKey, sd: SortDir, getCost: (r: T) => number | null, getFc: (r: T) => number | null, getPrice: (r: T) => number | null, getName: (r: T) => string): T[] {
  return [...arr].sort((a, b) => {
    let va: number, vb: number;
    if (sk === "name") {
      const res = getName(a).localeCompare(getName(b), "fr");
      return sd === "asc" ? res : -res;
    }
    if (sk === "cost") { va = getCost(a) ?? Infinity; vb = getCost(b) ?? Infinity; }
    else if (sk === "fc") { va = getFc(a) ?? Infinity; vb = getFc(b) ?? Infinity; }
    else { va = getPrice(a) ?? Infinity; vb = getPrice(b) ?? Infinity; }
    return sd === "asc" ? va - vb : vb - va;
  });
}

function matchesFoodCostFilter(fc: number | null, filter: FoodCostFilter): boolean {
  if (filter === "all") return true;
  if (fc == null) return false;
  if (filter === "bon") return fc <= 28;
  if (filter === "attention") return fc > 28 && fc <= 32;
  return fc > 32;
}

// ─── UI Components ────────────────────────────────────────────────────────────

function Thumb({ src, name, color }: { src: string | null; name: string; color: string }) {
  if (src) {
    return (
      <div style={{
        width: 52, height: 52, borderRadius: 12, overflow: "hidden", flexShrink: 0,
        background: "#f2ede4", border: `1px solid ${color}20`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}>
        <Image src={src} alt={name} width={52} height={52} style={{ objectFit: "cover", width: 52, height: 52 }} />
      </div>
    );
  }
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 52, height: 52, borderRadius: 12, flexShrink: 0,
      background: `linear-gradient(135deg, ${color}22 0%, ${color}0D 100%)`,
      border: `1px solid ${color}20`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 15, fontWeight: 800, color, letterSpacing: 1,
      fontFamily: "var(--font-oswald), Oswald, sans-serif",
    }}>
      {initials}
    </div>
  );
}

function FoodCostBadge({ fc }: { fc: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 6,
      fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
      color: foodCostColor(fc),
      background: foodCostBg(fc),
    }}>
      {fc.toFixed(1)}%
    </span>
  );
}

function RecipeCard({
  name, href, color, onProd, photoUrl, subtitle, subtitleColor,
  cost, costLabel, pv, pvConseille, pvLabel,
}: {
  name: string; href: string; color: string;
  onProd?: () => void; photoUrl?: string | null; subtitle?: string; subtitleColor?: string;
  cost?: number | null; costLabel?: string;
  pv?: number | null; pvConseille?: number | null; pvLabel?: string;
}) {
  const router = useRouter();
  const effectivePrice = (pv != null && pv > 0) ? pv : (pvConseille != null && pvConseille > 0 ? pvConseille : null);
  const isConseille = (pv == null || pv <= 0) && effectivePrice != null;
  const fc = computeFoodCost(cost ?? null, pv ?? null, pvConseille);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={ev => ev.key === "Enter" && router.push(href)}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 16px 14px 19px", borderRadius: 16,
        background: "#fff",
        border: "1px solid #ede6d9",
        cursor: "pointer", transition: "all 0.18s",
        boxShadow: `inset 3px 0 0 ${color}, 0 1px 2px rgba(0,0,0,0.03)`,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}60`; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `inset 3px 0 0 ${color}, 0 6px 16px ${color}22`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#ede6d9"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = `inset 3px 0 0 ${color}, 0 1px 2px rgba(0,0,0,0.03)`; }}
    >
      {/* Photo */}
      <Thumb src={photoUrl ?? null} name={name} color={color} />

      {/* Name + subtitle + cost */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontWeight: 700, fontSize: 14,
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            textTransform: "uppercase", letterSpacing: "0.04em", color: "#1a1a1a",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
          }}>
            {name}
          </span>
          {fc != null && <FoodCostBadge fc={fc} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          {subtitle && (
            <span style={{ fontSize: 11, color: subtitleColor ?? "#999", fontWeight: 600 }}>{subtitle}</span>
          )}
          {cost != null && cost > 0 && (
            <span style={{ fontSize: 11, color: "#999" }}>
              {subtitle ? "· " : ""}{fmt(cost)}{" €"}{costLabel ?? ""}
            </span>
          )}
        </div>
      </div>

      {/* Right: price + production */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        {effectivePrice != null && (
          <div style={{
            fontSize: 16, fontWeight: isConseille ? 500 : 800,
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            fontStyle: isConseille ? "italic" : "normal",
            color: isConseille ? "#b0a89e" : "#1a1a1a",
            whiteSpace: "nowrap",
          }}>
            {fmt(effectivePrice)}{" €"}
            {pvLabel && <span style={{ fontSize: 9, fontWeight: 500, color: "#999", marginLeft: 2 }}>{pvLabel}</span>}
            {isConseille && <span style={{ fontSize: 9, fontWeight: 500, color: "#b0a89e", marginLeft: 2 }}>(c)</span>}
          </div>
        )}
        {onProd && (
          <button
            type="button"
            onClick={ev => { ev.stopPropagation(); onProd(); }}
            style={{
              padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
              border: "1.5px solid #4a6741",
              background: "rgba(74,103,65,0.08)", color: "#4a6741",
              cursor: "pointer", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.5,
            }}
          >
            Production
          </button>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  title, color, count,
}: {
  title: string; color: string; count: number;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "14px 0 10px", marginBottom: 8,
      borderBottom: `2px solid ${color}`,
    }}>
      <div style={{
        width: 4, height: 22, borderRadius: 2, background: color, flexShrink: 0,
      }} />
      <span style={{
        fontSize: 15, fontWeight: 700, color,
        textTransform: "uppercase", letterSpacing: 2,
        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
        flex: 1,
      }}>
        {title}
        <span style={{ fontWeight: 500, fontSize: 12, marginLeft: 8, color: "#999", letterSpacing: 0 }}>{count} fiche{count > 1 ? "s" : ""}</span>
      </span>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const filterPill = (active: boolean, activeColor?: string): React.CSSProperties => ({
  padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
  border: "1.5px solid",
  borderColor: active ? (activeColor ?? "#D4775A") : "#ddd6c8",
  background: active ? (activeColor ?? "#D4775A") + "14" : "transparent",
  color: active ? (activeColor ?? "#D4775A") : "#999",
  cursor: "pointer",
});


// ─── Main inner component ─────────────────────────────────────────────────────

function RecettesInner() {
  const router = useRouter();
  const { can } = useProfile();
  const canWrite = can("operations.edit_recettes");
  const { current: etabCtx } = useEtablissement();
  const [authOk, setAuthOk] = useState<boolean | null>(null);
  const [pizzas,    setPizzas]    = useState<PizzaRow[]>([]);
  const [kitchens,  setKitchens]  = useState<KitchenRow[]>([]);
  const [cocktails, setCocktails] = useState<CocktailRow[]>([]);
  const [emps,      setEmps]      = useState<EmpRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [q, setQ]         = useState("");
  const [mainTab, setMainTab] = useState<MainTab>("tous");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [cuisineCatFilter, setCuisineCatFilter] = useState<CuisineCatFilter>("all");
  const [foodCostFilter, setFoodCostFilter] = useState<FoodCostFilter>("all");
  const [prodFilter, setProdFilter] = useState(false);
  const [prodModal, setProdModal] = useState<{ type: "pizza" | "cuisine" | "cocktail" | "empatement"; id: string; name: string; pivotId: string } | null>(null);
  const [showFab, setShowFab] = useState(false);
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [newSheetStep, setNewSheetStep] = useState<"category" | "sub">("category");
  const [newSheetCat, setNewSheetCat] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (cancelled) return;
      if (!sessionData.session) { setAuthOk(false); setLoading(false); return; }
      setAuthOk(true);
      const pq = supabase.from("pizza_recipes")
        .select("id,name,photo_url,total_cost,margin_rate,vat_rate,sell_price,establishments,pivot_ingredient_id")
        .eq("is_draft", false);
      const kq = supabase.from("kitchen_recipes")
        .select("id,name,photo_url,category,total_cost,cost_per_kg,cost_per_portion,margin_rate,vat_rate,sell_price,establishments,pivot_ingredient_id")
        .eq("is_draft", false);
      const cq = supabase.from("cocktails")
        .select("id,name,image_url,type,total_cost,sell_price,establishments,pivot_ingredient_id")
        .eq("is_draft", false);
      const eq = supabase.from("recipes")
        .select("id,name,type,created_at,pivot_ingredient_id")
        .order("created_at", { ascending: false });

      if (etabCtx) {
        pq.contains("establishments", [etabCtx.slug]);
        kq.contains("establishments", [etabCtx.slug]);
        cq.contains("establishments", [etabCtx.slug]);
      }

      Promise.all([pq, kq, cq, eq]).then(([p, k, c, e]) => {
        if (cancelled) return;
        const errs: string[] = [];
        if (p.error) errs.push(`Pizza : ${p.error.message}`);
        if (k.error) errs.push(`Cuisine : ${k.error.message}`);
        if (c.error) errs.push(`Cocktail : ${c.error.message}`);
        if (e.error) errs.push(`Empatement : ${e.error.message}`);
        setLoadErrors(errs);
        setPizzas((p.data ?? []) as PizzaRow[]);
        setKitchens((k.data ?? []) as KitchenRow[]);
        setCocktails((c.data ?? []) as CocktailRow[]);
        setEmps((e.data ?? []) as EmpRow[]);
        setLoading(false);
      });
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etabCtx?.id]);

  // ── Category helpers ──
  const KNOWN_CAT_IDS = useMemo(() => new Set(CUISINE_CATS.map(c => c.id)), []);

  const handleDeleteCategory = useCallback(async (catId: string, label: string) => {
    if (KNOWN_CAT_IDS.has(catId)) {
      alert(`La catégorie "${label}" est une catégorie de base et ne peut pas être supprimée.`);
      return;
    }
    const count = kitchens.filter(k => k.category === catId).length;
    const msg = count > 0
      ? `Supprimer la catégorie "${label}" ?\n\n${count} recette${count > 1 ? "s" : ""} ser${count > 1 ? "ont" : "a"} déplacée${count > 1 ? "s" : ""} vers "Autre".`
      : `Supprimer la catégorie "${label}" ?`;
    if (!window.confirm(msg)) return;
    if (count > 0) {
      const { error } = await supabase
        .from("kitchen_recipes")
        .update({ category: "autre" })
        .eq("category", catId);
      if (error) {
        alert(`Erreur : ${error.message}`);
        return;
      }
      setKitchens(prev => prev.map(k => k.category === catId ? { ...k, category: "autre" } : k));
    }
    if (cuisineCatFilter === catId) setCuisineCatFilter("all");
  }, [kitchens, cuisineCatFilter, KNOWN_CAT_IDS]);

  const handleCreateCategory = useCallback(() => {
    const nom = newCatName.trim();
    if (!nom) return;
    const slug = nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!slug) return;
    setShowNewCatModal(false);
    setNewCatName("");
    router.push(`/recettes/new/cuisine?category=${encodeURIComponent(slug)}&categoryLabel=${encodeURIComponent(nom)}`);
  }, [newCatName, router]);

  // ── Food cost helpers ──
  const pizzaFc = (r: PizzaRow) => computeFoodCost(r.total_cost, r.sell_price, pvTTCPizza(r));
  const kitchenFc = (r: KitchenRow) => {
    const cost = r.cost_per_portion ?? r.cost_per_kg ?? null;
    return computeFoodCost(cost, r.sell_price, pvTTCKitchen(r));
  };
  const cocktailFc = (r: CocktailRow) => computeFoodCost(r.total_cost, r.sell_price, null);

  // ── Filtered + sorted data ──
  const filteredPizzas = useMemo(() => {
    const base = pizzas
      .filter(r => matchesSearch(r.name, q))
      .filter(r => matchesFoodCostFilter(pizzaFc(r), foodCostFilter))
      .filter(r => !prodFilter || r.pivot_ingredient_id != null);
    return doSort(base, sortKey, sortDir, r => r.total_cost, pizzaFc,
      r => r.sell_price ?? pvTTCPizza(r), r => r.name ?? "");
  }, [pizzas, q, sortKey, sortDir, foodCostFilter, prodFilter]);

  const filteredKitchens = useMemo(() => {
    const base = kitchens
      .filter(r => matchesSearch(r.name, q))
      .filter(r => {
        if (cuisineCatFilter !== "all") {
          const cat = r.category ?? "autre";
          if (cat !== cuisineCatFilter) return false;
        }
        return true;
      })
      .filter(r => matchesFoodCostFilter(kitchenFc(r), foodCostFilter))
      .filter(r => !prodFilter || r.pivot_ingredient_id != null);
    return doSort(base, sortKey, sortDir,
      r => r.cost_per_portion ?? r.cost_per_kg ?? null,
      kitchenFc,
      r => r.sell_price ?? pvTTCKitchen(r),
      r => r.name ?? "");
  }, [kitchens, q, sortKey, sortDir, cuisineCatFilter, foodCostFilter, prodFilter]);

  const filteredCocktails = useMemo(() => {
    const base = cocktails
      .filter(r => matchesSearch(r.name, q))
      .filter(r => matchesFoodCostFilter(cocktailFc(r), foodCostFilter))
      .filter(r => !prodFilter || r.pivot_ingredient_id != null);
    return doSort(base, sortKey, sortDir, r => r.total_cost, cocktailFc,
      r => r.sell_price, r => r.name ?? "");
  }, [cocktails, q, sortKey, sortDir, foodCostFilter, prodFilter]);

  const filteredEmps = useMemo(() =>
    emps.filter(r => matchesSearch(r.name, q))
      .filter(r => !prodFilter || r.pivot_ingredient_id != null)
      .sort((a, b) => sortDir === "asc" ? a.name.localeCompare(b.name, "fr") : b.name.localeCompare(a.name, "fr")),
    [emps, q, sortDir, prodFilter]);

  const kitchenByCat = useMemo(() => {
    const map: Record<string, KitchenRow[]> = {};
    for (const r of filteredKitchens) {
      const cat = r.category ?? "autre";
      if (!map[cat]) map[cat] = [];
      map[cat].push(r);
    }
    return map;
  }, [filteredKitchens]);

  // Dynamic list of all cuisine categories: base list + any custom category
  // actually present in the DB, sorted alphabetically by label.
  const dynamicCuisineCats = useMemo(() => {
    const byId: Record<string, { id: string; label: string }> = {};
    for (const c of CUISINE_CATS) byId[c.id] = { id: c.id, label: c.label };
    for (const r of kitchens) {
      const id = r.category;
      if (!id || byId[id]) continue;
      // Turn slug (e.g. "verre_de_vin") into a human label ("Verre de vin")
      const label = id.replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
      byId[id] = { id, label };
    }
    return Object.values(byId).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [kitchens]);

  const totalCount = filteredPizzas.length + filteredKitchens.length + filteredCocktails.length + filteredEmps.length;

  // Food cost alert counts
  const prodCount = useMemo(() => {
    return pizzas.filter(r => r.pivot_ingredient_id).length
      + kitchens.filter(r => r.pivot_ingredient_id).length
      + cocktails.filter(r => r.pivot_ingredient_id).length
      + emps.filter(r => r.pivot_ingredient_id).length;
  }, [pizzas, kitchens, cocktails, emps]);

  // Tab counts
  const tabCounts = useMemo(() => ({
    tous: filteredPizzas.length + filteredKitchens.length + filteredCocktails.length + filteredEmps.length,
    pizza: filteredPizzas.length + filteredEmps.length,
    cuisine: filteredKitchens.length,
    cocktail: filteredCocktails.length,
    bar: filteredCocktails.length,
    empatement: filteredEmps.length,
  }), [filteredPizzas, filteredKitchens, filteredCocktails, filteredEmps]);

  // Bottom bar FAB
  useBottomBarActions(() => canWrite ? (
    <BottomBarButton onClick={() => setShowNewSheet(true)} accent="#D4775A" label="Nouvelle fiche" icon={
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    } />
  ) : null, [canWrite]);

  if (authOk === null || loading) {
    return (
      <main className="container">
        <TopNav title="Fiches techniques" subtitle="Chargement..." />
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <div style={{ width: 24, height: 24, border: "3px solid #ddd6c8", borderTopColor: "#D4775A", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }
  if (!authOk) {
    return (
      <main className="container">
        <TopNav title="Fiches techniques" />
        <Link className="btn btnPrimary" href="/login">Se connecter</Link>
      </main>
    );
  }

  const showPizza = mainTab === "tous" || mainTab === "pizza" || mainTab === "empatement";
  const showCuisine = mainTab === "tous" || mainTab === "cuisine";
  const showCocktail = mainTab === "tous" || mainTab === "cocktail" || mainTab === "bar";
  const showEmp = mainTab === "tous" || mainTab === "pizza" || mainTab === "empatement";

  const hasActiveFilter = foodCostFilter !== "all" || cuisineCatFilter !== "all" || prodFilter;

  return (
    <>
      <main className="container" style={{ paddingBottom: 80 }}>
        {/* ── Erreurs ── */}
        {loadErrors.length > 0 && (
          <div style={{ marginBottom: 10, padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid rgba(139,26,26,0.2)", fontSize: 13 }}>
            <strong style={{ color: "#8B1A1A" }}>Erreurs :</strong>
            {loadErrors.map(e => <div key={e} style={{ color: "#8B1A1A", marginTop: 4 }}>{e}</div>)}
          </div>
        )}

        {/* ── Header: search bar ── */}
        <div style={{ marginBottom: 12 }}>
          <input
            type="search"
            placeholder="Rechercher une fiche..."
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 12,
              border: "1.5px solid #ddd6c8", background: "#fff",
              fontSize: 14, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* ── Category tabs (centered, scrollable) ── */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#f0ebe2", borderRadius: 12, border: "1px solid #e8e0d0", overflowX: "auto", scrollbarWidth: "none", maxWidth: "100%" }}>
            {([
              { key: "tous" as MainTab, label: "Toutes", count: tabCounts.tous, color: "#1a1a1a" },
              { key: "pizza" as MainTab, label: "Pizza", count: tabCounts.pizza, color: PIZZA_COLOR },
              { key: "cuisine" as MainTab, label: "Cuisine", count: tabCounts.cuisine, color: CUISINE_COLOR },
              { key: "bar" as MainTab, label: "Bar", count: tabCounts.bar, color: COCKTAIL_COLOR },
            ]).map(t => (
              <button key={t.key} type="button" onClick={() => { setMainTab(t.key); setCuisineCatFilter("all"); }} style={{
                padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                background: mainTab === t.key ? (etabCtx?.couleur ? etabCtx.couleur + "25" : "#fff") : "transparent",
                color: mainTab === t.key ? t.color : "#999",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
                boxShadow: mainTab === t.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s",
              }}>
                {t.label} <span style={{ fontSize: 10, opacity: 0.6 }}>({t.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Sub-category filter (shown for cuisine) ── */}
        {mainTab === "cuisine" && dynamicCuisineCats.length > 0 && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
              <button type="button" onClick={() => setCuisineCatFilter("all")} style={{
                padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                background: cuisineCatFilter === "all" ? `${CUISINE_COLOR}20` : "transparent",
                color: cuisineCatFilter === "all" ? CUISINE_COLOR : "#999",
                fontSize: 11, fontWeight: 600,
              }}>Tous</button>
              {dynamicCuisineCats.map(f => (
                <button key={f.id} type="button" onClick={() => setCuisineCatFilter(f.id)} style={{
                  padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: cuisineCatFilter === f.id ? `${(CUISINE_CAT_COLORS[f.id] ?? CUISINE_COLOR)}20` : "transparent",
                  color: cuisineCatFilter === f.id ? (CUISINE_CAT_COLORS[f.id] ?? CUISINE_COLOR) : "#999",
                  fontSize: 11, fontWeight: 600,
                }}>{f.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── Filters row ── */}
        <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#f0ebe2", borderRadius: 12, alignItems: "center", flexShrink: 0, border: "1px solid #e8e0d0", marginBottom: 10 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
          {/* Production toggle */}
          {prodCount > 0 && (
            <button type="button"
              onClick={() => { setProdFilter(p => !p); }}
              style={{
                padding: "6px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                border: "none",
                background: prodFilter ? (etabCtx?.couleur ? etabCtx.couleur + "25" : "#fff") : "transparent",
                color: prodFilter ? "#4a6741" : "#999",
                boxShadow: prodFilter ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
              }}>
              Prod. ({prodCount})
            </button>
          )}
          {/* Sort */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button type="button" onClick={() => setShowSort(s => !s)}
              style={{
                height: 30, padding: "0 10px", borderRadius: 10,
                border: "none", background: "transparent",
                fontSize: 11, fontWeight: 700, color: "#999", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 3,
                transition: "all 0.15s",
              }}>
              {sortKey === "name" ? (sortDir === "asc" ? "A-Z" : "Z-A") : sortKey === "cost" ? "Coût" : sortKey === "fc" ? "FC" : "Prix"}
              <span style={{ fontSize: 8, opacity: 0.5 }}>{"▼"}</span>
            </button>
            {showSort && (
              <>
                <div onClick={() => setShowSort(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
                <div style={{
                  position: "absolute", top: 40, right: 0, zIndex: 200,
                  background: "#fff", borderRadius: 12, padding: 6,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid #ddd6c8",
                  minWidth: 130,
                }}>
                  {([
                    { k: "name" as SortKey, d: "asc" as SortDir, label: "A → Z" },
                    { k: "name" as SortKey, d: "desc" as SortDir, label: "Z → A" },
                    { k: "cost" as SortKey, d: "asc" as SortDir, label: "Coût ↑" },
                    { k: "cost" as SortKey, d: "desc" as SortDir, label: "Coût ↓" },
                    { k: "fc" as SortKey, d: "asc" as SortDir, label: "FC ↑" },
                    { k: "fc" as SortKey, d: "desc" as SortDir, label: "FC ↓" },
                    { k: "price" as SortKey, d: "asc" as SortDir, label: "Prix ↑" },
                    { k: "price" as SortKey, d: "desc" as SortDir, label: "Prix ↓" },
                  ]).map(opt => {
                    const active = sortKey === opt.k && sortDir === opt.d;
                    return (
                      <button key={`${opt.k}-${opt.d}`} type="button"
                        onClick={() => { setSortKey(opt.k); setSortDir(opt.d); setShowSort(false); }}
                        style={{
                          width: "100%", padding: "8px 12px", borderRadius: 8,
                          border: "none", background: active ? "#D4775A14" : "transparent",
                          color: active ? "#D4775A" : "#1a1a1a", fontSize: 13, fontWeight: active ? 700 : 500,
                          cursor: "pointer", textAlign: "left",
                        }}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {/* Filters toggle */}
          <button type="button" onClick={() => setShowFilters(f => !f)}
            style={{
              width: 30, height: 30, borderRadius: 10, flexShrink: 0,
              border: "none",
              background: hasActiveFilter ? (etabCtx?.couleur ? etabCtx.couleur + "25" : "#fff") : "transparent",
              boxShadow: hasActiveFilter ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, color: hasActiveFilter ? "#D4775A" : "#999",
              transition: "all 0.15s",
            }}>
            {hasActiveFilter ? "✱" : "☰"}
          </button>
          </div>{/* end segment group */}
          {canWrite && (
            <button type="button" onClick={() => setShowNewCatModal(true)}
              className="desktop-only"
              style={{ padding: "7px 12px", borderRadius: 10, border: "1.5px solid #4a6741", background: "#fff", color: "#4a6741", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Catégorie
            </button>
          )}
          {canWrite && (
            <div className="desktop-only" style={{ position: "relative", flexShrink: 0 }}>
              <button type="button" onClick={() => setShowFab(f => !f)}
                style={{ padding: "7px 14px", borderRadius: 10, border: "none", background: "#D4775A", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(212,119,90,0.3)" }}>
                + Nouvelle recette
              </button>
              {showFab && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 200, background: "#fff", border: "1px solid #e0d8ce", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden", zIndex: 50 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.12em", padding: "10px 16px 4px" }}>Nouvelle recette</div>
                  {[
                    { label: "Pizza", href: "/recettes/new/pizza", color: "#8B1A1A" },
                    { label: "Cuisine", href: "/recettes/new/cuisine", color: "#4a6741" },
                    { label: "Cocktail", href: "/recettes/new/cocktail", color: "#D4775A" },
                    { label: "Empatement", href: "/recettes/new/empatement", color: "#888" },
                  ].map(item => (
                    <Link key={item.href} href={item.href} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", textDecoration: "none", fontSize: 14, fontWeight: 500, color: "#1a1a1a", borderBottom: "1px solid #f0ebe2" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                      {item.label}
                    </Link>
                  ))}
                  <div style={{ height: 1, background: "#e0d8ce", margin: "4px 0" }} />
                  <button type="button" onClick={() => {
                    const nom = prompt("Nom de la nouvelle categorie :");
                    if (nom && nom.trim()) {
                      const slug = nom.trim().toLowerCase().replace(/\s+/g, "_").normalize("NFD").replace(/[̀-ͯ]/g, "");
                      router.push(`/recettes/new/cuisine?category=${encodeURIComponent(slug)}&categoryLabel=${encodeURIComponent(nom.trim())}`);
                      setShowFab(false);
                    }
                  }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", width: "100%", border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: "#D4775A", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                    Nouvelle categorie
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Filter panel (collapsible) ── */}
        {showFilters && (
          <div style={{
            padding: "12px 14px", marginBottom: 12, borderRadius: 12,
            background: "#fff", border: "1.5px solid #ddd6c8",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {/* Food cost */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Food cost</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {FOOD_COST_FILTERS.map(f => (
                  <button key={f.id} type="button" onClick={() => setFoodCostFilter(f.id)}
                    style={filterPill(foodCostFilter === f.id, f.id === "bon" ? "#4a6741" : f.id === "attention" ? "#d97706" : f.id === "alerte" ? "#8B1A1A" : undefined)}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {hasActiveFilter && (
              <button type="button" onClick={() => { setFoodCostFilter("all"); setCuisineCatFilter("all"); setProdFilter(false); }}
                style={{ fontSize: 12, fontWeight: 600, color: "#D4775A", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                Effacer les filtres
              </button>
            )}
          </div>
        )}

        {totalCount === 0 && !loading && (
          <p style={{ textAlign: "center", color: "#999", padding: 40, fontSize: 14 }}>Aucune recette trouv{"é"}e.</p>
        )}

        {/* ── Pizza ── */}
        {showPizza && filteredPizzas.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Pizza" color={PIZZA_COLOR} count={filteredPizzas.length}
              />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 8 }}>
              {filteredPizzas.map(r => (
                <RecipeCard
                  key={r.id}
                  name={r.name ?? "Pizza"}
                  href={`/recettes/pizza/${r.id}`}
                  onProd={r.pivot_ingredient_id ? () => setProdModal({ type: "pizza", id: r.id, name: r.name ?? "Pizza", pivotId: r.pivot_ingredient_id! }) : undefined}
                  color={PIZZA_COLOR}
                  photoUrl={r.photo_url}
                  subtitle="Pizza"
                  subtitleColor={PIZZA_COLOR}
                  cost={r.total_cost}
                  pv={r.sell_price}
                  pvConseille={pvTTCPizza(r)}
                  pvLabel="TTC"
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Cuisine ── */}
        {showCuisine && filteredKitchens.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Cuisine" color={CUISINE_COLOR} count={filteredKitchens.length}
              />
            {dynamicCuisineCats.filter(cat => (kitchenByCat[cat.id]?.length ?? 0) > 0).map(cat => {
              const catColor = CUISINE_CAT_COLORS[cat.id] ?? CUISINE_COLOR;
              const isCustom = !KNOWN_CAT_IDS.has(cat.id);
              return (
                <div key={cat.id} style={{ marginTop: 14 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", marginBottom: 10,
                    background: `${catColor}10`,
                    border: `1px solid ${catColor}25`,
                    borderRadius: 10,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: catColor, flexShrink: 0 }} />
                    <span style={{
                      fontSize: 12, fontWeight: 800, color: catColor,
                      textTransform: "uppercase", letterSpacing: "0.1em",
                      fontFamily: "var(--font-oswald), Oswald, sans-serif",
                    }}>
                      {cat.label}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: catColor, opacity: 0.6 }}>
                      {kitchenByCat[cat.id].length}
                    </span>
                    {isCustom && canWrite && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id, cat.label)}
                        title={`Supprimer la catégorie "${cat.label}"`}
                        aria-label={`Supprimer la catégorie ${cat.label}`}
                        style={{
                          marginLeft: "auto", width: 22, height: 22, padding: 0,
                          borderRadius: 6, border: "1px solid rgba(220,38,38,0.2)",
                          background: "rgba(220,38,38,0.06)", color: "#DC2626",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#DC2626";
                          e.currentTarget.style.color = "#fff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(220,38,38,0.06)";
                          e.currentTarget.style.color = "#DC2626";
                        }}
                      >
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="6" y1="6" x2="18" y2="18" />
                          <line x1="6" y1="18" x2="18" y2="6" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 8, marginBottom: 8 }}>
                    {kitchenByCat[cat.id].map(r => {
                      const isPrep = cat.id === "preparation" || cat.id === "sauce";
                      const hasPortion = r.cost_per_portion != null && r.cost_per_portion > 0;
                      const hasKg = r.cost_per_kg != null && r.cost_per_kg > 0;
                      return (
                        <RecipeCard
                          key={r.id}
                          name={r.name ?? "Recette"}
                          href={`/recettes/cuisine/${r.id}`}
                          onProd={r.pivot_ingredient_id ? () => setProdModal({ type: "cuisine", id: r.id, name: r.name ?? "Cuisine", pivotId: r.pivot_ingredient_id! }) : undefined}
                          color={catColor}
                          photoUrl={r.photo_url}
                          subtitle={cat.label}
                          subtitleColor={catColor}
                          cost={isPrep ? (hasKg ? r.cost_per_kg! : null) : (hasPortion ? r.cost_per_portion! : hasKg ? r.cost_per_kg! : null)}
                          costLabel={isPrep ? (hasKg ? "/kg" : undefined) : (hasPortion ? "/portion" : hasKg ? "/kg" : undefined)}
                          pv={isPrep ? null : r.sell_price}
                          pvConseille={isPrep ? null : pvTTCKitchen(r)}
                          pvLabel={isPrep ? undefined : (hasPortion ? "TTC" : hasKg ? "TTC/kg" : undefined)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Cocktail ── */}
        {showCocktail && filteredCocktails.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Cocktail" color={COCKTAIL_COLOR} count={filteredCocktails.length}
              />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 8 }}>
              {filteredCocktails.map(r => (
                <RecipeCard
                  key={r.id}
                  name={r.name ?? "Cocktail"}
                  href={`/recettes/cocktail/${r.id}`}
                  onProd={r.pivot_ingredient_id ? () => setProdModal({ type: "cocktail", id: r.id, name: r.name ?? "Cocktail", pivotId: r.pivot_ingredient_id! }) : undefined}
                  color={COCKTAIL_COLOR}
                  photoUrl={r.image_url}
                  subtitle="Cocktail"
                  subtitleColor={COCKTAIL_COLOR}
                  cost={r.total_cost}
                  pv={r.sell_price}
                  pvLabel="TTC"
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Empatement ── */}
        {showEmp && filteredEmps.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Empâtement" color={EMP_COLOR} count={filteredEmps.length}
              />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 8 }}>
              {filteredEmps.map(r => (
                <RecipeCard
                  key={r.id}
                  name={r.name}
                  href={`/recettes/empatement/${r.id}`}
                  onProd={r.pivot_ingredient_id ? () => setProdModal({ type: "empatement", id: r.id, name: r.name ?? "Empatement", pivotId: r.pivot_ingredient_id! }) : undefined}
                  color={EMP_COLOR}
                  subtitle="Empâtement"
                  subtitleColor={EMP_COLOR}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── New recipe BottomSheet ── */}
      <BottomSheet
        open={showNewSheet}
        onClose={() => { setShowNewSheet(false); setNewSheetStep("category"); setNewSheetCat(""); }}
        title={newSheetStep === "category" ? "Nouvelle fiche" : newSheetCat === "pizza" ? "Pizza" : newSheetCat === "cuisine" ? "Cuisine" : "Bar"}
      >
        {newSheetStep === "category" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {([
              { key: "pizza", label: "Pizza", color: PIZZA_COLOR, desc: "Pizza, empâtement" },
              { key: "cuisine", label: "Cuisine", color: CUISINE_COLOR, desc: "Entrée, plat, dessert, sauce, préparation..." },
              { key: "bar", label: "Bar", color: COCKTAIL_COLOR, desc: "Cocktail, vin, bière, spiritueux, soft..." },
            ] as const).map(cat => (
              <button key={cat.key} type="button" onClick={() => { setNewSheetCat(cat.key); setNewSheetStep("sub"); }} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px", borderRadius: 14, width: "100%",
                border: "none", background: "rgba(255,255,255,0.55)", cursor: "pointer",
                borderLeft: `4px solid ${cat.color}`, textAlign: "left",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `${cat.color}15`, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: cat.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>{cat.label}</div>
                  <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{cat.desc}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Back button */}
            <button type="button" onClick={() => setNewSheetStep("category")} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 0", marginBottom: 4,
              border: "none", background: "none", cursor: "pointer", fontSize: 12, color: "#999", fontWeight: 600,
            }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              Retour
            </button>

            {/* Sub-categories per main category */}
            {newSheetCat === "pizza" && ([
              { label: "Pizza", href: "/recettes/new/pizza", color: PIZZA_COLOR, category: "" },
              { label: "Empâtement", href: "/recettes/new/empatement", color: EMP_COLOR, category: "" },
            ] as const).map(item => (
              <Link key={item.href} href={item.href} onClick={() => { setShowNewSheet(false); setNewSheetStep("category"); }} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px", borderRadius: 14, textDecoration: "none",
                background: "rgba(255,255,255,0.55)", borderLeft: `4px solid ${item.color}`,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${item.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>{item.label}</span>
              </Link>
            ))}

            {newSheetCat === "cuisine" && ([
              { label: "Entrée", category: "entree" },
              { label: "Plat", category: "plat_cuisine" },
              { label: "Dessert", category: "dessert" },
              { label: "Sauce", category: "sauce" },
              { label: "Accompagnement", category: "accompagnement" },
              { label: "Préparation", category: "preparation" },
            ]).map(item => (
              <Link key={item.category} href={`/recettes/new/cuisine?category=${item.category}`} onClick={() => { setShowNewSheet(false); setNewSheetStep("category"); }} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px", borderRadius: 14, textDecoration: "none",
                background: "rgba(255,255,255,0.55)", borderLeft: `4px solid ${CUISINE_COLOR}`,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${CUISINE_COLOR}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: CUISINE_COLOR }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>{item.label}</span>
              </Link>
            ))}

            {newSheetCat === "bar" && ([
              { label: "Cocktail", href: "/recettes/new/cocktail", ficheType: "cocktail", category: "cocktail" },
              { label: "Vin", href: "/recettes/new/cuisine?category=vin&ficheType=vin", ficheType: "vin", category: "vin" },
              { label: "Spiritueux", href: "/recettes/new/cuisine?category=spiritueux&ficheType=vin", ficheType: "vin", category: "spiritueux" },
              { label: "Bière", href: "/recettes/new/cuisine?category=biere&ficheType=boisson", ficheType: "boisson", category: "biere" },
              { label: "Soft / Sans alcool", href: "/recettes/new/cuisine?category=soft&ficheType=boisson", ficheType: "boisson", category: "soft" },
              { label: "Sirop maison", href: "/recettes/new/cuisine?category=sirop&ficheType=recette", ficheType: "recette", category: "sirop" },
            ]).map(item => (
              <Link key={item.category} href={item.href} onClick={() => { setShowNewSheet(false); setNewSheetStep("category"); }} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px", borderRadius: 14, textDecoration: "none",
                background: "rgba(255,255,255,0.55)", borderLeft: `4px solid ${COCKTAIL_COLOR}`,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${COCKTAIL_COLOR}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: COCKTAIL_COLOR }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>{item.label}</span>
              </Link>
            ))}

            {/* Custom sub-category */}
            <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "4px 0" }} />
            <button type="button" onClick={() => {
              const nom = prompt("Nom de la sous-categorie :");
              if (nom && nom.trim()) {
                const slug = nom.trim().toLowerCase().replace(/\s+/g, "_").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const formType = newSheetCat === "bar" ? "cocktail" : "cuisine";
                router.push(`/recettes/new/${formType}?category=${encodeURIComponent(slug)}&categoryLabel=${encodeURIComponent(nom.trim())}`);
                setShowNewSheet(false); setNewSheetStep("category");
              }
            }} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "14px 16px", borderRadius: 14, width: "100%",
              border: "none", background: "rgba(255,255,255,0.55)", cursor: "pointer", textAlign: "left",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "rgba(212,119,90,0.1)", color: "#D4775A",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 300,
              }}>+</div>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#D4775A" }}>Autre sous-categorie</span>
            </button>
          </div>
        )}
      </BottomSheet>
      {prodModal && (
        <ProductionModal
          recipeType={prodModal.type}
          recipeId={prodModal.id}
          recipeName={prodModal.name}
          pivotIngredientId={prodModal.pivotId}
          onClose={() => setProdModal(null)}
        />
      )}

      {/* ── New category modal ── */}
      {showNewCatModal && (
        <div
          onClick={() => { setShowNewCatModal(false); setNewCatName(""); }}
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 16, padding: 24, maxWidth: 420, width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)", border: "1px solid #e0d8ce",
            }}
          >
            <h3 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Nouvelle catégorie
            </h3>
            <p style={{ fontSize: 12, color: "#999", margin: "0 0 16px" }}>
              Tu seras redirigé vers la création d&apos;une recette dans cette catégorie. La catégorie sera sauvegardée dès que la recette est enregistrée.
            </p>
            <input
              type="text"
              autoFocus
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreateCategory(); }}
              placeholder="Ex : Verre de vin"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 10,
                border: "1.5px solid #ddd6c8", background: "#faf7f2",
                fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => { setShowNewCatModal(false); setNewCatName(""); }}
                style={{ padding: "8px 16px", borderRadius: 10, border: "1.5px solid #ddd6c8", background: "#fff", color: "#666", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={!newCatName.trim()}
                style={{
                  padding: "8px 16px", borderRadius: 10, border: "none",
                  background: newCatName.trim() ? "#4a6741" : "#ccc",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: newCatName.trim() ? "pointer" : "not-allowed",
                }}
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function RecettesContent() {
  return (
    <Suspense
      fallback={
        <main className="container"><TopNav title="Fiches techniques" subtitle="Chargement..." /></main>
      }
    >
      <RecettesInner />
    </Suspense>
  );
}

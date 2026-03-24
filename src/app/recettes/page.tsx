"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import ProductionModal from "@/components/ProductionModal";

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

type MainTab = "tous" | "pizza" | "cuisine" | "cocktail" | "empatement";
type SortKey = "name" | "cost" | "fc" | "price";
type SortDir = "asc" | "desc";
type CuisineCatFilter = "all" | "plat_cuisine" | "preparation" | "entree" | "sauce" | "dessert" | "autre";
type FoodCostFilter = "all" | "bon" | "attention" | "alerte";

// ─── Constants ────────────────────────────────────────────────────────────────

const PIZZA_COLOR    = "#8B1A1A";
const CUISINE_COLOR  = "#4a6741";
const COCKTAIL_COLOR = "#D4775A";
const EMP_COLOR      = "#8a7b6b";

const CUISINE_CATS = [
  { id: "preparation",    label: "Pr\u00e9paration" },
  { id: "sauce",          label: "Sauce" },
  { id: "entree",         label: "Entr\u00e9e" },
  { id: "plat_cuisine",   label: "Plat cuisin\u00e9" },
  { id: "accompagnement", label: "Accompagnement" },
  { id: "dessert",        label: "Dessert" },
  { id: "autre",          label: "Autre" },
];

const CUISINE_CAT_COLORS: Record<string, string> = {
  all: CUISINE_COLOR, plat_cuisine: "#B45309", preparation: "#7C3AED",
  entree: "#0284C7", sauce: "#DC2626", dessert: "#D4775A",
  accompagnement: "#16A34A", autre: "#6B7280",
};

const CUISINE_CAT_FILTERS: { id: CuisineCatFilter; label: string; color: string }[] = [
  { id: "all",           label: "Tous",            color: CUISINE_CAT_COLORS.all },
  { id: "plat_cuisine",  label: "Plat",            color: CUISINE_CAT_COLORS.plat_cuisine },
  { id: "preparation",   label: "Prep",            color: CUISINE_CAT_COLORS.preparation },
  { id: "entree",        label: "Entr\u00e9e",     color: CUISINE_CAT_COLORS.entree },
  { id: "sauce",         label: "Sauce",           color: CUISINE_CAT_COLORS.sauce },
  { id: "dessert",       label: "Dessert",         color: CUISINE_CAT_COLORS.dessert },
  { id: "autre",         label: "Autre",           color: CUISINE_CAT_COLORS.autre },
];

const FOOD_COST_FILTERS: { id: FoodCostFilter; label: string }[] = [
  { id: "all",       label: "Tous" },
  { id: "bon",       label: "\u226428%" },
  { id: "attention", label: "\u226432%" },
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
      <div style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#f2ede4" }}>
        <Image src={src} alt={name} width={44} height={44} style={{ objectFit: "cover", width: 44, height: 44 }} />
      </div>
    );
  }
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
      background: color + "18",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 14, fontWeight: 800, color, letterSpacing: 1,
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
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px", borderRadius: 14,
        background: "#fff",
        border: "1px solid #ddd6c8",
        cursor: "pointer", transition: "all 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "#f8f5f0"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
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
              {subtitle ? "\u00b7 " : ""}{fmt(cost)}{" \u20ac"}{costLabel ?? ""}
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
            {fmt(effectivePrice)}{" \u20ac"}
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
  title, color, count, newHref,
}: {
  title: string; color: string; count: number; newHref?: string;
}) {
  const router = useRouter();
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
      {newHref && (
        <button
          type="button"
          onClick={() => router.push(newHref)}
          style={{
            padding: "5px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
            border: `1.5px solid ${color}`,
            background: color + "10", color,
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          + Nouvelle
        </button>
      )}
    </div>
  );
}

// ─── Tab pill ─────────────────────────────────────────────────────────────────

const tabStyle = (active: boolean, color?: string): React.CSSProperties => ({
  padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700,
  border: active ? "none" : `1.5px solid ${color ?? "#1a1a1a"}40`,
  background: active ? (color ?? "#1a1a1a") : `${color ?? "#1a1a1a"}14`,
  color: active ? "#fff" : (color ?? "#1a1a1a"),
  cursor: "pointer", whiteSpace: "nowrap",
  transition: "all 0.15s",
});

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
  const [refreshKey, setRefreshKey] = useState(0);
  const [q, setQ]         = useState("");
  const [mainTab, setMainTab] = useState<MainTab>("tous");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [cuisineCatFilter, setCuisineCatFilter] = useState<CuisineCatFilter>("all");
  const [foodCostFilter, setFoodCostFilter] = useState<FoodCostFilter>("all");
  const [prodFilter, setProdFilter] = useState(false);
  const [prodModal, setProdModal] = useState<{ type: "pizza" | "cuisine" | "cocktail" | "empatement"; id: string; name: string; pivotId: string } | null>(null);
  const [showFab, setShowFab] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showCuisinePop, setShowCuisinePop] = useState(false);

  function refresh() { setLoading(true); setRefreshKey(k => k + 1); }

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
  }, [refreshKey, etabCtx?.id]);

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
          if (cuisineCatFilter === "autre") {
            const explicitCats = ["plat_cuisine", "preparation", "entree", "sauce", "dessert"];
            if (explicitCats.includes(cat)) return false;
          } else if (cat !== cuisineCatFilter) return false;
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

  const totalCount = filteredPizzas.length + filteredKitchens.length + filteredCocktails.length + filteredEmps.length;

  // Food cost alert counts
  const alertCount = useMemo(() => {
    let count = 0;
    for (const r of pizzas) { const fc = pizzaFc(r); if (fc != null && fc > 32) count++; }
    for (const r of kitchens) { const fc = kitchenFc(r); if (fc != null && fc > 32) count++; }
    for (const r of cocktails) { const fc = cocktailFc(r); if (fc != null && fc > 32) count++; }
    return count;
  }, [pizzas, kitchens, cocktails]);

  const prodCount = useMemo(() => {
    return pizzas.filter(r => r.pivot_ingredient_id).length
      + kitchens.filter(r => r.pivot_ingredient_id).length
      + cocktails.filter(r => r.pivot_ingredient_id).length
      + emps.filter(r => r.pivot_ingredient_id).length;
  }, [pizzas, kitchens, cocktails, emps]);

  // Tab counts
  const tabCounts = useMemo(() => ({
    tous: filteredPizzas.length + filteredKitchens.length + filteredCocktails.length + filteredEmps.length,
    pizza: filteredPizzas.length,
    cuisine: filteredKitchens.length,
    cocktail: filteredCocktails.length,
    empatement: filteredEmps.length,
  }), [filteredPizzas, filteredKitchens, filteredCocktails, filteredEmps]);

  if (authOk === null || loading) {
    return (
      <main className="container">
        <TopNav title="Recettes" subtitle="Chargement..." />
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
        <TopNav title="Recettes" />
        <Link className="btn btnPrimary" href="/login">Se connecter</Link>
      </main>
    );
  }

  const showPizza = mainTab === "tous" || mainTab === "pizza";
  const showCuisine = mainTab === "tous" || mainTab === "cuisine";
  const showCocktail = mainTab === "tous" || mainTab === "cocktail";
  const showEmp = mainTab === "tous" || mainTab === "empatement";

  const hasActiveFilter = foodCostFilter !== "all" || cuisineCatFilter !== "all" || prodFilter;

  return (
    <>
      <main className="container" style={{ paddingBottom: 80 }}>
        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", color: "#1a1a1a", textTransform: "uppercase", letterSpacing: 1 }}>
              Recettes
            </h1>
            <span style={{ fontSize: 13, color: "#999" }}>{totalCount} fiche{totalCount > 1 ? "s" : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {alertCount > 0 && (
              <button type="button" onClick={() => { setFoodCostFilter("alerte"); }}
                style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: "rgba(139,26,26,0.10)", color: "#8B1A1A", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                {alertCount} alerte{alertCount > 1 ? "s" : ""}
              </button>
            )}
            <button onClick={refresh} disabled={loading}
              style={{ width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #ddd6c8", background: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {loading ? "\u2026" : "\u21BB"}
            </button>
          </div>
        </div>

        {/* ── Erreurs ── */}
        {loadErrors.length > 0 && (
          <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid rgba(139,26,26,0.2)", fontSize: 13 }}>
            <strong style={{ color: "#8B1A1A" }}>Erreurs :</strong>
            {loadErrors.map(e => <div key={e} style={{ color: "#8B1A1A", marginTop: 4 }}>{e}</div>)}
          </div>
        )}

        {/* ── Search + filter toggle ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              type="search"
              placeholder="Rechercher..."
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 12,
                border: "1.5px solid #ddd6c8", background: "#fff",
                fontSize: 14, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <button type="button" onClick={() => setShowFilters(f => !f)}
            style={{
              width: 42, height: 42, borderRadius: 12, flexShrink: 0,
              border: hasActiveFilter ? "1.5px solid #D4775A" : "1.5px solid #ddd6c8",
              background: hasActiveFilter ? "#D4775A10" : "#fff",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, color: hasActiveFilter ? "#D4775A" : "#999",
            }}>
            {hasActiveFilter ? "\u2731" : "\u2630"}
          </button>
          {/* Sort dropdown custom */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button type="button" onClick={() => setShowSort(s => !s)}
              style={{
                height: 42, padding: "0 12px", borderRadius: 12,
                border: "1.5px solid #ddd6c8", background: "#fff",
                fontSize: 12, fontWeight: 700, color: "#1a1a1a", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
              }}>
              {sortKey === "name" ? (sortDir === "asc" ? "A-Z" : "Z-A") : sortKey === "cost" ? "Co\u00fbt" : sortKey === "fc" ? "FC" : "Prix"}
              <span style={{ fontSize: 9, opacity: 0.5 }}>{"\u25BC"}</span>
            </button>
            {showSort && (
              <>
                <div onClick={() => setShowSort(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
                <div style={{
                  position: "absolute", top: 46, right: 0, zIndex: 200,
                  background: "#fff", borderRadius: 12, padding: 6,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid #ddd6c8",
                  minWidth: 130,
                }}>
                  {([
                    { k: "name" as SortKey, d: "asc" as SortDir, label: "A \u2192 Z" },
                    { k: "name" as SortKey, d: "desc" as SortDir, label: "Z \u2192 A" },
                    { k: "cost" as SortKey, d: "asc" as SortDir, label: "Co\u00fbt \u2191" },
                    { k: "cost" as SortKey, d: "desc" as SortDir, label: "Co\u00fbt \u2193" },
                    { k: "fc" as SortKey, d: "asc" as SortDir, label: "FC \u2191" },
                    { k: "fc" as SortKey, d: "desc" as SortDir, label: "FC \u2193" },
                    { k: "price" as SortKey, d: "asc" as SortDir, label: "Prix \u2191" },
                    { k: "price" as SortKey, d: "desc" as SortDir, label: "Prix \u2193" },
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
        </div>

        {/* ── Main tabs ── */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 6 }}>
          {([
            { key: "tous" as MainTab, label: "Tous", color: "#1a1a1a" },
            { key: "pizza" as MainTab, label: "Pizza", color: PIZZA_COLOR },
            { key: "cuisine" as MainTab, label: "Cuisine", color: CUISINE_COLOR },
            { key: "cocktail" as MainTab, label: "Cocktail", color: COCKTAIL_COLOR },
            { key: "empatement" as MainTab, label: "Emp\u00e2t.", color: EMP_COLOR },
          ]).map(t => (
            <div key={t.key} style={{ position: "relative", flexShrink: 0 }}>
              <button type="button"
                onClick={() => {
                  if (t.key === "cuisine") {
                    if (mainTab === "cuisine") { setShowCuisinePop(p => !p); }
                    else { setMainTab("cuisine"); setShowCuisinePop(true); }
                  } else {
                    setMainTab(t.key); setShowCuisinePop(false);
                  }
                }}
                style={tabStyle(mainTab === t.key, t.color)}>
                {t.label}
                <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.7 }}>({tabCounts[t.key]})</span>
              </button>
              {/* Cuisine sub-category modal */}
              {t.key === "cuisine" && showCuisinePop && (
                <div onClick={() => setShowCuisinePop(false)} style={{
                  position: "fixed", inset: 0, zIndex: 300,
                  background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div onClick={e => e.stopPropagation()} style={{
                    background: "#fff", borderRadius: 20, padding: "24px 20px 20px",
                    width: "90%", maxWidth: 360,
                    boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", color: CUISINE_COLOR, textTransform: "uppercase", letterSpacing: 1 }}>
                        Cuisine
                      </h3>
                      <button type="button" onClick={() => setShowCuisinePop(false)}
                        style={{ background: "none", border: "none", fontSize: 20, color: "#999", cursor: "pointer", padding: 4 }}>
                        {"\u2715"}
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {CUISINE_CAT_FILTERS.map(f => {
                        const active = cuisineCatFilter === f.id;
                        const c = f.color;
                        return (
                          <button key={f.id} type="button"
                            onClick={() => { setCuisineCatFilter(f.id); setShowCuisinePop(false); }}
                            style={{
                              padding: "14px 12px", borderRadius: 12,
                              border: active ? `2px solid ${c}` : `1.5px solid ${c}40`,
                              background: active ? `${c}20` : `${c}0A`,
                              color: c,
                              fontSize: 14, fontWeight: active ? 700 : 600,
                              cursor: "pointer", textAlign: "center",
                              gridColumn: f.id === "all" ? "1 / -1" : undefined,
                            }}>
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {prodCount > 0 && (
            <button type="button"
              onClick={() => { setProdFilter(p => !p); }}
              style={tabStyle(prodFilter, "#4a6741")}>
              Prod.
              <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.7 }}>({prodCount})</span>
            </button>
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
          <p style={{ textAlign: "center", color: "#999", padding: 40, fontSize: 14 }}>Aucune recette trouv{"\u00e9"}e.</p>
        )}

        {/* ── Pizza ── */}
        {showPizza && filteredPizzas.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Pizza" color={PIZZA_COLOR} count={filteredPizzas.length}
              newHref={canWrite ? "/recettes/new/pizza" : undefined} />
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
              newHref={canWrite ? "/recettes/new/cuisine" : undefined} />
            {CUISINE_CATS.filter(cat => (kitchenByCat[cat.id]?.length ?? 0) > 0).map(cat => {
              const catColor = CUISINE_CAT_COLORS[cat.id] ?? CUISINE_COLOR;
              return (
                <div key={cat.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 0 6px" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: catColor, letterSpacing: 0.3 }}>{cat.label}</span>
                    <span style={{ fontSize: 11, color: "#999" }}>({kitchenByCat[cat.id].length})</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 8, marginBottom: 8 }}>
                    {kitchenByCat[cat.id].map(r => {
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
                          cost={hasPortion ? r.cost_per_portion! : hasKg ? r.cost_per_kg! : null}
                          costLabel={hasPortion ? "/portion" : hasKg ? "/kg" : undefined}
                          pv={r.sell_price}
                          pvConseille={pvTTCKitchen(r)}
                          pvLabel={hasPortion ? "TTC" : hasKg ? "TTC/kg" : undefined}
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
              newHref={canWrite ? "/recettes/new/cocktail" : undefined} />
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
            <SectionHeader title="Emp\u00e2tement" color={EMP_COLOR} count={filteredEmps.length}
              newHref={canWrite ? "/recettes/new/empatement" : undefined} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 8 }}>
              {filteredEmps.map(r => (
                <RecipeCard
                  key={r.id}
                  name={r.name}
                  href={`/recettes/empatement/${r.id}`}
                  onProd={r.pivot_ingredient_id ? () => setProdModal({ type: "empatement", id: r.id, name: r.name ?? "Empatement", pivotId: r.pivot_ingredient_id! }) : undefined}
                  color={EMP_COLOR}
                  subtitle="Emp\u00e2tement"
                  subtitleColor={EMP_COLOR}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── FAB mobile ── */}
      {canWrite && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 100 }}>
          {showFab && (
            <div style={{
              position: "absolute", bottom: 60, right: 0,
              background: "#fff", borderRadius: 14, padding: 8,
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)", border: "1px solid #ddd6c8",
              display: "flex", flexDirection: "column", gap: 4, minWidth: 160,
            }}>
              {[
                { label: "Pizza", href: "/recettes/new/pizza", color: PIZZA_COLOR },
                { label: "Cuisine", href: "/recettes/new/cuisine", color: CUISINE_COLOR },
                { label: "Cocktail", href: "/recettes/new/cocktail", color: COCKTAIL_COLOR },
                { label: "Emp\u00e2tement", href: "/recettes/new/empatement", color: EMP_COLOR },
              ].map(item => (
                <Link key={item.href} href={item.href} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 10, textDecoration: "none",
                  fontSize: 13, fontWeight: 700, color: item.color,
                  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                  textTransform: "uppercase", letterSpacing: 1,
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#f2ede4"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }} />
                  {item.label}
                </Link>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowFab(f => !f)}
            style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "#D4775A", border: "none",
              color: "#fff", fontSize: 26, fontWeight: 300,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(212,119,90,0.4)",
              transition: "transform 0.2s",
              transform: showFab ? "rotate(45deg)" : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            +
          </button>
        </div>
      )}
      {prodModal && (
        <ProductionModal
          recipeType={prodModal.type}
          recipeId={prodModal.id}
          recipeName={prodModal.name}
          pivotIngredientId={prodModal.pivotId}
          onClose={() => setProdModal(null)}
        />
      )}
    </>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function RecettesPage() {
  return (
    <Suspense
      fallback={
        <main className="container"><TopNav title="Recettes" subtitle="Chargement..." /></main>
      }
    >
      <RecettesInner />
    </Suspense>
  );
}

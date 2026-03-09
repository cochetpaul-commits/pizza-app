"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { NavBar } from "@/components/NavBar";
import { TopNav } from "@/components/TopNav";
import { EstabBadge } from "@/components/EstabBadge";

// ─── Types ────────────────────────────────────────────────────────────────────

type PizzaRow = {
  id: string; name: string | null;
  total_cost: number | null;
  margin_rate: number | null; vat_rate: number | null;
  sell_price: number | null;
  establishments: string[] | null;
  pivot_ingredient_id: string | null;
};
type KitchenRow = {
  id: string; name: string | null; category: string | null;
  total_cost: number | null; cost_per_kg: number | null;
  cost_per_portion: number | null;
  margin_rate: number | null; vat_rate: number | null;
  sell_price: number | null;
  establishments: string[] | null;
  pivot_ingredient_id: string | null;
};
type CocktailRow = {
  id: string; name: string | null; type: string | null;
  total_cost: number | null; sell_price: number | null;
  establishments: string[] | null;
  pivot_ingredient_id: string | null;
};
type EmpRow = {
  id: string; name: string; type: string; created_at: string;
  pivot_ingredient_id: string | null;
};

type EstabFilter = "all" | "bellomio" | "piccola";
type SortDir = "asc" | "desc";

// ─── Constants ────────────────────────────────────────────────────────────────

const PIZZA_COLOR    = "#8B1A1A";  // rouge
const CUISINE_COLOR  = "#166534";  // vert
const COCKTAIL_COLOR = "#0E7490";  // teal
const EMP_COLOR      = "#B45309";  // ambre-brun

const CUISINE_CATS = [
  { id: "preparation",    label: "Préparation" },
  { id: "entree",         label: "Entrée" },
  { id: "plat_cuisine",   label: "Plat cuisiné" },
  { id: "accompagnement", label: "Accompagnement" },
  { id: "sauce",          label: "Sauce" },
  { id: "dessert",        label: "Dessert" },
  { id: "autre",          label: "Autre" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function matchesEstab(est: string[] | null, filter: EstabFilter): boolean {
  if (filter === "all") return true;
  return (est ?? ["bellomio", "piccola"]).includes(filter);
}

function matchesSearch(name: string | null, q: string): boolean {
  if (!q) return true;
  return (name ?? "").toLowerCase().includes(q.toLowerCase());
}

/**
 * margin_rate stored as % (e.g. 75), vat_rate stored as % for pizza (e.g. 10)
 * or as decimal for kitchen (e.g. 0.1).
 * Normalization: if value >= 1 → treat as %, divide by 100.
 */
function normRate(r: number | null): number {
  if (r == null) return 0;
  return r >= 1 ? r / 100 : r;
}

function pvTTCPizza(r: PizzaRow): number | null {
  const cost = r.total_cost;
  if (!cost || cost <= 0) return null;
  const m = normRate(r.margin_rate);   // margin_rate % e.g. 60 → 0.6
  const v = normRate(r.vat_rate);      // vat_rate %   e.g. 10 → 0.1
  if (m <= 0 || m >= 1) return null;
  return cost / (1 - m) * (1 + v);
}

function pvTTCKitchen(r: KitchenRow): number | null {
  const cost = r.cost_per_portion ?? r.cost_per_kg;
  if (!cost || cost <= 0) return null;
  const mr = r.margin_rate ?? 0;
  const m = mr >= 1 ? mr / 100 : mr;  // stored as % (e.g. 75) or possibly decimal
  const vr = r.vat_rate ?? 0.1;
  const v = vr >= 1 ? vr / 100 : vr;
  if (m <= 0 || m >= 1) return null;
  return cost / (1 - m) * (1 + v);
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function RecipeCard({
  name, href, color, establishments, prodHref,
  cost, costLabel, pv, pvConseille, pvLabel,
}: {
  name: string; href: string; color: string;
  establishments?: string[] | null; prodHref?: string;
  cost?: number | null; costLabel?: string;
  pv?: number | null; pvConseille?: number | null; pvLabel?: string;
}) {
  const router = useRouter();
  const estabs = establishments;
  const showBM = estabs != null && estabs.length > 0 && estabs.includes("bellomio") && !estabs.includes("piccola");
  const showPM = estabs != null && estabs.length > 0 && estabs.includes("piccola") && !estabs.includes("bellomio");
  const showUnassigned = !estabs || estabs.length === 0;
  const hasBadge = showBM || showPM || showUnassigned;

  // Effective price: manual sell_price > PV conseillé
  const effectivePrice = (pv != null && pv > 0) ? pv : (pvConseille != null && pvConseille > 0 ? pvConseille : null);
  const isConseille = (pv == null || pv <= 0) && effectivePrice != null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={ev => ev.key === "Enter" && router.push(href)}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "11px 14px", borderRadius: 12,
        background: "rgba(255,255,255,0.45)",
        border: "1px solid rgba(217,199,182,0.5)",
        cursor: "pointer", transition: "background 0.12s",
        marginBottom: 6,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.75)")}
      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.45)")}
    >
      <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
        <div style={{
          fontWeight: 700, fontSize: 13,
          textTransform: "uppercase", letterSpacing: "0.05em", color: "#2f3a33",
        }}>
          {name}
        </div>
        {hasBadge && (
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            {showBM && <EstabBadge estab="bellomio" />}
            {showPM && <EstabBadge estab="piccola" />}
            {showUnassigned && (
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "2px 9px", borderRadius: 4,
                fontSize: 11, fontWeight: 600, background: "#F3F4F6", color: "#9CA3AF",
              }}>Non assigné</span>
            )}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        {prodHref && (
          <button
            type="button"
            onClick={ev => { ev.stopPropagation(); router.push(prodHref); }}
            style={{
              padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
              border: "1.5px solid #166534",
              background: "rgba(22,101,52,0.08)", color: "#166534",
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Production
          </button>
        )}
        {cost != null && cost > 0 && (
          <div style={{ fontSize: 13, fontWeight: 700, color: "#9a8f84", whiteSpace: "nowrap" }}>
            {fmt(cost)} €{costLabel && <span style={{ fontSize: 10, marginLeft: 2 }}>{costLabel}</span>}
          </div>
        )}
        {effectivePrice != null && (
          <div style={{
            fontSize: 15, fontWeight: isConseille ? 500 : 900,
            fontStyle: isConseille ? "italic" : "normal",
            color: isConseille ? "#9a8f84" : color,
            whiteSpace: "nowrap",
          }}>
            {fmt(effectivePrice)} €{pvLabel && <span style={{ fontSize: 10, fontWeight: 500, marginLeft: 2 }}>{pvLabel}</span>}
            {isConseille && <span style={{ fontSize: 9, fontWeight: 500, marginLeft: 3 }}>(c)</span>}
          </div>
        )}
        {/* ── Marge brute + Food cost ── */}
        {cost != null && cost > 0 && (() => {
          if (effectivePrice == null) {
            return <span style={{ fontSize: 11, color: "#bbb", whiteSpace: "nowrap" }}>— %</span>;
          }
          const gm = effectivePrice - cost;
          const fc = (cost / effectivePrice) * 100;
          const dotColor = isConseille ? "#9a8f84" : (fc < 30 ? "#4a6741" : fc <= 35 ? "#d97706" : "#8B1A1A");
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontStyle: isConseille ? "italic" : "normal" }}>
              <span style={{ fontSize: 11, color: "#9a8f84", whiteSpace: "nowrap" }}>{fmt(gm)} € mg</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: dotColor, whiteSpace: "nowrap" }}>{fc.toFixed(1)} %</span>
              </span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// Fully controlled collapsible section
function Section({
  title, color, count, open, onToggle, newHref, children,
}: {
  title: string; color: string; count: number;
  open: boolean; onToggle: () => void;
  newHref?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "6px 0 8px", borderBottom: `2px solid ${color}`, marginBottom: 12,
      }}>
        {newHref && (
          <button
            type="button"
            onClick={() => router.push(newHref)}
            aria-label={`Nouvelle ${title.toLowerCase()}`}
            style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: color, border: "none", cursor: "pointer",
              color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1,
            }}
          >+</button>
        )}
        <button
          type="button"
          onClick={onToggle}
          style={{
            flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "none", border: "none", cursor: "pointer", padding: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 900, color, textTransform: "uppercase", letterSpacing: 1 }}>
            {title}
            <span style={{ fontWeight: 500, fontSize: 12, marginLeft: 6, color: "#6f6a61" }}>({count})</span>
          </span>
          <span style={{ fontSize: 12, color, fontWeight: 700 }}>{open ? "▲" : "▼"}</span>
        </button>
      </div>
      {open && children}
    </div>
  );
}

// Fully controlled collapsible subsection
function SubSection({
  title, color, count, open, onToggle, children,
}: {
  title: string; color: string; count: number;
  open: boolean; onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "none", border: "none", cursor: "pointer",
          padding: "8px 4px 9px", borderBottom: `1px solid rgba(22,101,52,0.2)`, marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 800, color, letterSpacing: 0.5 }}>
          {title}
          <span style={{ fontWeight: 500, marginLeft: 4 }}>({count})</span>
        </span>
        <span style={{ fontSize: 11, color }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && children}
    </div>
  );
}

// ─── Main inner component ─────────────────────────────────────────────────────

function RecettesInner() {
  const [authOk, setAuthOk] = useState<boolean | null>(null);
  const [pizzas,    setPizzas]    = useState<PizzaRow[]>([]);
  const [kitchens,  setKitchens]  = useState<KitchenRow[]>([]);
  const [cocktails, setCocktails] = useState<CocktailRow[]>([]);
  const [emps,      setEmps]      = useState<EmpRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const [q, setQ]         = useState("");
  const [estab, setEstab] = useState<EstabFilter>("all");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ── Sections open state (fully controlled for expand/collapse all) ──
  const [allExpanded, setAllExpanded] = useState(false);
  const [secOpen, setSecOpen] = useState({ pizza: false, cuisine: false, cocktail: false, empatement: false });
  const [subOpen, setSubOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(CUISINE_CATS.map(c => [c.id, false]))
  );

  function handleExpandToggle(on: boolean) {
    setAllExpanded(on);
    setSecOpen({ pizza: on, cuisine: on, cocktail: on, empatement: on });
    setSubOpen(Object.fromEntries(CUISINE_CATS.map(c => [c.id, on])));
  }
  function toggleSec(k: keyof typeof secOpen) {
    setSecOpen(s => ({ ...s, [k]: !s[k] }));
  }
  function toggleSub(id: string) {
    setSubOpen(s => ({ ...s, [id]: !s[id] }));
  }

  // Refresh depuis un event handler (bouton) — setState ici est OK (pas dans un effect)
  function refresh() { setLoading(true); setRefreshKey(k => k + 1); }

  useEffect(() => {
    // Toutes les setState sont dans des callbacks async → pas de cascades
    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!sessionData.session) { setAuthOk(false); setLoading(false); return; }
      setAuthOk(true);
      Promise.all([
        supabase.from("pizza_recipes")
          .select("id,name,total_cost,margin_rate,vat_rate,sell_price,establishments,pivot_ingredient_id")
          .eq("is_draft", false),
        supabase.from("kitchen_recipes")
          .select("id,name,category,total_cost,cost_per_kg,cost_per_portion,margin_rate,vat_rate,sell_price,establishments,pivot_ingredient_id")
          .eq("is_draft", false),
        supabase.from("cocktails")
          .select("id,name,type,total_cost,sell_price,establishments,pivot_ingredient_id")
          .eq("is_draft", false),
        supabase.from("recipes")
          .select("id,name,type,created_at,pivot_ingredient_id")
          .order("created_at", { ascending: false }),
      ]).then(([p, k, c, e]) => {
        const errs: string[] = [];
        if (p.error) errs.push(`Pizza : ${p.error.message ?? JSON.stringify(p.error)}`);
        if (k.error) errs.push(`Cuisine : ${k.error.message ?? JSON.stringify(k.error)}`);
        if (c.error) errs.push(`Cocktail : ${c.error.message ?? JSON.stringify(c.error)}`);
        if (e.error) errs.push(`Empâtement : ${e.error.message ?? JSON.stringify(e.error)}`);
        setLoadErrors(errs);
        setPizzas((p.data ?? []) as PizzaRow[]);
        setKitchens((k.data ?? []) as KitchenRow[]);
        setCocktails((c.data ?? []) as CocktailRow[]);
        setEmps((e.data ?? []) as EmpRow[]);
        setLoading(false);
      });
    });
  }, [refreshKey]);

  // ── Filtered + sorted data ──
  const filteredPizzas = useMemo(() =>
    pizzas
      .filter(r => matchesEstab(r.establishments, estab) && matchesSearch(r.name, q))
      .sort((a, b) => {
        const ca = a.total_cost ?? Infinity, cb = b.total_cost ?? Infinity;
        return sortDir === "asc" ? ca - cb : cb - ca;
      }),
    [pizzas, estab, q, sortDir]);

  const filteredKitchens = useMemo(() =>
    kitchens
      .filter(r => matchesEstab(r.establishments, estab) && matchesSearch(r.name, q))
      .sort((a, b) => {
        const ca = a.cost_per_portion ?? a.cost_per_kg ?? Infinity;
        const cb = b.cost_per_portion ?? b.cost_per_kg ?? Infinity;
        return sortDir === "asc" ? ca - cb : cb - ca;
      }),
    [kitchens, estab, q, sortDir]);

  const filteredCocktails = useMemo(() =>
    cocktails
      .filter(r => matchesEstab(r.establishments, estab) && matchesSearch(r.name, q))
      .sort((a, b) => {
        const ca = a.total_cost ?? Infinity, cb = b.total_cost ?? Infinity;
        return sortDir === "asc" ? ca - cb : cb - ca;
      }),
    [cocktails, estab, q, sortDir]);

  const filteredEmps = useMemo(() =>
    emps.filter(r => matchesSearch(r.name, q)),
    [emps, q]);

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

  if (authOk === null || loading) {
    return (
      <>
        <NavBar />
        <main className="container"><TopNav title="Recettes" subtitle="Chargement…" /></main>
      </>
    );
  }
  if (!authOk) {
    return (
      <>
        <NavBar />
        <main className="container">
          <TopNav title="Recettes" />
          <Link className="btn btnPrimary" href="/login">Se connecter</Link>
        </main>
      </>
    );
  }

  return (
    <>
      <NavBar right={
        <button className="btn" onClick={refresh} disabled={loading} style={{ fontSize: 12 }}>
          {loading ? "…" : "↻"}
        </button>
      } />
      <main className="container" style={{ paddingBottom: 40 }}>
        <TopNav title="Recettes" subtitle={loading ? "Chargement…" : `${totalCount} fiche(s)`} />

        {/* ── Erreurs de chargement ── */}
        {loadErrors.length > 0 && (
          <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid rgba(139,26,26,0.2)", fontSize: 13 }}>
            <strong style={{ color: "#8B1A1A" }}>Erreurs de chargement :</strong>
            {loadErrors.map(e => <div key={e} style={{ color: "#8B1A1A", marginTop: 4 }}>{e}</div>)}
          </div>
        )}

        {/* ── Filtres ── */}
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="input"
            type="search"
            placeholder="Rechercher une recette…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {/* Établissement */}
            {(["all", "bellomio", "piccola"] as EstabFilter[]).map(v => (
              <button
                key={v} type="button"
                onClick={() => setEstab(v)}
                style={{
                  padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  border: "1.5px solid",
                  borderColor: estab === v ? "#8B1A1A" : "rgba(217,199,182,0.9)",
                  background: estab === v ? "rgba(139,26,26,0.08)" : "rgba(255,255,255,0.7)",
                  color: estab === v ? "#8B1A1A" : "#6f6a61",
                  cursor: "pointer",
                }}
              >
                {v === "all" ? "Tous" : v === "bellomio" ? "Bello Mio" : "Piccola Mia"}
              </button>
            ))}

            {/* Sort */}
            <button
              type="button" onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
              style={{
                padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px solid rgba(217,199,182,0.9)",
                background: "rgba(255,255,255,0.7)", color: "#6f6a61",
                cursor: "pointer",
              }}
            >
              Coût {sortDir === "asc" ? "▲" : "▼"}
            </button>

            {/* Toggle tout déplier / replier */}
            <button
              type="button"
              onClick={() => handleExpandToggle(!allExpanded)}
              style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              aria-label={allExpanded ? "Tout replier" : "Tout déplier"}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: "#6f6a61" }}>
                {allExpanded ? "Replier" : "Déplier"}
              </span>
              {/* Switch pill */}
              <span style={{
                display: "inline-flex", alignItems: "center",
                width: 38, height: 22, borderRadius: 11,
                background: allExpanded ? "#8B1A1A" : "rgba(217,199,182,0.9)",
                transition: "background 0.2s", flexShrink: 0, padding: "0 3px",
                justifyContent: allExpanded ? "flex-end" : "flex-start",
              }}>
                <span style={{
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                  transition: "all 0.2s",
                  display: "block",
                }} />
              </span>
            </button>
          </div>
        </div>

        {totalCount === 0 && !loading && (
          <p className="muted">Aucune recette trouvée.</p>
        )}

        {/* ── Pizza ── */}
        <Section
            title="Pizza" color={PIZZA_COLOR} count={filteredPizzas.length}
            open={secOpen.pizza} onToggle={() => toggleSec("pizza")}
            newHref="/recettes/new/pizza"
          >
            {filteredPizzas.map(r => (
                <RecipeCard
                  key={r.id}
                  name={r.name ?? "Pizza"}
                  href={`/recettes/pizza/${r.id}`}
                  prodHref={r.pivot_ingredient_id ? `/recettes/pizza/${r.id}?mode=production` : undefined}
                  color={PIZZA_COLOR}
                  establishments={r.establishments}
                  cost={r.total_cost}
                  pv={r.sell_price}
                  pvConseille={pvTTCPizza(r)}
                  pvLabel="TTC"
                />
            ))}
          </Section>

        {/* ── Cuisine ── */}
          <Section
            title="Cuisine" color={CUISINE_COLOR} count={filteredKitchens.length}
            open={secOpen.cuisine} onToggle={() => toggleSec("cuisine")}
            newHref="/recettes/new/cuisine"
          >
            {CUISINE_CATS.filter(cat => (kitchenByCat[cat.id]?.length ?? 0) > 0).map(cat => (
              <SubSection
                key={cat.id}
                title={cat.label} color={CUISINE_COLOR}
                count={kitchenByCat[cat.id].length}
                open={subOpen[cat.id] ?? true}
                onToggle={() => toggleSub(cat.id)}
              >
                {kitchenByCat[cat.id].map(r => {
                  const hasPortion = r.cost_per_portion != null && r.cost_per_portion > 0;
                  const hasKg = r.cost_per_kg != null && r.cost_per_kg > 0;
                  return (
                    <RecipeCard
                      key={r.id}
                      name={r.name ?? "Recette"}
                      href={`/recettes/cuisine/${r.id}`}
                      prodHref={r.pivot_ingredient_id ? `/recettes/cuisine/${r.id}?mode=production` : undefined}
                      color={CUISINE_COLOR}
                      establishments={r.establishments}
                      cost={hasPortion ? r.cost_per_portion! : hasKg ? r.cost_per_kg! : null}
                      costLabel={hasPortion ? "/portion" : hasKg ? "/kg" : undefined}
                      pv={r.sell_price}
                      pvConseille={pvTTCKitchen(r)}
                      pvLabel={hasPortion ? "TTC/portion" : hasKg ? "TTC/kg" : undefined}
                    />
                  );
                })}
              </SubSection>
            ))}
          </Section>

        {/* ── Cocktail ── */}
          <Section
            title="Cocktail" color={COCKTAIL_COLOR} count={filteredCocktails.length}
            open={secOpen.cocktail} onToggle={() => toggleSec("cocktail")}
            newHref="/recettes/new/cocktail"
          >
            {filteredCocktails.map(r => (
              <RecipeCard
                key={r.id}
                name={r.name ?? "Cocktail"}
                href={`/recettes/cocktail/${r.id}`}
                prodHref={r.pivot_ingredient_id ? `/recettes/cocktail/${r.id}?mode=production` : undefined}
                color={COCKTAIL_COLOR}
                establishments={r.establishments}
                cost={r.total_cost}
                pv={r.sell_price}
                pvLabel="TTC"
              />
            ))}
          </Section>

        {/* ── Empâtement ── */}
          <Section
            title="Empâtement" color={EMP_COLOR} count={filteredEmps.length}
            open={secOpen.empatement} onToggle={() => toggleSec("empatement")}
            newHref="/recettes/new/empatement"
          >
            {filteredEmps.map(r => (
              <RecipeCard
                key={r.id}
                name={r.name}
                href={`/recettes/empatement/${r.id}`}
                prodHref={r.pivot_ingredient_id ? `/recettes/empatement/${r.id}?mode=production` : undefined}
                color={EMP_COLOR}
              />
            ))}
          </Section>
      </main>
    </>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function RecettesPage() {
  return (
    <Suspense
      fallback={
        <>
          <NavBar />
          <main className="container"><TopNav title="Recettes" subtitle="Chargement…" /></main>
        </>
      }
    >
      <RecettesInner />
    </Suspense>
  );
}

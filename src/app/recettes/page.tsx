"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";
import { POLE_COLORS } from "@/lib/poleColors";

// --- Types ---------------------------------------------------------------

type PizzaRow    = { id: string; name: string | null; total_cost: number | null };
type EmpRow      = { id: string; name: string; type: string; created_at: string };
type KitchenRow  = { id: string; name: string | null; category: string | null; total_cost: number | null; cost_per_kg: number | null; cost_per_portion: number | null };
type PrepRow     = { id: string; name: string; pivot_unit: string; created_at: string };
type CocktailRow = { id: string; name: string | null; type: string | null; total_cost: number | null; sell_price: number | null };
type FlourMixItem = { name: string; percent: number; ingredient_id: string | null };
type DS<T>       = { status: "idle" | "loading" | "ok" | "error"; data?: T; error?: unknown };

// --- Config ---------------------------------------------------------------

const TABS = [
  { id: "pizza",      label: "Pizza",       color: POLE_COLORS.pizza },
  { id: "empatement", label: "Empâtement",  color: POLE_COLORS["empâtement"] },
  { id: "cuisine",    label: "Cuisine",      color: POLE_COLORS.cuisine },
  { id: "pivot",      label: "Préparations", color: POLE_COLORS.pivot },
  { id: "cocktail",   label: "Cocktail",     color: POLE_COLORS.cocktail },
] as const;
type TabId = (typeof TABS)[number]["id"];

const COCKTAIL_TYPE_LABELS: Record<string, string> = {
  long_drink: "Long drink", short_drink: "Short drink",
  shot: "Shot", mocktail: "Mocktail", signature: "Signature",
};

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- Shared row component ------------------------------------------------

function RecipeRow({
  name,
  cost,
  costLabel,
  color,
  onOpen,
  onDelete,
  sub,
}: {
  name: string;
  cost?: string | null;
  costLabel?: string;
  color: string;
  onOpen: () => void;
  onDelete: () => void;
  sub?: string;
}) {
  return (
    <div
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.45)",
        border: "1px solid rgba(217,199,182,0.5)",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.75)")}
      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.45)")}
    >
      {/* Nom + sous-titre */}
      <div>
        <div style={{
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#2f3a33",
        }}>
          {name}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: "#6f6a61", marginTop: 2 }}>{sub}</div>
        )}
      </div>

      {/* Coût mis en valeur */}
      {cost && (
        <div style={{
          fontSize: 17,
          fontWeight: 800,
          color,
          whiteSpace: "nowrap",
          letterSpacing: "-0.3px",
        }}>
          {cost}{costLabel ? <span style={{ fontSize: 11, fontWeight: 500, color: "#6f6a61", marginLeft: 3 }}>{costLabel}</span> : null}
        </div>
      )}

      {/* Icônes actions */}
      <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
        {/* Ouvrir → */}
        <button
          onClick={onOpen}
          title="Ouvrir"
          style={{
            width: 34, height: 34,
            borderRadius: 10,
            border: `1.5px solid ${color}`,
            background: color,
            color: "#fff",
            fontSize: 16,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "opacity 0.12s",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          →
        </button>

        {/* Supprimer ✕ */}
        <button
          onClick={onDelete}
          title="Supprimer"
          style={{
            width: 34, height: 34,
            borderRadius: 10,
            border: "1.5px solid rgba(217,199,182,0.95)",
            background: "rgba(255,255,255,0.5)",
            color: "#9a8f84",
            fontSize: 13,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "border-color 0.12s, color 0.12s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "#d93f3f";
            e.currentTarget.style.color = "#d93f3f";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "rgba(217,199,182,0.95)";
            e.currentTarget.style.color = "#9a8f84";
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// --- Inner component -----------------------------------------------------

function RecettesInner() {
  const router  = useRouter();
  const params  = useSearchParams();
  const rawTab  = params.get("tab") ?? "pizza";
  const activeTab: TabId = TABS.some(t => t.id === rawTab) ? (rawTab as TabId) : "pizza";

  const [authState, setAuthState] = useState<"loading" | "ok" | "notlogged">("loading");

  const [pizzaDs,    setPizzaDs]    = useState<DS<PizzaRow[]>>({ status: "idle" });
  const [empDs,      setEmpDs]      = useState<DS<EmpRow[]>>({ status: "idle" });
  const [cuisineDs,  setCuisineDs]  = useState<DS<KitchenRow[]>>({ status: "idle" });
  const [pivotDs,    setPivotDs]    = useState<DS<PrepRow[]>>({ status: "idle" });
  const [cocktailDs, setCocktailDs] = useState<DS<CocktailRow[]>>({ status: "idle" });

  const [creatingEmp,  setCreatingEmp]  = useState(false);
  const [empCreateErr, setEmpCreateErr] = useState<string | null>(null);

  const loaded = useRef<Set<TabId>>(new Set());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthState(data.user ? "ok" : "notlogged");
    });
  }, []);

  const loadPizza = useCallback(async () => {
    setPizzaDs({ status: "loading" });
    const { data, error } = await supabase
      .from("pizza_recipes").select("id,name,total_cost")
      .eq("is_draft", false).order("created_at", { ascending: false });
    setPizzaDs(error ? { status: "error", error } : { status: "ok", data: (data ?? []) as PizzaRow[] });
  }, []);

  const loadEmp = useCallback(async () => {
    setEmpDs({ status: "loading" });
    const { data, error } = await supabase
      .from("recipes").select("id,name,type,created_at")
      .order("created_at", { ascending: false });
    setEmpDs(error ? { status: "error", error } : { status: "ok", data: (data ?? []) as EmpRow[] });
  }, []);

  const loadCuisine = useCallback(async () => {
    setCuisineDs({ status: "loading" });
    const { data, error } = await supabase
      .from("kitchen_recipes").select("id,name,category,total_cost,cost_per_kg,cost_per_portion")
      .eq("is_draft", false).order("updated_at", { ascending: false });
    setCuisineDs(error ? { status: "error", error } : { status: "ok", data: (data ?? []) as KitchenRow[] });
  }, []);

  const loadPivot = useCallback(async () => {
    setPivotDs({ status: "loading" });
    const { data, error } = await supabase
      .from("prep_recipes").select("id,name,pivot_unit,created_at")
      .order("created_at", { ascending: false });
    setPivotDs(error ? { status: "error", error } : { status: "ok", data: (data ?? []) as PrepRow[] });
  }, []);

  const loadCocktail = useCallback(async () => {
    setCocktailDs({ status: "loading" });
    const { data, error } = await supabase
      .from("cocktails").select("id,name,type,total_cost,sell_price")
      .eq("is_draft", false).order("updated_at", { ascending: false });
    setCocktailDs(error ? { status: "error", error } : { status: "ok", data: (data ?? []) as CocktailRow[] });
  }, []);

  const maybeLoad = useCallback((tab: TabId) => {
    if (loaded.current.has(tab)) return;
    loaded.current.add(tab);
    if      (tab === "pizza")      loadPizza();
    else if (tab === "empatement") loadEmp();
    else if (tab === "cuisine")    loadCuisine();
    else if (tab === "pivot")      loadPivot();
    else if (tab === "cocktail")   loadCocktail();
  }, [loadPizza, loadEmp, loadCuisine, loadPivot, loadCocktail]);

  useEffect(() => {
    if (authState !== "ok") return;
    maybeLoad(activeTab);
  }, [activeTab, authState, maybeLoad]);

  const refresh = useCallback(() => {
    loaded.current.delete(activeTab);
    maybeLoad(activeTab);
  }, [activeTab, maybeLoad]);

  const createEmp = async () => {
    setEmpCreateErr(null);
    setCreatingEmp(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("NOT_LOGGED");
      const now = new Date();
      const payload: Record<string, unknown> = {
        name: `Empâtement ${now.toLocaleDateString("fr-FR")} ${now.toLocaleTimeString("fr-FR").slice(0, 5)}`,
        type: "biga", hydration_total: 65, salt_percent: 2,
        honey_percent: 0, oil_percent: 0,
        flour_mix: [
          { name: "Tipo 00", percent: 80, ingredient_id: null },
          { name: "Tipo 1",  percent: 20, ingredient_id: null },
        ] satisfies FlourMixItem[],
        yeast_percent: 0, biga_yeast_percent: 0, user_id: authData.user.id,
      };
      const { data, error } = await supabase.from("recipes").insert(payload).select("id").single<{ id: string }>();
      if (error) throw error;
      router.push(`/recipes/${data.id}`);
    } catch (e: unknown) {
      setEmpCreateErr(e instanceof Error ? e.message : "Erreur création");
    } finally {
      setCreatingEmp(false);
    }
  };

  const delPizza = async (id: string) => {
    if (!window.confirm("Supprimer cette fiche pizza ?")) return;
    const { error } = await supabase.from("pizza_recipes").delete().eq("id", id);
    if (error) { setPizzaDs(p => ({ ...p, status: "error", error })); return; }
    setPizzaDs(p => ({ ...p, data: (p.data ?? []).filter(x => x.id !== id) }));
  };

  const delEmp = async (id: string, name: string) => {
    if (!window.confirm(`Supprimer cet empâtement ?\n\n${name}`)) return;
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) { setEmpDs(p => ({ ...p, status: "error", error })); return; }
    setEmpDs(p => ({ ...p, data: (p.data ?? []).filter(x => x.id !== id) }));
  };

  const delCuisine = async (id: string) => {
    if (!window.confirm("Supprimer cette fiche cuisine ?")) return;
    const { error } = await supabase.from("kitchen_recipes").delete().eq("id", id);
    if (error) { setCuisineDs(p => ({ ...p, status: "error", error })); return; }
    setCuisineDs(p => ({ ...p, data: (p.data ?? []).filter(x => x.id !== id) }));
  };

  const delPivot = async (id: string, name: string) => {
    if (!window.confirm(`Supprimer cette recette pivot ?\n\n${name}`)) return;
    const { error } = await supabase.from("prep_recipes").delete().eq("id", id);
    if (error) { setPivotDs(p => ({ ...p, status: "error", error })); return; }
    setPivotDs(p => ({ ...p, data: (p.data ?? []).filter(x => x.id !== id) }));
  };

  const delCocktail = async (id: string) => {
    if (!window.confirm("Supprimer ce cocktail ?")) return;
    const { error } = await supabase.from("cocktails").delete().eq("id", id);
    if (error) { setCocktailDs(p => ({ ...p, status: "error", error })); return; }
    setCocktailDs(p => ({ ...p, data: (p.data ?? []).filter(x => x.id !== id) }));
  };

  if (authState === "loading") {
    return <main className="container"><TopNav title="Recettes" subtitle="Chargement…" /></main>;
  }
  if (authState === "notlogged") {
    return (
      <main className="container">
        <TopNav title="Recettes" />
        <Link className="btn btnPrimary" href="/login">Se connecter</Link>
      </main>
    );
  }

  const activeColor = TABS.find(t => t.id === activeTab)!.color;
  const activeDs    = activeTab === "pizza"      ? pizzaDs
    : activeTab === "empatement" ? empDs
    : activeTab === "cuisine"    ? cuisineDs
    : activeTab === "pivot"      ? pivotDs
    : cocktailDs;

  const count    = activeDs.data?.length;
  const subtitle = activeDs.status === "loading" ? "Chargement…"
    : activeDs.status === "error" ? "Erreur"
    : count != null ? `${count} fiche(s)` : "";

  const createBtn = (() => {
    if (activeTab === "pizza")
      return <Link className="btn btnPrimary" href="/pizzas/new">Nouvelle pizza</Link>;
    if (activeTab === "empatement")
      return <button className="btn btnPrimary" onClick={createEmp} disabled={creatingEmp}>{creatingEmp ? "Création…" : "Nouvel empâtement"}</button>;
    if (activeTab === "cuisine")
      return <Link className="btn btnPrimary" href="/kitchen/new">Nouvelle fiche</Link>;
    if (activeTab === "pivot")
      return <Link className="btn btnPrimary" href="/prep/new">Nouvelle recette pivot</Link>;
    return <Link className="btn btnPrimary" href="/cocktails/new">Nouveau cocktail</Link>;
  })();

  return (
    <main className="container">
      <TopNav title="Recettes" subtitle={subtitle} />

      {/* ── Tab bar — Option D ── */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid rgba(217,199,182,0.95)",
        marginBottom: 16,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {TABS.map((tab, i) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => router.push(`/recettes?tab=${tab.id}`)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "12px 18px",
                background: "none",
                border: "none",
                borderBottom: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
                marginBottom: -1,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? tab.color : "#6f6a61",
                whiteSpace: "nowrap",
                transition: "color 0.15s",
                flexShrink: 0,
                borderRight: i < TABS.length - 1 ? "1px solid rgba(217,199,182,0.5)" : "none",
              }}
            >
              <span style={{
                width: 7, height: 7,
                borderRadius: "50%",
                background: tab.color,
                opacity: isActive ? 1 : 0,
                transition: "opacity 0.15s",
                flexShrink: 0,
              }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {createBtn}
        <button className="btn" onClick={refresh}>Rafraîchir</button>
      </div>

      {empCreateErr && <p style={{ color: "red", marginBottom: 12 }}>{empCreateErr}</p>}

      {activeDs.status === "loading" && <p className="muted">Chargement…</p>}
      {activeDs.status === "error" && (
        <pre className="errorBox">{JSON.stringify(activeDs.error, null, 2)}</pre>
      )}

      {/* ── Wrapper carte avec liseré couleur ── */}
      {activeDs.status === "ok" && (activeDs.data ?? []).length === 0 && (
        <p className="muted">Aucune fiche créée.</p>
      )}

      {activeDs.status === "ok" && (activeDs.data ?? []).length > 0 && (
        <div className="card" style={{ borderLeft: `4px solid ${activeColor}`, padding: 10 }}>
          <div style={{ display: "grid", gap: 8 }}>

            {/* ---- Pizza ---- */}
            {activeTab === "pizza" && (pizzaDs.data ?? []).map(p => (
              <RecipeRow
                key={p.id}
                name={p.name ?? "Pizza"}
                cost={p.total_cost != null && p.total_cost > 0 ? fmtMoney(p.total_cost) + " €" : undefined}
                color={activeColor}
                onOpen={() => router.push(`/pizzas/${p.id}`)}
                onDelete={() => delPizza(p.id)}
              />
            ))}

            {/* ---- Empâtement ---- */}
            {activeTab === "empatement" && (empDs.data ?? []).map(r => (
              <RecipeRow
                key={r.id}
                name={r.name}
                sub={`${r.type} · ${new Date(r.created_at).toLocaleDateString("fr-FR")}`}
                color={activeColor}
                onOpen={() => router.push(`/recipes/${r.id}`)}
                onDelete={() => delEmp(r.id, r.name)}
              />
            ))}

            {/* ---- Cuisine ---- */}
            {activeTab === "cuisine" && (cuisineDs.data ?? []).map(r => {
              const hasCpkg = r.cost_per_kg != null && r.cost_per_kg > 0;
              const hasCportion = r.cost_per_portion != null && r.cost_per_portion > 0;
              const cost = hasCpkg
                ? fmtMoney(r.cost_per_kg!) + " €"
                : hasCportion ? fmtMoney(r.cost_per_portion!) + " €" : undefined;
              const costLabel = hasCpkg ? "/kg" : hasCportion ? "/portion" : undefined;
              return (
                <RecipeRow
                  key={r.id}
                  name={r.name ?? "Recette"}
                  cost={cost}
                  costLabel={costLabel}
                  color={activeColor}
                  onOpen={() => router.push(`/kitchen/${r.id}`)}
                  onDelete={() => delCuisine(r.id)}
                />
              );
            })}

            {/* ---- Préparations ---- */}
            {activeTab === "pivot" && (pivotDs.data ?? []).map(r => (
              <RecipeRow
                key={r.id}
                name={r.name}
                sub={`pivot · ${r.pivot_unit} · ${new Date(r.created_at).toLocaleDateString("fr-FR")}`}
                color={activeColor}
                onOpen={() => router.push(`/prep/${r.id}`)}
                onDelete={() => delPivot(r.id, r.name)}
              />
            ))}

            {/* ---- Cocktail ---- */}
            {activeTab === "cocktail" && (cocktailDs.data ?? []).map(c => (
              <RecipeRow
                key={c.id}
                name={c.name ?? "Cocktail"}
                sub={c.type ? COCKTAIL_TYPE_LABELS[c.type] ?? c.type : undefined}
                cost={c.total_cost != null && c.total_cost > 0 ? fmtMoney(c.total_cost) + " €" : undefined}
                color={activeColor}
                onOpen={() => router.push(`/cocktails/${c.id}`)}
                onDelete={() => delCocktail(c.id)}
              />
            ))}

          </div>
        </div>
      )}
    </main>
  );
}

export default function RecettesPage() {
  return (
    <Suspense
      fallback={
        <main className="container">
          <TopNav title="Recettes" subtitle="Chargement…" />
        </main>
      }
    >
      <RecettesInner />
    </Suspense>
  );
}
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
  { id: "pizza",      label: "🍕 Pizza",        color: POLE_COLORS.pizza },
  { id: "empatement", label: "🥖 Empâtement",   color: POLE_COLORS["empâtement"] },
  { id: "cuisine",    label: "🍳 Cuisine",       color: POLE_COLORS.cuisine },
  { id: "pivot",      label: "🫙 Préparations",  color: POLE_COLORS.pivot },
  { id: "cocktail",   label: "🍹 Cocktail",      color: POLE_COLORS.cocktail },
] as const;
type TabId = (typeof TABS)[number]["id"];

const COCKTAIL_TYPE_LABELS: Record<string, string> = {
  long_drink: "Long drink", short_drink: "Short drink",
  shot: "Shot", mocktail: "Mocktail", signature: "Signature",
};

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- Inner component (needs Suspense for useSearchParams) -----------------

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

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthState(data.user ? "ok" : "notlogged");
    });
  }, []);

  // Load functions (stable — only depend on their own state setter)
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

  // Load current tab when auth ready or tab changes
  useEffect(() => {
    if (authState !== "ok") return;
    maybeLoad(activeTab);
  }, [activeTab, authState, maybeLoad]);

  const refresh = useCallback(() => {
    loaded.current.delete(activeTab);
    maybeLoad(activeTab);
  }, [activeTab, maybeLoad]);

  // Create empâtement (inline)
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

  // Delete functions
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

  // ---- Early returns -----

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

  // ---- Derived values -----

  const activeColor = TABS.find(t => t.id === activeTab)!.color;
  const activeDs    = activeTab === "pizza" ? pizzaDs
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

  // ---- Render -----

  return (
    <main className="container">
      <TopNav title="Recettes" subtitle={subtitle} />

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "2px solid #e5e5e5", marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => router.push(`/recettes?tab=${tab.id}`)}
            style={{
              padding: "10px 16px", background: "none", cursor: "pointer", fontSize: 14,
              fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? tab.color : "#555",
              borderWidth: "0 0 3px 0", borderStyle: "solid",
              borderColor: activeTab === tab.id ? tab.color : "transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {createBtn}
        <button className="btn" onClick={refresh}>Rafraîchir</button>
      </div>

      {empCreateErr && <p style={{ color: "red", marginBottom: 12 }}>{empCreateErr}</p>}

      {/* Loading / error states */}
      {activeDs.status === "loading" && <p className="muted">Chargement…</p>}
      {activeDs.status === "error" && (
        <pre className="errorBox">{JSON.stringify(activeDs.error, null, 2)}</pre>
      )}

      {/* ---- Pizza ---- */}
      {activeTab === "pizza" && pizzaDs.status === "ok" && (
        (pizzaDs.data ?? []).length === 0
          ? <p className="muted">Aucune fiche pizza créée.</p>
          : (
            <div className="card" style={{ borderLeft: `4px solid ${activeColor}` }}>
              <div style={{ display: "grid", gap: 10 }}>
                {(pizzaDs.data ?? []).map(p => (
                  <div key={p.id} className="listRow">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{p.name ?? "Pizza"}</div>
                      {p.total_cost != null && p.total_cost > 0 && (
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtMoney(p.total_cost)} €</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn btnPrimary" onClick={() => router.push(`/pizzas/${p.id}`)}>Ouvrir</button>
                      <button className="btn btnDanger" onClick={() => delPizza(p.id)}>Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
      )}

      {/* ---- Empâtement ---- */}
      {activeTab === "empatement" && empDs.status === "ok" && (
        (empDs.data ?? []).length === 0
          ? <p className="muted">Aucun empâtement créé.</p>
          : (
            <div className="card" style={{ borderLeft: `4px solid ${activeColor}` }}>
              <div style={{ display: "grid", gap: 10 }}>
                {(empDs.data ?? []).map(r => (
                  <div key={r.id} className="listRow" style={{ alignItems: "center" }}>
                    <div style={{ cursor: "pointer" }} onClick={() => router.push(`/recipes/${r.id}`)}>
                      <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{r.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {r.type} • {new Date(r.created_at).toLocaleString("fr-FR")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn btnPrimary" onClick={() => router.push(`/recipes/${r.id}`)}>Ouvrir</button>
                      <button className="btn btnDanger" onClick={() => delEmp(r.id, r.name)}>Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
      )}

      {/* ---- Cuisine ---- */}
      {activeTab === "cuisine" && cuisineDs.status === "ok" && (
        (cuisineDs.data ?? []).length === 0
          ? <p className="muted">Aucune fiche cuisine créée.</p>
          : (
            <div className="card" style={{ borderLeft: `4px solid ${activeColor}` }}>
              <div style={{ display: "grid", gap: 10 }}>
                {(cuisineDs.data ?? []).map(r => (
                  <div key={r.id} className="listRow">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{r.name ?? "Recette"}</div>
                      {r.category === "cocktail"
                        ? r.total_cost != null && r.total_cost > 0 && (
                            <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtMoney(r.total_cost)} €</div>
                          )
                        : (r.cost_per_kg != null && r.cost_per_kg > 0) || (r.cost_per_portion != null && r.cost_per_portion > 0)
                          ? (
                            <div style={{ fontSize: 16, fontWeight: 800 }}>
                              {r.cost_per_kg != null && r.cost_per_kg > 0 ? `${fmtMoney(r.cost_per_kg)} €/kg` : null}
                              {r.cost_per_kg != null && r.cost_per_kg > 0 && r.cost_per_portion != null && r.cost_per_portion > 0 ? " · " : null}
                              {r.cost_per_portion != null && r.cost_per_portion > 0 ? `${fmtMoney(r.cost_per_portion)} €/portion` : null}
                            </div>
                          )
                          : null
                      }
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn btnPrimary" onClick={() => router.push(`/kitchen/${r.id}`)}>Ouvrir</button>
                      <button className="btn btnDanger" onClick={() => delCuisine(r.id)}>Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
      )}

      {/* ---- Préparations (pivot) ---- */}
      {activeTab === "pivot" && pivotDs.status === "ok" && (
        (pivotDs.data ?? []).length === 0
          ? <p className="muted">Aucune recette pivot créée.</p>
          : (
            <div className="card" style={{ borderLeft: `4px solid ${activeColor}` }}>
              <div style={{ display: "grid", gap: 10 }}>
                {(pivotDs.data ?? []).map(r => (
                  <div key={r.id} className="listRow" style={{ alignItems: "center" }}>
                    <div style={{ cursor: "pointer" }} onClick={() => router.push(`/prep/${r.id}`)}>
                      <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{r.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        pivot : {r.pivot_unit} • {new Date(r.created_at).toLocaleString("fr-FR")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn btnPrimary" onClick={() => router.push(`/prep/${r.id}`)}>Ouvrir</button>
                      <button className="btn btnDanger" onClick={() => delPivot(r.id, r.name)}>Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
      )}

      {/* ---- Cocktail ---- */}
      {activeTab === "cocktail" && cocktailDs.status === "ok" && (
        (cocktailDs.data ?? []).length === 0
          ? <p className="muted">Aucun cocktail créé.</p>
          : (
            <div className="card" style={{ borderLeft: `4px solid ${activeColor}` }}>
              <div style={{ display: "grid", gap: 10 }}>
                {(cocktailDs.data ?? []).map(c => (
                  <div key={c.id} className="listRow">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{c.name ?? "Cocktail"}</div>
                      {c.type && (
                        <div style={{ fontSize: 12, color: "#777", fontWeight: 500 }}>
                          {COCKTAIL_TYPE_LABELS[c.type] ?? c.type}
                        </div>
                      )}
                      {c.total_cost != null && c.total_cost > 0 && (
                        <div style={{ fontSize: 15, fontWeight: 800 }}>
                          {fmtMoney(c.total_cost)} €
                          {c.sell_price != null && c.sell_price > 0 && (
                            <span style={{ fontSize: 12, fontWeight: 400, color: "#777", marginLeft: 6 }}>
                              · vente {fmtMoney(c.sell_price)} €
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn btnPrimary" onClick={() => router.push(`/cocktails/${c.id}`)}>Ouvrir</button>
                      <button className="btn btnDanger" onClick={() => delCocktail(c.id)}>Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
      )}
    </main>
  );
}

// --- Export (Suspense required for useSearchParams in App Router) ----------

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

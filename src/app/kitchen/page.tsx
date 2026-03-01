"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";
import { POLE_COLORS } from "@/lib/poleColors";

type KitchenRecipeRow = {
  id: string;
  name: string | null;
  category: string | null;
  yield_grams: number | null;
  portions_count: number | null;
  total_cost: number | null;
  cost_per_kg: number | null;
  cost_per_portion: number | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  is_draft: boolean;
};

function displayName(name: string | null | undefined) {
  const n = String(name ?? "").trim();
  return n ? n : "Recette";
}

export default function KitchenPage() {
  const router = useRouter();

  const [state, setState] = useState<{
    status: "loading" | "NOT_LOGGED" | "OK" | "ERROR";
    recipes?: KitchenRecipeRow[];
    error?: unknown;
  }>({ status: "loading" });

  const load = async () => {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      setState({ status: "ERROR", error: authErr });
      return;
    }
    if (!auth.user) {
      setState({ status: "NOT_LOGGED" });
      return;
    }

    const { data, error } = await supabase
      .from("kitchen_recipes")
      .select("id,name,category,yield_grams,portions_count,total_cost,cost_per_kg,cost_per_portion,created_at,updated_at,user_id,is_draft")
      .eq("is_draft", false)
      .order("updated_at", { ascending: false });

    if (error) {
      setState({ status: "ERROR", error });
      return;
    }

    setState({ status: "OK", recipes: (data ?? []) as KitchenRecipeRow[] });
  };

    useEffect(() => {
    let cancelled = false;

    (async () => {
      if (cancelled) return;
      await load();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const del = async (id: string) => {
    const ok = window.confirm("Supprimer cette fiche cuisine ?");
    if (!ok) return;

    const { error } = await supabase.from("kitchen_recipes").delete().eq("id", id);
    if (error) {
      setState((p) => ({ ...p, status: "ERROR", error }));
      return;
    }

    setState((p) => ({
      ...p,
      recipes: (p.recipes ?? []).filter((x) => x.id !== id),
    }));
  };

  const recipes = state.recipes ?? [];

  if (state.status === "loading") {
    return (
      <main className="container">
        <TopNav title="Fiches cuisine" subtitle="Chargement…" />
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  if (state.status === "NOT_LOGGED") {
    return (
      <main className="container">
        <TopNav title="Fiches cuisine" />
        <p className="muted">NOT_LOGGED</p>
        <Link className="btn btnPrimary" href="/login">
          Aller sur /login
        </Link>
      </main>
    );
  }

  if (state.status === "ERROR") {
    return (
      <main className="container">
        <TopNav title="Fiches cuisine" subtitle="Erreur" />
        <pre className="errorBox">{JSON.stringify(state.error, null, 2)}</pre>
      </main>
    );
  }

  return (
    <main className="container">
      <TopNav title="Fiches cuisine" subtitle={`${recipes.length} fiche(s)`} />

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <Link className="btn btnPrimary" href="/kitchen/new">
          Nouvelle fiche
        </Link>
        <button className="btn" type="button" onClick={() => load()}>
          Rafraîchir
        </button>
      </div>

      {recipes.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          Aucune fiche cuisine créée.
        </p>
      ) : (
        <div className="card" style={{ marginTop: 12, borderLeft: `4px solid ${POLE_COLORS.cuisine}` }}>
          <div style={{ display: "grid", gap: 10 }}>
            {recipes.map((r) => (
              <div key={r.id} className="listRow">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{displayName(r.name)}</div>
                    {r.category === "cocktail"
                      ? r.total_cost != null && r.total_cost > 0 && (
                          <div style={{ fontSize: 16, fontWeight: 800 }}>
                            {r.total_cost.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                          </div>
                        )
                      : (r.cost_per_kg != null && r.cost_per_kg > 0) || (r.cost_per_portion != null && r.cost_per_portion > 0)
                        ? (
                          <div style={{ fontSize: 16, fontWeight: 800 }}>
                            {r.cost_per_kg != null && r.cost_per_kg > 0
                              ? `${r.cost_per_kg.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg`
                              : null}
                            {r.cost_per_kg != null && r.cost_per_kg > 0 && r.cost_per_portion != null && r.cost_per_portion > 0 ? " · " : null}
                            {r.cost_per_portion != null && r.cost_per_portion > 0
                              ? `${r.cost_per_portion.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/portion`
                              : null}
                          </div>
                        )
                        : null
                    }
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btnPrimary" onClick={() => router.push(`/kitchen/${r.id}`)}>
                    Ouvrir
                  </button>
                  <button className="btn btnDanger" onClick={() => del(r.id)}>
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
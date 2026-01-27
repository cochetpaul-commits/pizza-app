"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";

type KitchenRecipeRow = {
  id: string;
  name: string | null;
  yield_grams: number | null;
  portions_count: number | null;
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
    error?: any;
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
      .select("id,name,yield_grams,portions_count,created_at,updated_at,user_id,is_draft")
      .eq("is_draft", false)
      .order("updated_at", { ascending: false });

    if (error) {
      setState({ status: "ERROR", error });
      return;
    }

    setState({ status: "OK", recipes: (data ?? []) as KitchenRecipeRow[] });
  };

  useEffect(() => {
    void load();
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
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "grid", gap: 10 }}>
            {recipes.map((r) => (
              <div key={r.id} className="listRow">
                <div>
                  <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{displayName(r.name)}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {new Date(r.updated_at).toLocaleString("fr-FR")}
                    {" · "}
                    Rendement: {r.yield_grams ?? 0} g
                    {" · "}
                    Portions: {r.portions_count ?? 0}
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
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";
import { POLE_COLORS } from "@/lib/poleColors";

type RecipeRow = {
  id: string;
  name: string;
  type: string;
  created_at: string;
  user_id: string;
};
type CreateErr = { message: string; details?: unknown };
type PgError = { code?: string; message?: string };
type InsertedId = { id: string };
type FlourMixItem = { name: string; percent: number; ingredient_id: string | null };

export default function RecipesPage() {
  const router = useRouter();

  const [state, setState] = useState<{
    status: "loading" | "NOT_LOGGED" | "OK" | "ERROR";
    recipes?: RecipeRow[];
    error?: unknown;
  }>({ status: "loading" });

  const [creatingNew, setCreatingNew] = useState(false);
  const [createError, setCreateError] = useState<CreateErr | null>(null);

  const load = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setState({ status: "NOT_LOGGED" });
      return;
    }

    const { data, error } = await supabase
      .from("recipes")
      .select("id,name,type,created_at,user_id")
      .order("created_at", { ascending: false });

    if (error) {
      setState({ status: "ERROR", error });
      return;
    }

    setState({ status: "OK", recipes: (data ?? []) as RecipeRow[] });
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

  const createNewRecipe = async () => {
    setCreateError(null);
    setCreatingNew(true);

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_LOGGED");

      const now = new Date();
      const autoName = `Empâtement ${now.toLocaleDateString("fr-FR")} ${now.toLocaleTimeString("fr-FR").slice(0, 5)}`;

      const payload: Record<string, unknown> = {
        name: autoName,
        type: "biga",
        hydration_total: 65,
        salt_percent: 2,
        honey_percent: 0,
        oil_percent: 0,
        flour_mix: [
          { name: "Tipo 00", percent: 80, ingredient_id: null },
          { name: "Tipo 1", percent: 20, ingredient_id: null },
        ] satisfies FlourMixItem[],
        yeast_percent: 0,
        biga_yeast_percent: 0,
        user_id: auth.user.id,
      };

      const { data, error } = await supabase.from("recipes").insert(payload).select("id").single<InsertedId>();
      if (error) throw error;
      if (!data?.id) throw new Error("ID manquant après création");

      router.push(`/recipes/${data.id}`);
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : (e as PgError)?.message ?? "Erreur création";
      setCreateError({ message: msg, details: e });
    } finally {
      setCreatingNew(false);
    }
  };

  const del = async (id: string, name: string) => {
    const ok = window.confirm(`Supprimer cet empâtement ?\n\n${name}`);
    if (!ok) return;

    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) {
      setState((p) => ({ ...p, status: "ERROR", error }));
      return;
    }

    setState((p) => ({
      ...p,
      recipes: (p.recipes ?? []).filter((x) => x.id !== id),
    }));
  };

  const topActions = (
    <button className="btn btnPrimary" onClick={createNewRecipe} disabled={creatingNew}>
      {creatingNew ? "Création…" : "Nouvel empâtement"}
    </button>
  );

  if (state.status === "loading") {
    return (
      <main className="container">
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  if (state.status === "NOT_LOGGED") {
    return (
      <main className="container">
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
        <TopNav title="Empâtements" subtitle="Création et suivi de tes pâtes" actions={topActions} />
        <pre className="errorBox">{JSON.stringify(state.error, null, 2)}</pre>
      </main>
    );
  }

  const recipes = state.recipes ?? [];

  return (
    <main className="container">
      <TopNav title="Empâtements" subtitle="Clique sur un empâtement pour l’ouvrir" actions={topActions} />

      {createError ? (
        <pre className="code" style={{ marginTop: 12 }}>
          {JSON.stringify(createError, null, 2)}
        </pre>
      ) : null}

      {recipes.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          Aucun empâtement créé.
        </p>
      ) : (
        <div className="card" style={{ marginTop: 12, borderLeft: `4px solid ${POLE_COLORS["empâtement"]}` }}>
          <div className="muted" style={{ marginBottom: 10 }}>
            {recipes.length} empâtement(s)
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {recipes.map((r) => (
              <div key={r.id} className="listRow" style={{ alignItems: "center" }}>
                <div style={{ cursor: "pointer" }} onClick={() => router.push(`/recipes/${r.id}`)}>
                  <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.type} • {new Date(r.created_at).toLocaleString("fr-FR")}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btnPrimary" onClick={() => router.push(`/recipes/${r.id}`)}>
                    Ouvrir
                  </button>
                  <button className="btn btnDanger" onClick={() => del(r.id, r.name)}>
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
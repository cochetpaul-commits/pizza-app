"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";

type PrepRecipeRow = {
  id: string;
  name: string;
  pivot_unit: string;
  created_at: string;
};

export default function PrepRecipesPage() {
  const router = useRouter();
  const [state, setState] = useState<{
    status: "loading" | "NOT_LOGGED" | "OK" | "ERROR";
    rows?: PrepRecipeRow[];
    error?: unknown;
  }>({ status: "loading" });

  const load = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setState({ status: "NOT_LOGGED" });
      return;
    }

    const { data, error } = await supabase
      .from("prep_recipes")
      .select("id,name,pivot_unit,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setState({ status: "ERROR", error });
      return;
    }

    setState({ status: "OK", rows: (data ?? []) as PrepRecipeRow[] });
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

  const del = async (id: string, name: string) => {
    const ok = window.confirm(`Supprimer cette recette pivot ?\n\n${name}`);
    if (!ok) return;

    const { error } = await supabase.from("prep_recipes").delete().eq("id", id);
    if (error) {
      setState((p) => ({ ...p, status: "ERROR", error }));
      return;
    }

    setState((p) => ({
      ...p,
      rows: (p.rows ?? []).filter((x) => x.id !== id),
    }));
  };

  const newAction = (
    <button className="btn btnPrimary" onClick={() => router.push("/prep/new")}>
      Nouvelle recette pivot
    </button>
  );

  if (state.status === "loading") {
    return (
      <main className="container">
        <TopNav title="Recettes pivot" />
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  if (state.status === "NOT_LOGGED") {
    return (
      <main className="container">
        <TopNav title="Recettes pivot" />
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
        <TopNav title="Recettes pivot" subtitle="Erreur" actions={newAction} />
        <pre className="errorBox">{JSON.stringify(state.error, null, 2)}</pre>
      </main>
    );
  }

  const rows = state.rows ?? [];

  return (
    <main className="container">
      <TopNav
        title="Recettes pivot"
        subtitle={`${rows.length} recette(s)`}
        actions={newAction}
      />

      {rows.length === 0 ? (
        <p className="muted">Aucune recette pivot créée.</p>
      ) : (
        <div className="card">
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((r) => (
              <div key={r.id} className="listRow" style={{ alignItems: "center" }}>
                <div style={{ cursor: "pointer" }} onClick={() => router.push(`/prep/${r.id}`)}>
                  <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    pivot : {r.pivot_unit} • {new Date(r.created_at).toLocaleString("fr-FR")}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btnPrimary" onClick={() => router.push(`/prep/${r.id}`)}>
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

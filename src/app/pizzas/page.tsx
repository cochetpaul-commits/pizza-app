"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";
import { POLE_COLORS } from "@/lib/poleColors";

type PizzaRow = {
  id: string;
  name: string | null;
  dough_recipe_id: string | null;
  notes: string | null;
  created_at: string;
  user_id: string;
  is_draft: boolean;
  total_cost: number | null;
};

function displayName(name: string | null | undefined) {
  const n = String(name ?? "").trim();
  return n || "Pizza";
}

export default function PizzasPage() {
  const router = useRouter();

  const [state, setState] = useState<{
    status: "loading" | "NOT_LOGGED" | "OK" | "ERROR";
    pizzas?: PizzaRow[];
    error?: unknown;
  }>({ status: "loading" });

  useEffect(() => {
    const run = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setState({ status: "NOT_LOGGED" });
        return;
      }

      const { data, error } = await supabase
        .from("pizza_recipes")
        .select("id,name,dough_recipe_id,notes,created_at,user_id,total_cost")
        .eq("is_draft", false)
        .order("created_at", { ascending: false });

      if (error) {
        setState({ status: "ERROR", error });
        return;
      }

      setState({ status: "OK", pizzas: (data ?? []) as PizzaRow[] });
    };

    run();
  }, []);

  const del = async (id: string) => {
    const ok = window.confirm("Supprimer cette fiche pizza ?");
    if (!ok) return;

    const { error } = await supabase.from("pizza_recipes").delete().eq("id", id);
    if (error) {
      setState((p) => ({ ...p, status: "ERROR", error }));
      return;
    }

    setState((p) => ({
      ...p,
      pizzas: (p.pizzas ?? []).filter((x) => x.id !== id),
    }));
  };

  if (state.status === "loading") {
    return (
      <main className="container">
        <TopNav title="Fiches pizza" subtitle="Chargement…" />
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  if (state.status === "NOT_LOGGED") {
    return (
      <main className="container">
        <TopNav title="Fiches pizza" />
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
        <TopNav title="Fiches pizza" subtitle="Erreur" />
        <pre className="errorBox">{JSON.stringify(state.error, null, 2)}</pre>
      </main>
    );
  }

  const pizzas = state.pizzas ?? [];

  return (
    <main className="container">
      <TopNav
        title="Fiches pizza"
        subtitle={`${pizzas.length} fiche(s)`}
        actions={
          <button className="btn btnPrimary" onClick={() => router.push("/pizzas/new")}>
            Nouvelle pizza
          </button>
        }
      />

      {pizzas.length === 0 ? (
        <p className="muted">Aucune fiche pizza créée.</p>
      ) : (
        <div className="card" style={{ marginTop: 12, borderLeft: `4px solid ${POLE_COLORS.pizza}` }}>
          <div style={{ display: "grid", gap: 10 }}>
            {pizzas.map((p) => (
              <div key={p.id} className="listRow">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{displayName(p.name)}</div>
                    {p.total_cost != null && p.total_cost > 0 && (
                      <div style={{ fontSize: 16, fontWeight: 800 }}>
                        {p.total_cost.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btnPrimary" onClick={() => router.push(`/pizzas/${p.id}`)}>
                    Ouvrir
                  </button>
                  <button className="btn btnDanger" onClick={() => del(p.id)}>
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
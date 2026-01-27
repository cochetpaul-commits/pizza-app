"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";

type PizzaRow = {
  id: string;
  name: string | null;
  dough_recipe_id: string | null;
  notes: string | null;
  created_at: string;
  user_id: string;
};

function isDraftName(name: string | null | undefined) {
  const n = String(name ?? "").trim();
  if (!n) return true;
  return n.toLowerCase() === "pizza (à nommer)";
}

function displayName(name: string | null | undefined) {
  const n = String(name ?? "").trim();
  if (!n || n.toLowerCase() === "pizza (à nommer)") return "Pizza (à nommer)";
  return n;
}

export default function PizzasPage() {
  const router = useRouter();

  const [state, setState] = useState<{
    status: "loading" | "NOT_LOGGED" | "OK" | "ERROR";
    pizzas?: PizzaRow[];
    error?: any;
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
        .select("id,name,dough_recipe_id,notes,created_at,user_id")
        .neq("name", "Pizza (à nommer)")
        .neq("name", "")
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

  const pizzas = useMemo(() => {
    return (state.pizzas ?? []).filter((p) => !isDraftName(p.name));
  }, [state.pizzas]);

  const split = useMemo(() => {
    return { real: pizzas, drafts: [] as PizzaRow[] };
  }, [pizzas]);

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

  return (
    <main className="container">
      <TopNav title="Fiches pizza" subtitle={`${split.real.length} fiche(s)`} />

      {split.real.length === 0 ? (
        <p className="muted">Aucune fiche pizza créée.</p>
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "grid", gap: 10 }}>
            {split.real.map((p) => (
              <div key={p.id} className="listRow">
                <div>
                  <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{displayName(p.name)}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {new Date(p.created_at).toLocaleString("fr-FR")}
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
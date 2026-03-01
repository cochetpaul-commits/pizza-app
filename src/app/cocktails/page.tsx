"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";
import { POLE_COLORS } from "@/lib/poleColors";

type CocktailRow = {
  id: string;
  name: string | null;
  type: string | null;
  glass: string | null;
  total_cost: number | null;
  sell_price: number | null;
  created_at: string;
  updated_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  long_drink: "Long drink",
  short_drink: "Short drink",
  shot: "Shot",
  mocktail: "Mocktail",
  signature: "Signature",
};

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CocktailsPage() {
  const router = useRouter();

  const [state, setState] = useState<{
    status: "loading" | "NOT_LOGGED" | "OK" | "ERROR";
    cocktails?: CocktailRow[];
    error?: unknown;
  }>({ status: "loading" });

  const load = async () => {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) { setState({ status: "ERROR", error: authErr }); return; }
    if (!auth.user) { setState({ status: "NOT_LOGGED" }); return; }

    const { data, error } = await supabase
      .from("cocktails")
      .select("id,name,type,glass,total_cost,sell_price,created_at,updated_at")
      .eq("is_draft", false)
      .order("updated_at", { ascending: false });

    if (error) { setState({ status: "ERROR", error }); return; }
    setState({ status: "OK", cocktails: (data ?? []) as CocktailRow[] });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await load(); })();
    return () => { cancelled = true; };
  }, []);

  const del = async (id: string) => {
    if (!window.confirm("Supprimer ce cocktail ?")) return;
    const { error } = await supabase.from("cocktails").delete().eq("id", id);
    if (error) { setState((p) => ({ ...p, status: "ERROR", error })); return; }
    setState((p) => ({ ...p, cocktails: (p.cocktails ?? []).filter((x) => x.id !== id) }));
  };

  const cocktails = state.cocktails ?? [];

  if (state.status === "loading") {
    return (
      <main className="container">
        <TopNav title="Cocktails" subtitle="Chargement…" />
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  if (state.status === "NOT_LOGGED") {
    return (
      <main className="container">
        <TopNav title="Cocktails" />
        <Link className="btn btnPrimary" href="/login">Se connecter</Link>
      </main>
    );
  }

  if (state.status === "ERROR") {
    return (
      <main className="container">
        <TopNav title="Cocktails" subtitle="Erreur" />
        <pre className="errorBox">{JSON.stringify(state.error, null, 2)}</pre>
      </main>
    );
  }

  return (
    <main className="container">
      <TopNav title="Cocktails" subtitle={`${cocktails.length} cocktail(s)`} />

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <Link className="btn btnPrimary" href="/cocktails/new">
          Nouveau cocktail
        </Link>
        <button className="btn" type="button" onClick={() => load()}>
          Rafraîchir
        </button>
      </div>

      {cocktails.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>Aucun cocktail créé.</p>
      ) : (
        <div className="card" style={{ marginTop: 12, borderLeft: `4px solid ${POLE_COLORS.cocktail}` }}>
          <div style={{ display: "grid", gap: 10 }}>
            {cocktails.map((c) => (
              <div key={c.id} className="listRow">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, textTransform: "uppercase" }}>
                      {c.name ?? "Cocktail"}
                    </div>
                    {c.type && (
                      <div style={{ fontSize: 12, color: "#777", fontWeight: 500 }}>
                        {TYPE_LABELS[c.type] ?? c.type}
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
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btnPrimary" onClick={() => router.push(`/cocktails/${c.id}`)}>
                    Ouvrir
                  </button>
                  <button className="btn btnDanger" onClick={() => del(c.id)}>
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

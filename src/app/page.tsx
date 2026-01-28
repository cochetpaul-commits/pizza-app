"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const [status, setStatus] = useState<"loading" | "anon" | "ok">("loading");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setStatus("anon");
        return;
      }
      setEmail(data.user.email ?? "");
      setStatus("ok");
    };
    run();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <main className="container">
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div />

        <div style={{ textAlign: "center" }}>
          <h1 className="h1" style={{ margin: 0, letterSpacing: 0.2 }}>
            ifratelligroup
          </h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            Dashboard
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {status === "ok" ? (
            <button className="btn" type="button" onClick={signOut}>
              Déconnexion
            </button>
          ) : (
            <Link className="btn btnPrimary" href="/login">
              Se connecter
            </Link>
          )}
        </div>
      </div>

      {status === "loading" ? <p className="muted">Chargement…</p> : null}

      {status === "anon" ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ margin: 0 }}>
            Connecte-toi pour accéder aux fiches.
          </p>
        </div>
      ) : null}

      {status === "ok" ? (
        <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
          {/* PIZZA */}
          <div className="card" style={{ paddingTop: 18 }}>
            <p className="cardTitle" style={{ textAlign: "center", marginBottom: 6, letterSpacing: 1 }}>
              PIZZA
            </p>
            <p className="muted" style={{ marginTop: 0, textAlign: "center" }}>
              Recettes pizza
            </p>

            <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link className="btn btnPrimary btnWide" href="/pizzas/new">
                Créer pizza
              </Link>
              <Link className="btn btnWide" href="/pizzas">
                Fiches recettes
              </Link>
            </div>
          </div>

          {/* EMPÂTEMENT */}
          <div className="card" style={{ paddingTop: 18 }}>
            <p className="cardTitle" style={{ textAlign: "center", marginBottom: 6, letterSpacing: 1 }}>
              EMPÂTEMENT
            </p>
            <p className="muted" style={{ marginTop: 0, textAlign: "center" }}>
              Fiches techniques empâtement
            </p>

            <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link className="btn btnPrimary btnWide" href="/recipes/new">
                Créer empâtement
              </Link>
              <Link className="btn btnWide" href="/recipes">
                Fiches techniques
              </Link>
            </div>
          </div>

          {/* PREP (recettes pivot) */}
          <div className="card" style={{ paddingTop: 18 }}>
            <p className="cardTitle" style={{ textAlign: "center", marginBottom: 6, letterSpacing: 1 }}>
              PRÉPARATIONS
            </p>
            <p className="muted" style={{ marginTop: 0, textAlign: "center" }}>
              Pesto, bolognaise, tiramisu, sauces…
            </p>

            <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link className="btn btnPrimary btnWide" href="/prep/new">
                Créer recette pivot
              </Link>
              <Link className="btn btnWide" href="/prep">
                Recettes pivot
              </Link>
            </div>
          </div>

          {/* CUISINE */}
          <div className="card" style={{ paddingTop: 18 }}>
            <p className="cardTitle" style={{ textAlign: "center", marginBottom: 6, letterSpacing: 1 }}>
              CUISINE
            </p>
            <p className="muted" style={{ marginTop: 0, textAlign: "center" }}>
              Fiches techniques cuisine
            </p>

            <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link className="btn btnPrimary btnWide" href="/kitchen/new">
                Créer fiche cuisine
              </Link>
              <Link className="btn btnWide" href="/kitchen">
                Fiches cuisine
              </Link>
            </div>
          </div>

          {/* INGREDIENTS */}
          <div className="card" style={{ paddingTop: 18 }}>
            <p className="cardTitle" style={{ textAlign: "center", marginBottom: 6, letterSpacing: 1 }}>
              INGRÉDIENTS
            </p>
            <p className="muted" style={{ marginTop: 0, textAlign: "center" }}>
              Index + coûts (€/g, €/ml, €/pc)
            </p>

            <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link className="btn btnPrimary btnWide" href="/ingredients">
                Index ingrédients
              </Link>
            </div>
          </div>

          <p className="muted" style={{ marginTop: 6, textAlign: "center" }}>
            Connecté : {email}
          </p>
        </div>
      ) : null}
    </main>
  );
}
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
      <div className="topbar" style={{ alignItems: "center", marginTop: 10 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>
            Accueil
          </h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Pizza App — dashboard
          </p>
        </div>

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

      {status === "loading" ? <p className="muted">Chargement…</p> : null}

      {status === "anon" ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ margin: 0 }}>
            Connecte-toi pour accéder aux fiches.
          </p>
        </div>
      ) : null}

      {status === "ok" ? (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div className="card">
            <p className="cardTitle">Fiches pizza</p>
            <p className="muted" style={{ marginTop: 6 }}>
              Créer / modifier / PDF
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <Link className="btn btnPrimary" href="/pizzas">
                Ouvrir
              </Link>
              <Link className="btn" href="/pizzas/new">
                Nouvelle fiche
              </Link>
            </div>
          </div>

          <div className="card">
            <p className="cardTitle">Fiches empâtement</p>
            <p className="muted" style={{ marginTop: 6 }}>
              Page unique (nom + pâtons + % + phases biga + PDF)
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <Link className="btn btnPrimary" href="/recipes">
                Ouvrir
              </Link>
              <Link className="btn" href="/recipes/new">
                Nouvel empâtement
              </Link>
            </div>
          </div>

          <p className="muted" style={{ marginTop: 4 }}>
            Connecté : {email}
          </p>
        </div>
      ) : null}
    </main>
  );
}
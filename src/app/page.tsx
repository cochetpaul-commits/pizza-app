"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Counts = {
  recettes: number;
  ingredients: number;
  lastImport: string | null;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
}

export default function Home() {
  const [authState, setAuthState] = useState<"loading" | "ok" | "anon">("loading");
  const [email, setEmail]   = useState("");
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setAuthState("anon"); return; }
      setEmail(data.user.email ?? "");
      setAuthState("ok");

      const [pizza, emp, kitchen, pivot, cocktail, ingredients, lastInvoice] = await Promise.all([
        supabase.from("pizza_recipes").select("*", { count: "exact", head: true }).eq("is_draft", false),
        supabase.from("recipes").select("*", { count: "exact", head: true }),
        supabase.from("kitchen_recipes").select("*", { count: "exact", head: true }).eq("is_draft", false),
        supabase.from("prep_recipes").select("*", { count: "exact", head: true }),
        supabase.from("cocktails").select("*", { count: "exact", head: true }).eq("is_draft", false),
        supabase.from("ingredients").select("*", { count: "exact", head: true }),
        supabase.from("supplier_invoices").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      setCounts({
        recettes: (pizza.count ?? 0) + (emp.count ?? 0) + (kitchen.count ?? 0) + (pivot.count ?? 0) + (cocktail.count ?? 0),
        ingredients: ingredients.count ?? 0,
        lastImport: lastInvoice.data?.created_at ?? null,
      });
    };
    run();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <main className="container" style={{ maxWidth: 640 }}>

      {/* ── En-tête ── */}
      <div style={{
        marginTop: 20,
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 12,
      }}>
        <div />

        <div style={{ textAlign: "center" }}>
          <Image src="/logo.png" alt="iFratelli Group" width={200} height={80}
            style={{ width: 200, height: "auto", mixBlendMode: "multiply" }} />
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 12, letterSpacing: 0.5 }}>
            iFratelli Group
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {authState === "ok" ? (
            <button className="btn" type="button" onClick={signOut}>Déconnexion</button>
          ) : authState === "anon" ? (
            <Link className="btn btnPrimary" href="/login">Se connecter</Link>
          ) : null}
        </div>
      </div>

      {/* ── Non connecté ── */}
      {authState === "anon" && (
        <div className="card" style={{ marginTop: 24, textAlign: "center" }}>
          <p className="muted" style={{ margin: 0 }}>Connecte-toi pour accéder aux fiches.</p>
        </div>
      )}

      {/* ── Connecté ── */}
      {authState === "ok" && (
        <div style={{ marginTop: 28, display: "grid", gap: 16 }}>

          {/* ─── Zone 1 — PRODUCTION ─── */}
          <Link href="/recettes" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card" style={{ borderLeft: "4px solid #8B1A1A", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p className="cardTitle" style={{ marginBottom: 4, letterSpacing: 1, color: "#8B1A1A" }}>
                    RECETTES
                  </p>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    Pizza · Empâtement · Cuisine · Préparations · Cocktail
                  </p>
                </div>
                {counts && (
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: "#8B1A1A", lineHeight: 1 }}>
                      {counts.recettes}
                    </span>
                    <p className="muted" style={{ margin: 0, fontSize: 11 }}>fiches</p>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 14 }}>
                <span className="btn btnPrimary" style={{ background: "#8B1A1A", borderColor: "#8B1A1A" }}>
                  Voir les recettes →
                </span>
              </div>
            </div>
          </Link>

          {/* ─── Zone 2 — GESTION ─── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

            <Link href="/ingredients" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="card" style={{ borderLeft: "4px solid #6B7280", height: "100%", cursor: "pointer" }}>
                <p className="cardTitle" style={{ marginBottom: 4, letterSpacing: 1, color: "#4B5563" }}>
                  INGRÉDIENTS
                </p>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                  Index · Coûts · Prix fournisseurs
                </p>
                {counts && (
                  <p style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 800, color: "#4B5563" }}>
                    {counts.ingredients}
                    <span className="muted" style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>réf.</span>
                  </p>
                )}
              </div>
            </Link>

            <Link href="/invoices" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="card" style={{ borderLeft: "4px solid #6B7280", height: "100%", cursor: "pointer" }}>
                <p className="cardTitle" style={{ marginBottom: 4, letterSpacing: 1, color: "#4B5563" }}>
                  FACTURES
                </p>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                  Import MAEL · Import METRO
                </p>
                {counts && (
                  <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
                    {counts.lastImport
                      ? <>Dernier import<br />{fmtDate(counts.lastImport)}</>
                      : "Aucun import"}
                  </p>
                )}
              </div>
            </Link>
          </div>

          {/* ─── Zone 3 — PILOTAGE (bientôt) ─── */}
          <div className="card" style={{ borderLeft: "4px solid #D1D5DB", opacity: 0.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p className="cardTitle" style={{ marginBottom: 4, letterSpacing: 1, color: "#9CA3AF" }}>
                  PILOTAGE
                </p>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Dashboard · Alertes prix · Inventaire · Fiche de production
                </p>
              </div>
              <span style={{
                background: "#F3F4F6", color: "#9CA3AF",
                fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
                padding: "3px 8px", borderRadius: 10,
                letterSpacing: 0.5, textTransform: "uppercase",
                marginLeft: 12, flexShrink: 0,
              }}>
                Bientôt
              </span>
            </div>
          </div>

          {/* ─── Pied de page ─── */}
          <p className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: 4 }}>
            Connecté : {email}
          </p>

        </div>
      )}
    </main>
  );
}

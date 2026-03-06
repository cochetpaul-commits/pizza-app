"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts } from "@/lib/priceAlerts";

type Counts = {
  recettes: number;
  ingredients: number;
  toCheck: number;
  lastImport: string | null;
  lastImportSupplier: string | null;
  priceAlerts: number;
};

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function Home() {
  const [authState, setAuthState] = useState<"loading" | "ok" | "anon">("loading");
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setAuthState("anon"); return; }
      setAuthState("ok");

      const [pizza, emp, kitchen, pivot, cocktail, ingredients, toCheck, lastInvoice] = await Promise.all([
        supabase.from("pizza_recipes").select("*", { count: "exact", head: true }).eq("is_draft", false),
        supabase.from("recipes").select("*", { count: "exact", head: true }),
        supabase.from("kitchen_recipes").select("*", { count: "exact", head: true }).eq("is_draft", false),
        supabase.from("prep_recipes").select("*", { count: "exact", head: true }),
        supabase.from("cocktails").select("*", { count: "exact", head: true }).eq("is_draft", false),
        supabase.from("ingredients").select("*", { count: "exact", head: true }),
        supabase.from("ingredients").select("*", { count: "exact", head: true }).eq("status", "to_check"),
        supabase.from("supplier_invoices").select("created_at,supplier_name").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      let priceAlerts = 0;
      try {
        const alerts = await fetchPriceAlerts(supabase, data.user.id);
        priceAlerts = alerts.length;
      } catch { /* silencieux */ }

      setCounts({
        recettes: (pizza.count ?? 0) + (emp.count ?? 0) + (kitchen.count ?? 0) + (pivot.count ?? 0) + (cocktail.count ?? 0),
        ingredients: ingredients.count ?? 0,
        toCheck: toCheck.count ?? 0,
        lastImport: lastInvoice.data?.created_at ?? null,
        lastImportSupplier: lastInvoice.data?.supplier_name ?? null,
        priceAlerts,
      });
    };
    run();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <main style={{
      maxWidth: 600,
      margin: "0 auto",
      padding: "12px 16px 20px",
      width: "100%",
      boxSizing: "border-box",
    }}>

      {/* ── Logo ── */}
      <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
        <Image
          src="/logo.png"
          alt="iFratelli Group"
          width={160}
          height={64}
          style={{ width: 160, height: "auto", mixBlendMode: "multiply" }}
          priority
        />
      </div>

      {/* ── Non connecté ── */}
      {authState === "anon" && (
        <div className="card" style={{ marginTop: 20, textAlign: "center" }}>
          <p className="muted" style={{ margin: 0 }}>Connecte-toi pour accéder aux fiches.</p>
          <div style={{ marginTop: 12 }}>
            <Link className="btn btnPrimary" href="/login">Se connecter</Link>
          </div>
        </div>
      )}

      {/* ── Connecté ── */}
      {authState === "ok" && (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>

          {/* ─── ATELIER ─── */}
          <Link href="/recettes" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card" style={{ borderLeft: "4px solid #8B1A1A", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p className="cardTitle" style={{ marginBottom: 3, letterSpacing: 1, color: "#8B1A1A" }}>ATELIER</p>
                  <p className="muted" style={{ margin: 0, fontSize: 12 }}>Pizza · Empâtement · Cuisine · Préparations · Cocktail</p>
                </div>
                {counts && (
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: "#8B1A1A", lineHeight: 1 }}>{counts.recettes}</span>
                    <p className="muted" style={{ margin: 0, fontSize: 11 }}>fiches</p>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                <span className="btn btnPrimary" style={{ background: "#8B1A1A", borderColor: "#8B1A1A" }}>Voir les recettes →</span>
              </div>
            </div>
          </Link>

          {/* ─── CATALOGUE + FACTURES ─── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

            {/* CATALOGUE */}
            <Link href="/ingredients" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="card" style={{ borderLeft: "4px solid #4A6FA5", height: "100%", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <p className="cardTitle" style={{ marginBottom: 3, letterSpacing: 1, color: "#4A6FA5" }}>CATALOGUE</p>
                  {counts && counts.toCheck > 0 && (
                    <span style={{
                      background: "rgba(234,88,12,0.12)", color: "#EA580C",
                      border: "1px solid rgba(234,88,12,0.25)", borderRadius: 8,
                      fontSize: 10, fontWeight: 700, padding: "2px 6px",
                      whiteSpace: "nowrap", flexShrink: 0, marginLeft: 6,
                    }}>
                      {counts.toCheck} ✗
                    </span>
                  )}
                </div>
                <p className="muted" style={{ margin: "2px 0 0", fontSize: 11 }}>Index · Coûts · Prix</p>
                {counts && (
                  <p style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 800, color: "#4A6FA5" }}>
                    {counts.ingredients}
                    <span className="muted" style={{ fontSize: 11, fontWeight: 400, marginLeft: 3 }}>réf.</span>
                  </p>
                )}
                <div style={{ marginTop: 10 }}>
                  <span className="btn" style={{ fontSize: 12, background: "#4A6FA5", borderColor: "#4A6FA5", color: "#fff" }}>
                    Gérer →
                  </span>
                </div>
              </div>
            </Link>

            {/* FACTURES */}
            <Link href="/invoices" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="card" style={{ borderLeft: "4px solid #5C7A4E", height: "100%", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <p className="cardTitle" style={{ marginBottom: 3, letterSpacing: 1, color: "#5C7A4E" }}>FACTURES</p>
                  {counts && counts.priceAlerts > 0 && (
                    <span style={{
                      background: "rgba(220,38,38,0.10)", color: "#DC2626",
                      border: "1px solid rgba(220,38,38,0.25)", borderRadius: 8,
                      fontSize: 10, fontWeight: 700, padding: "2px 6px",
                      whiteSpace: "nowrap", flexShrink: 0, marginLeft: 6,
                    }}>
                      ↑ {counts.priceAlerts}
                    </span>
                  )}
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 11 }}>Import MAEL · METRO</p>
                {counts && (
                  <div style={{ marginTop: 6 }}>
                    {counts.lastImport ? (
                      <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                        <span style={{ fontWeight: 700, color: "#5C7A4E" }}>
                          {counts.lastImportSupplier ? `${counts.lastImportSupplier} · ` : ""}
                          {fmtDateShort(counts.lastImport)}
                        </span>
                      </p>
                    ) : (
                      <p className="muted" style={{ margin: 0, fontSize: 11 }}>Aucun import</p>
                    )}
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <span className="btn" style={{ fontSize: 12, background: "#5C7A4E", borderColor: "#5C7A4E", color: "#fff" }}>
                    Importer →
                  </span>
                </div>
              </div>
            </Link>
          </div>

          {/* ─── PILOTAGE ─── */}
          <div className="card" style={{ borderLeft: "4px solid #92400E" }}>
            <div style={{ marginBottom: 10 }}>
              <p className="cardTitle" style={{ marginBottom: 2, letterSpacing: 1, color: "#92400E" }}>PILOTAGE</p>
              <p className="muted" style={{ margin: 0, fontSize: 11 }}>Mercuriale · Prix Épicerie · Inventaire</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <Link href="/mercuriale" style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ border: "1px solid #E8E0D0", borderLeft: "4px solid #92400E", borderRadius: 8, padding: "10px 10px", cursor: "pointer", background: "#fff", height: "100%" }}>
                  <p className="cardTitle" style={{ marginBottom: 2, fontSize: 10, letterSpacing: 1, color: "#92400E" }}>MERCURIALE</p>
                  <p className="muted" style={{ margin: "0 0 8px", fontSize: 11 }}>Prix · PDF</p>
                  <span className="btn btnPrimary" style={{ fontSize: 11, padding: "4px 10px", background: "#92400E", borderColor: "#92400E" }}>Ouvrir →</span>
                </div>
              </Link>
              <Link href="/epicerie" style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ border: "1px solid #E8E0D0", borderLeft: "4px solid #1E40AF", borderRadius: 8, padding: "10px 10px", cursor: "pointer", background: "#fff", height: "100%" }}>
                  <p className="cardTitle" style={{ marginBottom: 2, fontSize: 10, letterSpacing: 1, color: "#1E40AF" }}>ÉPICERIE</p>
                  <p className="muted" style={{ margin: "0 0 8px", fontSize: 11 }}>Prix vente · CSV</p>
                  <span className="btn btnPrimary" style={{ fontSize: 11, padding: "4px 10px", background: "#1E40AF", borderColor: "#1E40AF" }}>Ouvrir →</span>
                </div>
              </Link>
              <div style={{ border: "1px solid #E8E0D0", borderLeft: "4px solid #D1D5DB", borderRadius: 8, padding: "10px 10px", background: "#fff", opacity: 0.45 }}>
                <p className="cardTitle" style={{ marginBottom: 2, fontSize: 10, letterSpacing: 1, color: "#9CA3AF" }}>INVENTAIRE</p>
                <p className="muted" style={{ margin: "0 0 8px", fontSize: 11 }}>Stocks · Valeur</p>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 10, background: "#F3F4F6", color: "#9CA3AF", letterSpacing: 0.5, textTransform: "uppercase" as const }}>Bientôt</span>
              </div>
            </div>
          </div>

          {/* ─── Déconnexion ─── */}
          <div style={{ textAlign: "center" }}>
            <button className="btn" type="button" onClick={signOut}>Déconnexion</button>
          </div>

        </div>
      )}
    </main>
  );
}

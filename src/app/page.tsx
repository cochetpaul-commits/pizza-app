"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts } from "@/lib/priceAlerts";

type UpcomingEvent = {
  id: string;
  name: string;
  date: string | null;
  status: string;
  covers: number;
};

type Counts = {
  recettes: number;
  ingredients: number;
  toCheck: number;
  lastImport: string | null;
  lastImportSupplier: string | null;
  priceAlerts: number;
  upcomingEvents: UpcomingEvent[];
  suppliers: number;
};

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── Shared card styles ──────────────────────────────────────────────────────

const card = (color: string): React.CSSProperties => ({
  background: "#fff",
  borderRadius: 14,
  borderLeft: `4px solid ${color}`,
  padding: "18px 20px",
  cursor: "pointer",
});

const title = (color: string): React.CSSProperties => ({
  margin: 0,
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: 2,
  textTransform: "uppercase",
  color,
});

const subtitle: React.CSSProperties = {
  margin: "3px 0 0",
  fontSize: 13,
  fontWeight: 500,
  color: "#888",
};

const counter = (color: string): React.CSSProperties => ({
  fontSize: 28,
  fontWeight: 800,
  color,
  lineHeight: 1,
  fontFamily: "var(--font-dm-serif-display), Georgia, serif",
});

const counterSuffix: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 400,
  color: "#999",
  marginLeft: 3,
};

const btn = (color: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "7px 16px",
  borderRadius: 10,
  background: color,
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  border: "none",
  textDecoration: "none",
  whiteSpace: "nowrap",
  flexShrink: 0,
});

const badge = (color: string): React.CSSProperties => ({
  display: "inline-block",
  fontSize: 10,
  fontWeight: 800,
  padding: "2px 7px",
  borderRadius: 6,
  background: `${color}18`,
  color,
  border: `1px solid ${color}40`,
});

// ── Component ───────────────────────────────────────────────────────────────

export default function Home() {
  const [authState, setAuthState] = useState<"loading" | "ok" | "anon">("loading");
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setAuthState("anon"); return; }
      setAuthState("ok");

      const today = new Date().toISOString().slice(0, 10);
      const [pizza, emp, kitchen, pivot, cocktail, ingredients, toCheck, lastInvoice, upcomingEvts, suppCount] = await Promise.all([
        supabase.from("pizza_recipes").select("*", { count: "exact", head: true }).eq("is_draft", false),
        supabase.from("recipes").select("*", { count: "exact", head: true }),
        supabase.from("kitchen_recipes").select("*", { count: "exact", head: true }).eq("is_draft", false),
        supabase.from("prep_recipes").select("*", { count: "exact", head: true }),
        supabase.from("cocktails").select("*", { count: "exact", head: true }).eq("is_draft", false),
        supabase.from("ingredients").select("*", { count: "exact", head: true }),
        supabase.from("ingredients").select("*", { count: "exact", head: true }).eq("status", "to_check"),
        supabase.from("supplier_invoices").select("created_at,supplier_name").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("events").select("id,name,date,status,covers").gte("date", today).not("status", "in", '("termine","annule")').order("date", { ascending: true }).limit(5),
        supabase.from("suppliers").select("*", { count: "exact", head: true }).eq("is_active", true),
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
        upcomingEvents: (upcomingEvts.data ?? []) as UpcomingEvent[],
        suppliers: suppCount.count ?? 0,
      });
    };
    run();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <main className="page-root" style={{
      minHeight: "100dvh",
      background: "#f5f0e8",
      width: "100%",
      boxSizing: "border-box",
    }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 16px 40px" }}>

      {/* ── Logo ── */}
      <div style={{ padding: "28px 0 20px", display: "flex", justifyContent: "center" }}>
        <Image
          src="/logo.png"
          alt="iFratelli Group"
          width={190}
          height={76}
          style={{ width: 190, height: "auto", mixBlendMode: "multiply" }}
          priority
        />
      </div>

      {/* ── Non connecté ── */}
      {authState === "anon" && (
        <div style={{ ...card("#8B1A1A"), textAlign: "center", cursor: "default" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#999" }}>Connecte-toi pour accéder aux fiches.</p>
          <div style={{ marginTop: 12 }}>
            <Link href="/login" style={btn("#8B1A1A")}>Se connecter</Link>
          </div>
        </div>
      )}

      {/* ── Connecté ── */}
      {authState === "ok" && (
        <div style={{ display: "grid", gap: 12 }}>

          {/* ─── ATELIER ─── */}
          <Link href="/recettes" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={card("#8B1A1A")}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={title("#8B1A1A")}>ATELIER</p>
                  <p style={subtitle}>Pizza · Empâtement · Cuisine · Cocktail</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && (
                    <span style={counter("#8B1A1A")}>
                      {counts.recettes}
                      <span style={counterSuffix}>fiches</span>
                    </span>
                  )}
                  <span style={btn("#8B1A1A")}>Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>

          {/* ─── CATALOGUE ─── */}
          <Link href="/ingredients" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={card("#1d4ed8")}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={title("#1d4ed8")}>CATALOGUE</p>
                    {counts && counts.toCheck > 0 && (
                      <span style={badge("#EA580C")}>{counts.toCheck} à vérifier</span>
                    )}
                  </div>
                  <p style={subtitle}>Index · Coûts · Prix</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && (
                    <span style={counter("#1d4ed8")}>
                      {counts.ingredients}
                      <span style={counterSuffix}>réf.</span>
                    </span>
                  )}
                  <span style={btn("#1d4ed8")}>Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>

          {/* ─── FACTURES ─── */}
          <Link href="/invoices" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={card("#4a6741")}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={title("#4a6741")}>FACTURES</p>
                  <p style={subtitle}>Import fournisseurs · Mise à jour prix</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && counts.lastImport && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#4a6741" }}>
                      {counts.lastImportSupplier ? `${counts.lastImportSupplier} · ` : ""}
                      {fmtDateShort(counts.lastImport)}
                    </span>
                  )}
                  <span style={btn("#4a6741")}>Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>

          {/* ─── FOURNISSEURS ─── */}
          <Link href="/fournisseurs" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={card("#7c3aed")}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={title("#7c3aed")}>FOURNISSEURS</p>
                  <p style={subtitle}>Fiches · Coordonnées · Historique</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && (
                    <span style={counter("#7c3aed")}>
                      {counts.suppliers}
                      <span style={counterSuffix}>actifs</span>
                    </span>
                  )}
                  <span style={btn("#7c3aed")}>Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>

          {/* ─── ÉVÉNEMENTS ─── */}
          <Link href="/evenements" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={card("#92400e")}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={title("#92400e")}>ÉVÉNEMENTS</p>
                    {counts && counts.upcomingEvents.length > 0 && (
                      <span style={badge("#92400e")}>{counts.upcomingEvents.length} à venir</span>
                    )}
                  </div>
                  <p style={subtitle}>Mariages · Séminaires · Traiteur</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && counts.upcomingEvents.length > 0 && (
                    <span style={counter("#92400e")}>
                      {counts.upcomingEvents.length}
                      <span style={counterSuffix}>à venir</span>
                    </span>
                  )}
                  <span style={btn("#92400e")}>Ouvrir →</span>
                </div>
              </div>
              {counts && counts.upcomingEvents.length > 0 && (
                <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
                  {counts.upcomingEvents.slice(0, 3).map((ev) => (
                    <div key={ev.id} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 11,
                      padding: "5px 10px",
                      background: "#faf8f4",
                      borderRadius: 8,
                      border: "1px solid #e5ddd0",
                    }}>
                      <span style={{ fontWeight: 700, color: "#2f3a33" }}>{ev.name}</span>
                      <span style={{ fontSize: 10, color: "#999" }}>
                        {ev.date ? fmtDateShort(ev.date) : "—"}
                        {ev.covers > 0 ? ` · ${ev.covers} couv.` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Link>

          {/* ─── PILOTAGE ─── */}
          <Link href="/pilotage" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={card("#1e3a5f")}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={title("#1e3a5f")}>PILOTAGE</p>
                  <p style={subtitle}>Mercuriale · Épicerie · Variations & Alertes</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {counts && counts.priceAlerts > 0 && (
                    <span style={badge("#1e3a5f")}>{counts.priceAlerts}</span>
                  )}
                  <span style={btn("#1e3a5f")}>Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>

        </div>
      )}

      {/* ── Footer ── */}
      {authState === "ok" && (
        <div style={{ textAlign: "center", marginTop: 32, paddingBottom: 20 }}>
          <span
            onClick={signOut}
            style={{
              color: "#aaa",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Déconnexion
          </span>
        </div>
      )}
      </div>
    </main>
  );
}

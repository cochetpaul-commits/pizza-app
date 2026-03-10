"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts } from "@/lib/priceAlerts";
import { useProfile } from "@/lib/ProfileContext";

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

// ── Éditorial Italien — style helpers ───────────────────────────────────────

const titleStyle = (color: string): React.CSSProperties => ({
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color,
});

const subtitleStyle: React.CSSProperties = {
  margin: "3px 0 0",
  fontSize: 13,
  fontWeight: 500,
  color: "#999",
};

const counterStyle = (color: string): React.CSSProperties => ({
  fontSize: 28,
  fontWeight: 600,
  color,
  lineHeight: 1,
  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
});

const counterSuffix: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 400,
  color: "#999",
  marginLeft: 3,
};

const btnStyle = (bg: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "7px 16px",
  borderRadius: 10,
  background: bg,
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  border: "none",
  textDecoration: "none",
  whiteSpace: "nowrap",
  flexShrink: 0,
});

const badgeStyle = (color: string): React.CSSProperties => ({
  display: "inline-block",
  fontSize: 10,
  fontWeight: 700,
  padding: "2px 7px",
  borderRadius: 6,
  background: `${color}18`,
  color,
  border: `1px solid ${color}40`,
});

// ── Card presets per section ────────────────────────────────────────────────

const cardAtelier: React.CSSProperties = {
  background: "#f5ede4",
  borderLeft: "4px solid #D4775A",
  borderRadius: 14,
  padding: "18px 20px",
  cursor: "pointer",
};

const cardCatalogue: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd6c8",
  borderRadius: 14,
  padding: "18px 20px",
  cursor: "pointer",
};

const cardFactures: React.CSSProperties = {
  background: "#e8e0d0",
  borderRadius: 14,
  padding: "18px 20px",
  cursor: "pointer",
};

const cardFournisseurs: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd6c8",
  borderRadius: 14,
  padding: "18px 20px",
  cursor: "pointer",
};

const cardEvenements: React.CSSProperties = {
  background: "#f5ede4",
  borderLeft: "4px solid #D4775A",
  borderRadius: 14,
  padding: "18px 20px",
  cursor: "pointer",
};

const cardPilotage: React.CSSProperties = {
  background: "#e8ede6",
  borderRadius: 14,
  padding: "18px 20px",
  cursor: "pointer",
};

const cardAdmin: React.CSSProperties = {
  background: "#1a1a1a",
  borderRadius: 14,
  padding: "18px 20px",
  cursor: "pointer",
};

// ── Section separator ───────────────────────────────────────────────────────

function SectionSeparator({ label }: { label: string }) {
  return (
    <div className="section-separator" style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      margin: "8px 0 2px",
    }}>
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: "#b0a894",
        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
        whiteSpace: "nowrap",
      }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: "#d5cdbc" }} />
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Home() {
  const [authState, setAuthState] = useState<"loading" | "ok" | "anon">("loading");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [caJour, setCaJour] = useState<number | null>(null);
  const { role, displayName, isAdmin } = useProfile();

  // CA du jour Popina — auto-refresh toutes les 5 min
  useEffect(() => {
    async function fetchCa() {
      try {
        const res = await fetch("/api/popina/ca-jour");
        if (!res.ok) return;
        const d = await res.json();
        setCaJour(typeof d.totalSales === "number" ? d.totalSales : null);
      } catch { /* silencieux */ }
    }
    fetchCa();
    const iv = setInterval(fetchCa, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

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
      background: "#f2ede4",
      width: "100%",
      boxSizing: "border-box",
    }}>
      {/* ── Header crème ── */}
      <div style={{
        background: "#f2ede4",
        padding: "12px 20px",
        marginBottom: 20,
        width: "100vw",
        marginLeft: "calc(-50vw + 50%)",
        borderBottom: "1.5px solid #1a1a1a",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}>
          <Image
            src="/logo-ifratelli.png"
            alt="iFratelli Group"
            width={48}
            height={48}
            style={{ height: 64, width: "auto", objectFit: "contain", mixBlendMode: "multiply" }}
            priority
          />
          <div className="dashboard-header-text" style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}>
            <span style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
              fontSize: 22,
              fontWeight: 600,
              fontStyle: "italic",
              color: "#D4775A",
              lineHeight: 1.1,
            }}>
              iFratelli
            </span>
            <span style={{
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: "#999",
              lineHeight: 1,
            }}>
              GROUP
            </span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 16px 40px" }}>

      {/* ── Non connecté ── */}
      {authState === "anon" && (
        <div style={{ ...cardCatalogue, textAlign: "center", cursor: "default" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#999" }}>Connecte-toi pour accéder aux fiches.</p>
          <div style={{ marginTop: 12 }}>
            <Link href="/login" style={btnStyle("#D4775A")}>Se connecter</Link>
          </div>
        </div>
      )}

      {/* ── Connecté ── */}
      {authState === "ok" && (
        <div style={{ display: "grid", gap: 12 }}>

          {/* ─── ATELIER ─── */}
          <Link href="/recettes" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={cardAtelier}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={titleStyle("#D4775A")}>ATELIER</p>
                  <p style={subtitleStyle}>Pizza · Empâtement · Cuisine · Cocktail</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && (
                    <span style={counterStyle("#D4775A")}>
                      {counts.recettes}
                      <span style={counterSuffix}>fiches</span>
                    </span>
                  )}
                  <span style={btnStyle("#D4775A")}>Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>

          {/* ─── CATALOGUE ─── */}
          <Link href="/ingredients" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={cardCatalogue}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={titleStyle("#D4775A")}>CATALOGUE</p>
                    {counts && counts.toCheck > 0 && (
                      <span style={badgeStyle("#EA580C")}>{counts.toCheck} à vérifier</span>
                    )}
                  </div>
                  <p style={subtitleStyle}>Index · Coûts · Prix</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && (
                    <span style={counterStyle("#D4775A")}>
                      {counts.ingredients}
                      <span style={counterSuffix}>réf.</span>
                    </span>
                  )}
                  <span style={btnStyle("#D4775A")}>Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>

          {/* ── Separator GESTION ── */}
          {role && role !== "cuisine" && <SectionSeparator label="GESTION" />}

          {/* ─── FACTURES (admin/direction only) ─── */}
          {role && role !== "cuisine" && (
          <Link href="/invoices" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={cardFactures}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={titleStyle("#D4775A")}>FACTURES</p>
                  <p style={subtitleStyle}>Import fournisseurs · Mise à jour prix</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && counts.lastImport && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#D4775A" }}>
                      {counts.lastImportSupplier ? `${counts.lastImportSupplier} · ` : ""}
                      {fmtDateShort(counts.lastImport)}
                    </span>
                  )}
                  <span style={btnStyle("#D4775A")}>Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>
          )}

          {/* ─── FOURNISSEURS (admin/direction only) ─── */}
          {role && role !== "cuisine" && (
          <Link href="/fournisseurs" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={cardFournisseurs}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={titleStyle("#D4775A")}>FOURNISSEURS</p>
                  <p style={subtitleStyle}>Fiches · Coordonnées · Historique</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && (
                    <span style={counterStyle("#D4775A")}>
                      {counts.suppliers}
                      <span style={counterSuffix}>actifs</span>
                    </span>
                  )}
                  <span style={btnStyle("#D4775A")}>Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>
          )}

          {/* ─── ÉVÉNEMENTS (admin/direction only) ─── */}
          {role && role !== "cuisine" && (
          <Link href="/evenements" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={cardEvenements}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={titleStyle("#D4775A")}>ÉVÉNEMENTS</p>
                    {counts && counts.upcomingEvents.length > 0 && (
                      <span style={badgeStyle("#D4775A")}>{counts.upcomingEvents.length} à venir</span>
                    )}
                  </div>
                  <p style={subtitleStyle}>Mariages · Séminaires · Traiteur</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && counts.upcomingEvents.length > 0 && (
                    <span style={counterStyle("#D4775A")}>
                      {counts.upcomingEvents.length}
                      <span style={counterSuffix}>à venir</span>
                    </span>
                  )}
                  <span style={btnStyle("#D4775A")}>Ouvrir →</span>
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
          )}

          {/* ─── PILOTAGE (admin/direction only) ─── */}
          {role && role !== "cuisine" && (
          <Link href="/pilotage" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={cardPilotage}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={titleStyle("#4a6741")}>PILOTAGE</p>
                  <p style={subtitleStyle}>Mercuriale · Épicerie · Variations & Alertes</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {caJour !== null && (
                    <span style={counterStyle("#4a6741")}>
                      {caJour.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      <span style={counterSuffix}>€ auj.</span>
                    </span>
                  )}
                  {counts && counts.priceAlerts > 0 && (
                    <span style={badgeStyle("#4a6741")}>{counts.priceAlerts}</span>
                  )}
                  <span style={btnStyle("#4a6741")}>Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>
          )}

          {/* ─── ADMIN (admin only) ─── */}
          {isAdmin && (
          <Link href="/admin/utilisateurs" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={cardAdmin}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={titleStyle("#c9b99a")}>ADMIN</p>
                  <p style={{ ...subtitleStyle, color: "#888" }}>Utilisateurs · Rôles</p>
                </div>
                <span style={btnStyle("#D4775A")}>Ouvrir →</span>
              </div>
            </div>
          </Link>
          )}

        </div>
      )}

      {/* ── Footer ── */}
      {authState === "ok" && (
        <div style={{ textAlign: "center", marginTop: 32, paddingBottom: 20 }}>
          {displayName && (
            <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>
              {displayName}
              {role && <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, background: "#f0ebe3", fontSize: 10, fontWeight: 600 }}>{role}</span>}
            </div>
          )}
          <span
            onClick={signOut}
            style={{
              color: "#999",
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

"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts } from "@/lib/priceAlerts";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { fetchApi } from "@/lib/fetchApi";

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

// ── Style helpers ─────────────────────────────────────────────────────────────

const titleOf = (color: string, size = 14): React.CSSProperties => ({
  margin: 0,
  fontSize: size,
  fontWeight: 700,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color,
});

const sub: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  fontWeight: 500,
  color: "#999",
};

const ctr = (color: string, size = 30): React.CSSProperties => ({
  fontSize: size,
  fontWeight: 700,
  color,
  lineHeight: 1,
  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
});

const ctrSfx: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 400,
  color: "#999",
  marginLeft: 3,
};

const badge = (color: string): React.CSSProperties => ({
  display: "inline-block",
  fontSize: 10,
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: 8,
  background: `${color}14`,
  color,
  border: `1px solid ${color}30`,
});

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const pillGreen = {
  "--pill-bg": "rgba(74,103,65,0.10)",
  "--pill-color": "#4a6741",
  "--pill-hover": "rgba(74,103,65,0.25)",
} as React.CSSProperties;

const pillDark = {
  "--pill-bg": "rgba(201,185,154,0.15)",
  "--pill-color": "#c9b99a",
  "--pill-hover": "rgba(201,185,154,0.28)",
} as React.CSSProperties;

const pillWarm = {
  "--pill-bg": "rgba(160,132,92,0.10)",
  "--pill-color": "#A0845C",
  "--pill-hover": "rgba(160,132,92,0.20)",
} as React.CSSProperties;

// ── Section separator ─────────────────────────────────────────────────────────

function SectionSeparator({ label }: { label: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      margin: "6px 0 0",
      padding: "0 4px",
    }}>
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 2.5,
        textTransform: "uppercase",
        color: "#b0a894",
        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
        whiteSpace: "nowrap",
      }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #d5cdbc, transparent)" }} />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const [authState, setAuthState] = useState<"loading" | "ok" | "anon">("loading");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [caJour, setCaJour] = useState<number | null>(null);
  const { role, displayName, isGroupAdmin, can, loading: profileLoading } = useProfile();
  const { current: etab } = useEtablissement();

  // Redirect based on role
  useEffect(() => {
    if (profileLoading) return;
    if (isGroupAdmin) {
      router.replace("/groupe");
      return;
    }
    // Non-admin: redirect to their restaurant's cuisine hub
    // Default to bello-mio if no specific restaurant
    if (role === "cuisine" || role === "salle") {
      router.replace("/bello-mio/cuisine");
    }
  }, [profileLoading, isGroupAdmin, role, router]);

  // CA du jour Popina — auto-refresh toutes les 5 min
  useEffect(() => {
    async function fetchCa() {
      try {
        const res = await fetchApi("/api/popina/ca-jour");
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
      const eid = etab?.id;

      let qPizza = supabase.from("pizza_recipes").select("*", { count: "exact", head: true }).eq("is_draft", false);
      let qEmp = supabase.from("recipes").select("*", { count: "exact", head: true });
      let qKitchen = supabase.from("kitchen_recipes").select("*", { count: "exact", head: true }).eq("is_draft", false);
      let qPivot = supabase.from("prep_recipes").select("*", { count: "exact", head: true });
      let qCocktail = supabase.from("cocktails").select("*", { count: "exact", head: true }).eq("is_draft", false);
      let qIngredients = supabase.from("ingredients").select("*", { count: "exact", head: true });
      let qToCheck = supabase.from("ingredients").select("*", { count: "exact", head: true }).eq("status", "to_check");
      let qLastInvoice = supabase.from("supplier_invoices").select("created_at,supplier_name").order("created_at", { ascending: false }).limit(1);
      let qEvents = supabase.from("events").select("id,name,date,status,covers").gte("date", today).not("status", "in", '("termine","annule")').order("date", { ascending: true }).limit(5);
      let qSuppliers = supabase.from("suppliers").select("*", { count: "exact", head: true }).eq("is_active", true);

      if (eid) {
        qPizza = qPizza.eq("etablissement_id", eid);
        qEmp = qEmp.eq("etablissement_id", eid);
        qKitchen = qKitchen.eq("etablissement_id", eid);
        qPivot = qPivot.eq("etablissement_id", eid);
        qCocktail = qCocktail.eq("etablissement_id", eid);
        qIngredients = qIngredients.eq("etablissement_id", eid);
        qToCheck = qToCheck.eq("etablissement_id", eid);
        qLastInvoice = qLastInvoice.eq("etablissement_id", eid);
        qEvents = qEvents.eq("etablissement_id", eid);
        qSuppliers = qSuppliers.eq("etablissement_id", eid);
      }

      const [pizza, emp, kitchen, pivot, cocktail, ingredients, toCheck, lastInvoice, upcomingEvts, suppCount] = await Promise.all([
        qPizza, qEmp, qKitchen, qPivot, qCocktail, qIngredients, qToCheck,
        qLastInvoice.maybeSingle(),
        qEvents,
        qSuppliers,
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
  }, [etab?.id]);

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
      {/* ── Header ── */}
      <div style={{
        padding: "18px 20px",
        marginBottom: 16,
        width: "100vw",
        marginLeft: "calc(-50vw + 50%)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        display: "flex",
        justifyContent: "center",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <Image
            src="/logo-ifratelli.png"
            alt="iFratelli Group"
            width={48}
            height={48}
            style={{ height: 56, width: "auto", objectFit: "contain", mixBlendMode: "multiply" }}
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

        {/* ── Établissement badge + Vue Groupe ── */}
        {authState === "ok" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16 }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 8,
              background: "rgba(212,119,90,0.10)",
              border: "1px solid rgba(212,119,90,0.20)",
              fontSize: 11,
              fontWeight: 700,
              color: "#D4775A",
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              letterSpacing: 0.5,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#D4775A", flexShrink: 0 }} />
              Bello Mio
            </span>
            {isGroupAdmin && (
              <Link href="/groupe" style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#A0845C",
                textDecoration: "none",
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid rgba(160,132,92,0.25)",
                background: "rgba(160,132,92,0.08)",
              }}>
                Vue Groupe →
              </Link>
            )}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 16px 40px" }}>

      {/* ── Non connecté ── */}
      {authState === "anon" && (
        <div className="dash-card" style={{ textAlign: "center", cursor: "default" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#999" }}>Connecte-toi pour accéder aux fiches.</p>
          <div style={{ marginTop: 12 }}>
            <Link href="/login" className="dash-pill" style={{ textDecoration: "none" }}>Se connecter</Link>
          </div>
        </div>
      )}

      {/* ── Connecté ── */}
      {authState === "ok" && (
        <div className="dash-grid">

          {/* ─── ATELIER (hero) ─── */}
          <Link href="/recettes" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="dash-card dash-hero" style={{ "--accent": "#D4775A" } as React.CSSProperties}>
              <div>
                <p style={titleOf("#D4775A", 16)}>ATELIER</p>
                <p style={sub}>Pizza · Empâtement · Cuisine · Cocktail</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                {counts && (
                  <span style={ctr("#D4775A", 38)}>
                    {counts.recettes}
                    <span style={ctrSfx}>fiches</span>
                  </span>
                )}
                <span className="dash-pill" style={{ marginLeft: "auto" }}>Ouvrir →</span>
              </div>
            </div>
          </Link>

          {/* ─── CATALOGUE ─── */}
          <Link href="/ingredients" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="dash-card" style={{ "--accent": "#D4775A" } as React.CSSProperties}>
              <div style={row}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={titleOf("#D4775A")}>CATALOGUE</p>
                    {counts && counts.toCheck > 0 && (
                      <span style={badge("#EA580C")}>{counts.toCheck} à vérifier</span>
                    )}
                  </div>
                  <p style={sub}>Index · Coûts · Prix</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && (
                    <span style={ctr("#D4775A")}>
                      {counts.ingredients}
                      <span style={ctrSfx}>réf.</span>
                    </span>
                  )}
                  <span className="dash-pill">Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>

          {/* ─── COMMANDES ─── */}
          <Link href="/commandes" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="dash-card" style={{ "--accent": "#A0845C" } as React.CSSProperties}>
              <div style={row}>
                <div>
                  <p style={titleOf("#A0845C")}>COMMANDES</p>
                  <p style={sub}>Maël · Metro · Masse</p>
                </div>
                <span className="dash-pill" style={pillWarm}>Ouvrir →</span>
              </div>
            </div>
          </Link>

          {/* ── Separator GESTION ── */}
          {can("factures") && <SectionSeparator label="GESTION" />}

          {/* ─── FACTURES ─── */}
          {can("factures") && (
          <Link href="/invoices" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="dash-card dash-warm" style={{ "--accent": "#A0845C" } as React.CSSProperties}>
              <div style={row}>
                <div>
                  <p style={titleOf("#A0845C")}>FACTURES</p>
                  <p style={sub}>Import fournisseurs · Mise à jour prix</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && counts.lastImport && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#A0845C" }}>
                      {counts.lastImportSupplier ? `${counts.lastImportSupplier} · ` : ""}
                      {fmtDateShort(counts.lastImport)}
                    </span>
                  )}
                  <span className="dash-pill" style={pillWarm}>Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>
          )}

          {/* ─── FOURNISSEURS ─── */}
          {can("fournisseurs.view") && (
          <Link href="/fournisseurs" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="dash-card" style={{ "--accent": "#D4775A" } as React.CSSProperties}>
              <div style={row}>
                <div>
                  <p style={titleOf("#D4775A")}>FOURNISSEURS</p>
                  <p style={sub}>Fiches · Coordonnées · Historique</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && (
                    <span style={ctr("#D4775A")}>
                      {counts.suppliers}
                      <span style={ctrSfx}>actifs</span>
                    </span>
                  )}
                  <span className="dash-pill">Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>
          )}

          {/* ─── ÉVÉNEMENTS ─── */}
          {can("evenements") && (
          <Link href="/evenements" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="dash-card" style={{ "--accent": "#D4775A" } as React.CSSProperties}>
              <div style={row}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={titleOf("#D4775A")}>ÉVÉNEMENTS</p>
                    {counts && counts.upcomingEvents.length > 0 && (
                      <span style={badge("#D4775A")}>{counts.upcomingEvents.length} à venir</span>
                    )}
                  </div>
                  <p style={sub}>Mariages · Séminaires · Traiteur</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {counts && counts.upcomingEvents.length > 0 && (
                    <span style={ctr("#D4775A")}>
                      {counts.upcomingEvents.length}
                      <span style={ctrSfx}>à venir</span>
                    </span>
                  )}
                  <span className="dash-pill">Ouvrir →</span>
                </div>
              </div>
              {counts && counts.upcomingEvents.length > 0 && (
                <div style={{ marginTop: 12, display: "grid", gap: 5 }}>
                  {counts.upcomingEvents.slice(0, 3).map((ev) => (
                    <div key={ev.id} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 11,
                      padding: "7px 12px",
                      background: "rgba(245,237,228,0.5)",
                      borderRadius: 10,
                      border: "1px solid rgba(221,214,200,0.25)",
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

          {/* ─── RH & PLANNING ─── */}
          {can("rh") && (
          <Link href="/rh/equipe" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="dash-card" style={{ "--accent": "#D4775A" } as React.CSSProperties}>
              <div style={row}>
                <div>
                  <p style={titleOf("#D4775A")}>EQUIPE</p>
                  <p style={sub}>Employes · Contrats · Absences</p>
                </div>
                <span className="dash-pill">Ouvrir →</span>
              </div>
            </div>
          </Link>
          )}

          {can("planning.view") && (
          <Link href="/plannings" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="dash-card" style={{ "--accent": "#D4775A" } as React.CSSProperties}>
              <div style={row}>
                <div>
                  <p style={titleOf("#D4775A")}>PLANNING</p>
                  <p style={sub}>Shifts · Horaires · Heures sup</p>
                </div>
                <span className="dash-pill">Ouvrir →</span>
              </div>
            </div>
          </Link>
          )}

          {/* ─── PILOTAGE ─── */}
          {can("pilotage") && (
          <Link href="/pilotage" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="dash-card dash-green" style={{ "--accent": "#4a6741" } as React.CSSProperties}>
              <div style={row}>
                <div>
                  <p style={titleOf("#4a6741")}>PILOTAGE</p>
                  <p style={sub}>Mercuriale · Épicerie · Variations & Alertes</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {caJour !== null && (
                    <span style={ctr("#4a6741")}>
                      {caJour.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      <span style={ctrSfx}>€ auj.</span>
                    </span>
                  )}
                  {counts && counts.priceAlerts > 0 && (
                    <span style={badge("#4a6741")}>{counts.priceAlerts}</span>
                  )}
                  <span className="dash-pill" style={pillGreen}>Ouvrir →</span>
                </div>
              </div>
            </div>
          </Link>
          )}

          {/* ─── FINANCES ─── */}
          {can("finances") && (
          <Link href="/finances" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="dash-card dash-green" style={{ "--accent": "#2d6a4f" } as React.CSSProperties}>
              <div style={row}>
                <div>
                  <p style={titleOf("#2d6a4f")}>FINANCES</p>
                  <p style={sub}>P&L · Food cost · Rentabilité produits</p>
                </div>
                <span className="dash-pill" style={pillGreen}>Ouvrir →</span>
              </div>
            </div>
          </Link>
          )}

          {/* ─── ADMIN ─── */}
          {can("admin") && (
          <Link href="/admin/utilisateurs" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="dash-card dash-dark" style={{ "--accent": "#c9b99a" } as React.CSSProperties}>
              <div style={row}>
                <div>
                  <p style={titleOf("#c9b99a")}>ADMIN</p>
                  <p style={{ ...sub, color: "#777" }}>Utilisateurs · Rôles</p>
                </div>
                <span className="dash-pill" style={pillDark}>Ouvrir →</span>
              </div>
            </div>
          </Link>
          )}

        </div>
      )}

      {/* ── Footer ── */}
      {authState === "ok" && (
        <div style={{ textAlign: "center", marginTop: 36, paddingBottom: 24 }}>
          {displayName && (
            <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>
              {displayName}
              {role && (
                <span style={{
                  marginLeft: 6,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "rgba(212,119,90,0.08)",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#b0a894",
                }}>{role}</span>
              )}
            </div>
          )}
          <span
            onClick={signOut}
            style={{ color: "#b0a894", fontSize: 11, cursor: "pointer" }}
          >
            Déconnexion
          </span>
        </div>
      )}
      </div>
    </main>
  );
}

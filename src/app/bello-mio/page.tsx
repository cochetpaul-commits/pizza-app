"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";
import { useProfile } from "@/lib/ProfileContext";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { usePilotageRange } from "@/lib/pilotageRange";
import { fetchApi } from "@/lib/fetchApi";

const DailyCaBarChart = dynamic(() => import("@/components/charts/DailyCaBarChart"), { ssr: false });

const COLOR = "#e27f57";
const OSWALD = "var(--font-oswald), Oswald, sans-serif";
const DM_SANS = "var(--font-dm-sans), 'DM Sans', sans-serif";

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.82)",
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03), 0 0 0 0.5px rgba(0,0,0,0.04)",
};

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(etabId: string, from: string, to: string, cols = "ttc, num_fiscal"): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ventes_lignes").select(cols)
      .eq("etablissement_id", etabId).gte("date_service", from)
      .lte("date_service", to).eq("type_ligne", "Produit")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

/** Compute A-1 range for comparison */
function getA1Range(from: string, to: string): { from: string; to: string } {
  const y1 = parseInt(from.slice(0, 4));
  const y2 = parseInt(to.slice(0, 4));
  return { from: `${y1 - 1}${from.slice(4)}`, to: `${y2 - 1}${to.slice(4)}` };
}

function defaultRange(): DateRange {
  const d = new Date();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
  const first = today.slice(0, 8) + "01";
  return { from: first, to: today };
}

export default function BelloMioDashboard() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager", "equipier"]}>
      <BelloMioContent />
    </RequireRole>
  );
}

type DailyCA = { date: string; ca: number };
type TopProduct = { name: string; ca: number; qty: number };
type MixCat = { cat: string; ca: number };
type MeteoDay = { date: string; emoji: string; desc: string; temp: number; service: string };
type PendingDelivery = { supplier: string; status: string; created: string };

function BelloMioContent() {
  const { etablissements, setCurrent, setGroupView } = useEtablissement();
  const { can } = useProfile();
  const canSeePilotage = can("performances.view");

  const today = useMemo(
    () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()),
    [],
  );

  const etab = useMemo(
    () => etablissements.find((e) => e.slug?.includes("bello")),
    [etablissements],
  );

  const [range, setRange] = usePilotageRange(defaultRange);

  // KPIs
  const [ca, setCa] = useState(0);
  const [caA1, setCaA1] = useState(0);
  const [couverts, setCouverts] = useState(0);
  const [couvertsA1, setCouvertsA1] = useState(0);
  const [achatsHt, setAchatsHt] = useState(0);
  const [dailyCa, setDailyCa] = useState<DailyCA[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [mixCats, setMixCats] = useState<MixCat[]>([]);
  const [loading, setLoading] = useState(true);

  // Secondary data (always "today")
  const [shiftsToday, setShiftsToday] = useState(0);
  const [pendingCommandes, setPendingCommandes] = useState(0);
  const [deliveries, setDeliveries] = useState<PendingDelivery[]>([]);
  const [meteoForecast, setMeteoForecast] = useState<MeteoDay[]>([]);

  useEffect(() => {
    if (etab) { setCurrent(etab); setGroupView(false); }
  }, [etab, setCurrent, setGroupView]);

  // Main data fetch (depends on range)
  const fetchMain = useCallback(async () => {
    if (!etab) return;
    setLoading(true);

    const a1 = getA1Range(range.from, range.to);

    const [rows, rowsA1, dailyRows, topRows, achatsRes] = await Promise.all([
      fetchAllRows(etab.id, range.from, range.to),
      fetchAllRows(etab.id, a1.from, a1.to),
      fetchAllRows(etab.id, range.from, range.to, "ttc, date_service"),
      fetchAllRows(etab.id, range.from, range.to, "ttc, description, categorie"),
      supabase.from("supplier_invoices").select("total_ht")
        .eq("etablissement_id", etab.id)
        .gte("invoice_date", range.from).lte("invoice_date", range.to),
    ]);

    setCa(rows.reduce((s: number, r: { ttc: number }) => s + (Number(r.ttc) || 0), 0));
    setCouverts(new Set(rows.map((r: { num_fiscal: string }) => r.num_fiscal).filter(Boolean)).size);
    setCaA1(rowsA1.reduce((s: number, r: { ttc: number }) => s + (Number(r.ttc) || 0), 0));
    setCouvertsA1(new Set(rowsA1.map((r: { num_fiscal: string }) => r.num_fiscal).filter(Boolean)).size);

    // Daily CA
    const byDate: Record<string, number> = {};
    for (const r of dailyRows) { const d = String(r.date_service); byDate[d] = (byDate[d] ?? 0) + (Number(r.ttc) || 0); }
    setDailyCa(Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, ca]) => ({ date, ca })));

    // Top products + mix categories
    const prodMap: Record<string, { ca: number; qty: number }> = {};
    const catMap: Record<string, number> = {};
    for (const r of topRows) {
      const name = String(r.description || "Autre");
      if (!prodMap[name]) prodMap[name] = { ca: 0, qty: 0 };
      prodMap[name].ca += Number(r.ttc) || 0;
      prodMap[name].qty += 1;
      const cat = String(r.categorie || "Autre");
      if (cat !== "MESSAGES") catMap[cat] = (catMap[cat] ?? 0) + (Number(r.ttc) || 0);
    }
    setTopProducts(Object.entries(prodMap).sort(([, a], [, b]) => b.ca - a.ca).slice(0, 8).map(([name, d]) => ({ name, ...d })));
    setMixCats(Object.entries(catMap).sort(([, a], [, b]) => b - a).map(([cat, ca]) => ({ cat, ca })));

    // Achats
    setAchatsHt((achatsRes.data ?? []).reduce((s, r: { total_ht: number | null }) => s + (r.total_ht ?? 0), 0));

    setLoading(false);
  }, [etab, range]);

  useEffect(() => { fetchMain(); }, [fetchMain]); // eslint-disable-line react-hooks/set-state-in-effect

  // Secondary data fetch (always today, once)
  useEffect(() => {
    if (!etab) return;
    (async () => {
      const [shiftsRes, commandesRes, deliveriesRes] = await Promise.all([
        supabase.from("shifts").select("id").eq("date", today).eq("etablissement_id", etab.id),
        supabase.from("commande_sessions").select("id").in("status", ["brouillon", "en_attente", "validee"]).eq("etablissement_id", etab.id),
        supabase.from("commande_sessions").select("status, created_at, suppliers(name)")
          .in("status", ["validee", "en_attente"]).eq("etablissement_id", etab.id).order("created_at", { ascending: false }).limit(5),
      ]);
      setShiftsToday(shiftsRes.data?.length ?? 0);
      setPendingCommandes(commandesRes.data?.length ?? 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDeliveries((deliveriesRes.data ?? []).map((d: any) => ({
        supplier: (Array.isArray(d.suppliers) ? d.suppliers[0]?.name : d.suppliers?.name) ?? "?",
        status: d.status,
        created: new Date(d.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
      })));
      // Meteo
      try {
        const meteoRes = await fetchApi(`/api/meteo?from=${today}&to=${(() => { const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() + 10); return d.toISOString().slice(0, 10); })()}`);
        const meteoData = await meteoRes.json();
        if (meteoData.meteo) setMeteoForecast(meteoData.meteo.map((m: { date_service: string; emoji: string; description: string; temp: number; service: string }) => ({ date: m.date_service, emoji: m.emoji, desc: m.description, temp: m.temp, service: m.service })));
      } catch { /* ignore */ }
    })();
  }, [etab, today]);

  // Derived
  const ticketMoyen = couverts > 0 ? ca / couverts : 0;
  const ticketMoyenA1 = couvertsA1 > 0 ? caA1 / couvertsA1 : 0;
  const deltaCa = caA1 > 0 ? ((ca - caA1) / caA1) * 100 : null;
  const deltaCouverts = couvertsA1 > 0 ? ((couverts - couvertsA1) / couvertsA1) * 100 : null;
  const deltaTm = ticketMoyenA1 > 0 ? ((ticketMoyen - ticketMoyenA1) / ticketMoyenA1) * 100 : null;
  const foodCost = ca > 0 ? (achatsHt / ca) * 100 : 0;

  const meteoDays = useMemo(() => {
    const byDate: Record<string, MeteoDay> = {};
    for (const m of meteoForecast) { if (!byDate[m.date] || m.service === "midi") byDate[m.date] = m; }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [meteoForecast]);

  return (
    <div className="dashboard-page" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 32px 60px", fontFamily: DM_SANS }}>

      {/* ── Header + DateRangePicker ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5, color: COLOR, marginBottom: 4 }}>
            Tableau de bord
          </div>
          <h1 style={{ fontFamily: OSWALD, fontSize: 32, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: T.dark, margin: 0, lineHeight: 1.1 }}>
            Bello Mio
          </h1>
        </div>
        <DateRangePicker value={range} onChange={setRange} format="short" />
      </div>

      {/* ── KPIs ── */}
      {canSeePilotage && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
          <KpiCard label="CA TTC" value={`${fmtEur(ca)} \u20AC`} accent={COLOR} delta={deltaCa} loading={loading} href={`/ventes?from=${range.from}&to=${range.to}`} />
          <KpiCard label="Couverts" value={String(couverts)} accent={T.dark} delta={deltaCouverts} loading={loading} />
          <KpiCard label="Ticket moyen" value={`${ticketMoyen.toFixed(1).replace(".", ",")} \u20AC`} accent={T.dore} delta={deltaTm} loading={loading} />
          <KpiCard label="Achats HT" value={`${fmtEur(achatsHt)} \u20AC`} accent={T.sauge} loading={loading} subtitle={ca > 0 ? `Food cost ${fmtPct(foodCost)}%` : undefined} />
        </div>
      )}

      {/* ── Main 2-col layout ── */}
      <div className="dashboard-grid" style={{ display: "grid", gap: 20, marginBottom: 28, alignItems: "start" }}>
        {/* Left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* CA chart */}
          {canSeePilotage && dailyCa.length > 0 && (
            <div style={{ ...CARD, padding: "20px 22px" }}>
              <SectionTitle>CA par jour</SectionTitle>
              <div style={{ marginTop: 12 }}><DailyCaBarChart dailyCa={dailyCa} color={COLOR} /></div>
            </div>
          )}

          {/* Mix categories */}
          {canSeePilotage && mixCats.length > 0 && (
            <div style={{ ...CARD, padding: "18px 20px" }}>
              <SectionTitle>Mix categories</SectionTitle>
              <div style={{ marginTop: 10 }}>
                {mixCats.map((m, i) => {
                  const pct = ca > 0 ? (m.ca / ca) * 100 : 0;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: i < mixCats.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                      <span style={{ flex: 1, fontSize: 12, color: T.dark, minWidth: 0 }}>{m.cat}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: OSWALD, color: T.dark, flexShrink: 0 }}>{fmtEur(m.ca)}{"\u00A0"}{"\u20AC"}</span>
                      <span style={{ fontSize: 10, color: T.muted, flexShrink: 0, width: 38, textAlign: "right" }}>{fmtPct(pct)}%</span>
                      <div style={{ width: 40, height: 4, background: "rgba(0,0,0,0.05)", borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: COLOR, borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Top produits */}
          {canSeePilotage && topProducts.length > 0 && (
            <div style={{ ...CARD, padding: "18px 20px" }}>
              <SectionTitle>Top produits</SectionTitle>
              <div style={{ marginTop: 8 }}>
                {topProducts.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < topProducts.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                    <span style={{ fontSize: 11, color: "#ccc", width: 16, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 12, color: T.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{p.qty}x</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: OSWALD, color: COLOR, flexShrink: 0 }}>{fmtEur(p.ca)}{"\u20AC"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <QuickStat label="En service" value={String(shiftsToday)} color={T.bleu} />
            <QuickStat label="Commandes" value={String(pendingCommandes)} color={pendingCommandes > 0 ? COLOR : T.sauge} href="/commandes" />
          </div>

          {/* Commandes en cours */}
          {deliveries.length > 0 && (
            <div style={{ ...CARD, padding: "16px 18px" }}>
              <SectionTitle>Commandes en cours</SectionTitle>
              <div style={{ marginTop: 8 }}>
                {deliveries.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: i < deliveries.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.dark }}>{d.supplier}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: T.muted }}>{d.created}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                        background: d.status === "validee" ? "rgba(22,163,74,0.08)" : "rgba(234,88,12,0.08)",
                        color: d.status === "validee" ? "#16A34A" : "#EA580C",
                      }}>
                        {d.status === "validee" ? "Validee" : "En attente"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meteo */}
          {meteoDays.length > 0 && (
            <div style={{ ...CARD, padding: "16px 18px" }}>
              <SectionTitle>Meteo</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(meteoDays.length, 5)}, 1fr)`, gap: 4, marginTop: 8 }}>
                {meteoDays.slice(0, 5).map((m, i) => {
                  const isToday = m.date === today;
                  const dt = new Date(m.date + "T12:00:00");
                  return (
                    <div key={i} style={{
                      borderRadius: 10, padding: "8px 4px", textAlign: "center",
                      background: isToday ? `${COLOR}12` : "transparent",
                      border: isToday ? `1.5px solid ${COLOR}40` : "1.5px solid transparent",
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: isToday ? COLOR : T.muted, textTransform: "uppercase" }}>{dt.toLocaleDateString("fr-FR", { weekday: "short" })}</div>
                      <div style={{ fontSize: 20, lineHeight: 1.3 }}>{m.emoji}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.dark }}>{Math.round(m.temp)}°</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Acces rapide ── */}
      <SectionTitle>Acces rapide</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { href: "/ventes", label: "Rapport de vente" },
          { href: "/ventes/marges", label: "Marges" },
          { href: "/recettes", label: "Fiches techniques" },
          { href: "/commandes", label: "Commandes" },
          { href: "/ingredients", label: "Produits" },
          { href: "/inventaire", label: "Inventaire" },
        ].map(s => (
          <Link key={s.href} href={s.href} style={{ textDecoration: "none" }}>
            <div className="hover-lift" style={{
              ...CARD, padding: "14px 16px", textAlign: "center",
              fontSize: 13, fontWeight: 600, color: T.dark,
              transition: "box-shadow 0.2s, transform 0.2s", cursor: "pointer",
            }}>
              {s.label}
            </div>
          </Link>
        ))}
      </div>

      <Link href="/dashboard" style={{ display: "block", textAlign: "center", padding: "10px 0", fontSize: 12, fontWeight: 600, color: T.muted, textDecoration: "none" }}>
        Retour vue groupe
      </Link>

      <style>{`
        .hover-lift:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08) !important; transform: translateY(-1px); }
        .dashboard-grid { grid-template-columns: 1fr 340px; }
        @media (max-width: 767px) {
          .dashboard-page { padding: 16px 14px 100px !important; }
          .dashboard-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

/* ── Sub-components ── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.muted, marginBottom: 8 }}>{children}</div>;
}

function KpiCard({ label, value, accent, delta, loading, subtitle, href }: {
  label: string; value: string; accent: string; delta?: number | null; loading: boolean; subtitle?: string; href?: string;
}) {
  const content = (
    <div className={href ? "hover-lift" : ""} style={{ ...CARD, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 2, cursor: href ? "pointer" : "default", transition: "box-shadow 0.2s, transform 0.2s" }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted }}>{label} {href ? "→" : ""}</span>
      <span style={{ fontSize: 28, fontWeight: 700, color: accent, fontFamily: OSWALD, lineHeight: 1.15, marginTop: 6, opacity: loading ? 0.4 : 1, transition: "opacity 0.2s" }}>{value}</span>
      {subtitle && <span style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{subtitle}</span>}
      {delta != null && (
        <span style={{ fontSize: 11, fontWeight: 600, color: delta >= 0 ? T.sauge : "#DC2626", marginTop: 4 }}>
          {delta > 0 ? "+" : ""}{Math.round(delta)}% vs A-1
        </span>
      )}
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: "none", display: "block" }}>{content}</Link>;
  return content;
}

function QuickStat({ label, value, color, href }: { label: string; value: string; color: string; href?: string }) {
  const inner = (
    <div style={{
      ...CARD, padding: "14px", textAlign: "center",
      background: `${color}08`, border: `1px solid ${color}15`,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: OSWALD }}>{value}</div>
      <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link>;
  return inner;
}

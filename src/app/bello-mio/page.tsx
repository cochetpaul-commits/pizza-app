"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import Chart from "chart.js/auto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";
import { useProfile } from "@/lib/ProfileContext";

const COLOR = "#e27f57";
const OSWALD = "var(--font-oswald), Oswald, sans-serif";

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getPrevDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(dateStr: string, today: string): string {
  if (dateStr === today) return "CA du jour";
  const d = new Date(dateStr + "T12:00:00");
  return `CA du ${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}`;
}

function formatTicketsLabel(dateStr: string, today: string): string {
  if (dateStr === today) return "Tickets du jour";
  const d = new Date(dateStr + "T12:00:00");
  return `Tickets du ${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(etabId: string, from: string, to: string, cols = "ttc, num_fiscal"): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ventes_lignes")
      .select(cols)
      .eq("etablissement_id", etabId)
      .gte("date_service", from)
      .lte("date_service", to)
      .eq("type_ligne", "Produit")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
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

  const [lastDay, setLastDay] = useState<string | null>(null);
  const [caDay, setCaDay] = useState(0);
  const [caPrev, setCaPrev] = useState(0);
  const [tickets, setTickets] = useState(0);
  const [caWeek, setCaWeek] = useState(0);
  const [caMonth, setCaMonth] = useState(0);
  const [caMonthA1, setCaMonthA1] = useState(0);
  const [ticketsMonth, setTicketsMonth] = useState(0);
  const [ticketsMonthA1, setTicketsMonthA1] = useState(0);
  const [shiftsToday, setShiftsToday] = useState(0);
  const [pendingCommandes, setPendingCommandes] = useState(0);
  const [alertCount, setAlertCount] = useState<number | null>(null);
  const [dailyCa, setDailyCa] = useState<DailyCA[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [deliveries, setDeliveries] = useState<PendingDelivery[]>([]);
  const [meteoForecast, setMeteoForecast] = useState<MeteoDay[]>([]);
  const [stockAlerts, setStockAlerts] = useState<{ name: string; stock: number; min: number }[]>([]);

  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (etab) { setCurrent(etab); setGroupView(false); }
  }, [etab, setCurrent, setGroupView]);

  const fetchAll = useCallback(async () => {
    if (!etab) return;

    // 1. Last day with data
    const { data: lastRow } = await supabase
      .from("ventes_lignes").select("date_service")
      .eq("etablissement_id", etab.id).eq("type_ligne", "Produit")
      .order("date_service", { ascending: false }).limit(1);
    const ld = lastRow?.[0]?.date_service ?? today;
    setLastDay(ld);

    const prevDay = getPrevDay(ld);
    const monday = getMonday(ld);
    const firstOfMonth = ld.slice(0, 8) + "01";
    // A-1 range
    const y = parseInt(ld.slice(0, 4));
    const a1Start = `${y - 1}${firstOfMonth.slice(4)}`;
    const a1End = `${y - 1}${ld.slice(4)}`;

    // 2. Parallel fetches
    const [dayData, prevData, monthData, monthA1Data, weekDailyData, topData, shiftsRes, commandesRes, alertsRes, deliveriesRes, stockRes] =
      await Promise.all([
        supabase.from("ventes_lignes").select("ttc, num_fiscal")
          .eq("etablissement_id", etab.id).eq("date_service", ld).eq("type_ligne", "Produit"),
        supabase.from("ventes_lignes").select("ttc")
          .eq("etablissement_id", etab.id).eq("date_service", prevDay).eq("type_ligne", "Produit"),
        fetchAllRows(etab.id, firstOfMonth, ld),
        fetchAllRows(etab.id, a1Start, a1End),
        fetchAllRows(etab.id, monday, ld, "ttc, date_service"),
        // Top products this week
        fetchAllRows(etab.id, monday, ld, "ttc, description"),
        supabase.from("shifts").select("id").eq("date", today).eq("etablissement_id", etab.id),
        supabase.from("commande_sessions").select("id").in("status", ["brouillon", "en_attente", "validee"]).eq("etablissement_id", etab.id),
        supabase.from("supplier_invoice_lines").select("id", { count: "exact", head: true }).eq("needs_review", true),
        // Pending deliveries
        supabase.from("commande_sessions").select("status, created_at, suppliers(name)")
          .in("status", ["validee", "en_attente"]).eq("etablissement_id", etab.id).order("created_at", { ascending: false }).limit(5),
        // Stock alerts
        supabase.from("ingredients").select("name, stock_min, stock_objectif")
          .eq("is_active", true).not("stock_min", "is", null)
          .or(`establishments.cs.{"bellomio"},establishments.is.null`).limit(50),
      ]);

    // Process day
    if (dayData.data) {
      setCaDay(dayData.data.reduce((s, r) => s + (r.ttc ?? 0), 0));
      setTickets(new Set(dayData.data.map(r => r.num_fiscal).filter(Boolean)).size);
    }
    if (prevData.data) setCaPrev(prevData.data.reduce((s, r) => s + (r.ttc ?? 0), 0));

    // Month
    setCaMonth(monthData.reduce((s: number, r: { ttc: number }) => s + (r.ttc ?? 0), 0));
    setTicketsMonth(new Set(monthData.map((r: { num_fiscal: string }) => r.num_fiscal).filter(Boolean)).size);

    // Month A-1
    setCaMonthA1(monthA1Data.reduce((s: number, r: { ttc: number }) => s + (r.ttc ?? 0), 0));
    setTicketsMonthA1(new Set(monthA1Data.map((r: { num_fiscal: string }) => r.num_fiscal).filter(Boolean)).size);

    // Week CA
    setCaWeek(weekDailyData.reduce((s: number, r: { ttc: number }) => s + (r.ttc ?? 0), 0));

    // Daily CA for chart
    const byDate: Record<string, number> = {};
    for (const r of weekDailyData) {
      const d = String(r.date_service);
      byDate[d] = (byDate[d] ?? 0) + (Number(r.ttc) || 0);
    }
    setDailyCa(Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, ca]) => ({ date, ca })));

    // Top products
    const prodMap: Record<string, { ca: number; qty: number }> = {};
    for (const r of topData) {
      const name = String(r.description || "Autre");
      if (!prodMap[name]) prodMap[name] = { ca: 0, qty: 0 };
      prodMap[name].ca += Number(r.ttc) || 0;
      prodMap[name].qty += 1;
    }
    setTopProducts(Object.entries(prodMap).sort(([, a], [, b]) => b.ca - a.ca).slice(0, 5).map(([name, d]) => ({ name, ...d })));

    // Quick stats
    setShiftsToday(shiftsRes.data?.length ?? 0);
    setPendingCommandes(commandesRes.data?.length ?? 0);
    setAlertCount(alertsRes.count ?? 0);

    // Deliveries
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setDeliveries((deliveriesRes.data ?? []).map((d: any) => ({
      supplier: (Array.isArray(d.suppliers) ? d.suppliers[0]?.name : d.suppliers?.name) ?? "?",
      status: d.status,
      created: new Date(d.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    })));

    // Stock alerts (items where stock_min exists — in the future, compare with actual stock)
    setStockAlerts((stockRes.data ?? [])
      .filter((i: { stock_min: number | null }) => i.stock_min != null && i.stock_min > 0)
      .slice(0, 5)
      .map((i: { name: string; stock_min: number; stock_objectif: number | null }) => ({
        name: i.name, stock: 0, min: i.stock_min,
      })));

    // Meteo forecast
    try {
      const meteoRes = await fetch(`/api/meteo?from=${today}&to=${(() => { const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() + 10); return d.toISOString().slice(0, 10); })()}`);
      const meteoData = await meteoRes.json();
      if (meteoData.meteo) {
        setMeteoForecast(meteoData.meteo.map((m: { date_service: string; emoji: string; description: string; temp: number; service: string }) => ({
          date: m.date_service, emoji: m.emoji, desc: m.description, temp: m.temp, service: m.service,
        })));
      }
    } catch { /* ignore */ }

  }, [etab, today]);

  useEffect(() => { fetchAll(); }, [fetchAll]); // eslint-disable-line react-hooks/set-state-in-effect

  // Chart
  useEffect(() => {
    if (!chartRef.current || dailyCa.length === 0) return;
    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels: dailyCa.map(d => {
          const dt = new Date(d.date + "T12:00:00");
          return dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
        }),
        datasets: [{
          label: "CA TTC",
          data: dailyCa.map(d => Math.round(d.ca)),
          backgroundColor: COLOR + "CC",
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${(ctx.parsed.y ?? 0).toLocaleString("fr-FR")} \u20AC` } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { grid: { color: "#f0ebe2" }, ticks: { font: { size: 10 }, callback: v => `${Number(v).toLocaleString("fr-FR")}` } },
        },
      },
    });
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [dailyCa]);

  const ticketMoyen = tickets > 0 ? caDay / tickets : 0;
  const deltaCa = caPrev > 0 ? Math.round(((caDay - caPrev) / caPrev) * 100) : null;
  const deltaMonthA1 = caMonthA1 > 0 ? Math.round(((caMonth - caMonthA1) / caMonthA1) * 100) : null;
  const deltaTicketsA1 = ticketsMonthA1 > 0 ? Math.round(((ticketsMonth - ticketsMonthA1) / ticketsMonthA1) * 100) : null;

  const dayLabel = lastDay ? formatDayLabel(lastDay, today) : "CA du jour";
  const ticketsLabel = lastDay ? formatTicketsLabel(lastDay, today) : "Tickets du jour";
  const deltaLabel = lastDay === today ? "vs hier" : `vs ${(() => {
    const prev = getPrevDay(lastDay ?? today);
    return new Date(prev + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
  })()}`;

  const dateDisplay = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });

  // Group meteo by day (midi preferred)
  const meteoDays = useMemo(() => {
    const byDate: Record<string, MeteoDay> = {};
    for (const m of meteoForecast) {
      if (!byDate[m.date] || m.service === "midi") byDate[m.date] = m;
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [meteoForecast]);

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 16px 40px" }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${COLOR} 0%, ${COLOR}DD 100%)`,
        borderRadius: 16, padding: "24px 20px 20px", marginBottom: 20, color: "#fff",
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.7, marginBottom: 4 }}>Tableau de bord</div>
        <div style={{ fontFamily: OSWALD, fontSize: 28, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Bello Mio</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{dateDisplay}</div>
      </div>

      {/* KPI cards — manager+ only */}
      {canSeePilotage && (<>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <KpiCard label={dayLabel} value={`${fmtEur(caDay)} \u20AC`} accent={COLOR}
          sub={deltaCa != null ? `${deltaCa > 0 ? "+" : ""}${deltaCa}% ${deltaLabel}` : undefined}
          subColor={deltaCa != null ? (deltaCa >= 0 ? T.sauge : "#DC2626") : undefined} />
        <KpiCard label={ticketsLabel} value={String(tickets)} accent={T.dark} />
        <KpiCard label="Ticket moyen" value={`${ticketMoyen.toFixed(1).replace(".", ",")} \u20AC`} accent={T.dark} />
        <KpiCard label="CA semaine" value={`${fmtEur(caWeek)} \u20AC`} accent={COLOR} />
        <KpiCard label="CA mois" value={`${fmtEur(caMonth)} \u20AC`} accent={COLOR}
          sub={deltaMonthA1 != null ? `${deltaMonthA1 > 0 ? "+" : ""}${deltaMonthA1}% vs A-1` : undefined}
          subColor={deltaMonthA1 != null ? (deltaMonthA1 >= 0 ? T.sauge : "#DC2626") : undefined} />
        <KpiCard label="Tickets mois" value={String(ticketsMonth)} accent={T.dark}
          sub={deltaTicketsA1 != null ? `${deltaTicketsA1 > 0 ? "+" : ""}${deltaTicketsA1}% vs A-1` : undefined}
          subColor={deltaTicketsA1 != null ? (deltaTicketsA1 >= 0 ? T.sauge : "#DC2626") : undefined} />
      </div>

      {/* CA chart 7 jours */}
      {dailyCa.length > 0 && (
        <>
          <SectionTitle>CA des 7 derniers jours</SectionTitle>
          <div style={{ background: T.white, borderRadius: 14, padding: "14px 14px", border: `1.5px solid ${T.border}`, marginBottom: 20 }}>
            <canvas ref={chartRef} height={160} />
          </div>
        </>
      )}

      {/* Top 5 produits */}
      {topProducts.length > 0 && (
        <>
          <SectionTitle>Top 5 produits (semaine)</SectionTitle>
          <div style={{ background: T.white, borderRadius: 14, padding: "12px 14px", border: `1.5px solid ${T.border}`, marginBottom: 20 }}>
            {topProducts.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < topProducts.length - 1 ? "1px solid #f0ebe2" : "none" }}>
                <span style={{ fontSize: 11, color: "#ccc", width: 16, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 12, color: T.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{p.qty}x</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: OSWALD, color: COLOR, flexShrink: 0 }}>{fmtEur(p.ca)}€</span>
              </div>
            ))}
          </div>
        </>
      )}

      </>)}

      {/* Météo prévisions */}
      {meteoDays.length > 0 && (
        <>
          <SectionTitle>Meteo ({meteoDays.length} jours)</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(meteoDays.length, 7)}, 1fr)`, gap: 6, marginBottom: 20 }}>
            {meteoDays.map((m, i) => {
              const isToday = m.date === today;
              const dt = new Date(m.date + "T12:00:00");
              return (
                <div key={i} style={{
                  background: isToday ? `${COLOR}15` : T.white, borderRadius: 12, padding: "10px 8px",
                  border: `1.5px solid ${isToday ? COLOR : T.border}`, textAlign: "center",
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: isToday ? COLOR : T.muted, textTransform: "uppercase" }}>
                    {dt.toLocaleDateString("fr-FR", { weekday: "short" })}
                  </div>
                  <div style={{ fontSize: 10, color: T.dark, fontWeight: 600 }}>{dt.getDate()}</div>
                  <div style={{ fontSize: 22, lineHeight: 1.2, margin: "4px 0" }}>{m.emoji}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.dark }}>{Math.round(m.temp)}°</div>
                  <div style={{ fontSize: 8, color: T.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 60 }}>{m.desc}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Quick stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        <QuickStat label="En service" value={String(shiftsToday)} color={T.bleu} />
        <QuickStat label="Commandes" value={String(pendingCommandes)} color={pendingCommandes > 0 ? COLOR : T.sauge} href="/commandes" />
        <QuickStat label="Alertes" value={alertCount != null ? String(alertCount) : "\u2014"} color={alertCount && alertCount > 0 ? COLOR : T.sauge} />
      </div>

      {/* Prochaines livraisons */}
      {deliveries.length > 0 && (
        <>
          <SectionTitle>Commandes en cours</SectionTitle>
          <div style={{ background: T.white, borderRadius: 14, padding: "10px 14px", border: `1.5px solid ${T.border}`, marginBottom: 20 }}>
            {deliveries.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: i < deliveries.length - 1 ? "1px solid #f0ebe2" : "none" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.dark }}>{d.supplier}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: T.muted }}>{d.created}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                    background: d.status === "validee" ? "#e8f5e9" : "#fff3e0",
                    color: d.status === "validee" ? "#2e7d32" : "#e65100",
                  }}>
                    {d.status === "validee" ? "Validée" : "En attente"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Stock alerts */}
      {stockAlerts.length > 0 && (
        <>
          <SectionTitle>Alertes stock</SectionTitle>
          <div style={{ background: T.white, borderRadius: 14, padding: "10px 14px", border: `1.5px solid ${T.border}`, marginBottom: 20 }}>
            {stockAlerts.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: i < stockAlerts.length - 1 ? "1px solid #f0ebe2" : "none" }}>
                <span style={{ fontSize: 12, color: T.dark }}>{s.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626" }}>min. {s.min}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Navigation rapide */}
      <SectionTitle>Acces rapide</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <NavCard href="/ventes" label="Rapport de vente" color={COLOR} />
        <NavCard href="/recettes" label="Recettes" color={COLOR} />
        <NavCard href="/commandes" label="Commandes" color={COLOR} />
        <NavCard href="/ingredients" label="Produits" color={COLOR} />
        <NavCard href="/inventaire" label="Inventaire" color={COLOR} />
        <NavCard href="/plannings" label="Planning" color={COLOR} />
        <NavCard href="/invoices" label="Factures" color={COLOR} />
        <NavCard href="/stats-achats" label="Marges" color={COLOR} />
      </div>

      {/* Retour groupe */}
      <Link href="/dashboard" style={{
        display: "block", textAlign: "center", padding: "12px 0", borderRadius: 10,
        border: `1.5px solid ${T.border}`, background: "transparent",
        fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600, color: T.muted,
        cursor: "pointer", textDecoration: "none",
      }}>
        &larr; Retour vue groupe
      </Link>
    </div>
  );
}

/* -- Sub-components -- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function KpiCard({ label, value, accent, sub, subColor }: {
  label: string; value: string; accent?: string; sub?: string; subColor?: string;
}) {
  return (
    <div style={{
      background: T.white, borderRadius: 14, padding: "14px 14px",
      border: `1.5px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 2,
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 700, color: accent ?? T.dark, fontFamily: OSWALD, lineHeight: 1.15, marginTop: 4 }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: subColor ?? T.muted, marginTop: 2 }}>{sub}</span>}
    </div>
  );
}

function QuickStat({ label, value, color, href }: { label: string; value: string; color: string; href?: string }) {
  const inner = (
    <div style={{
      background: `${color}10`, borderRadius: 12, padding: "12px 14px",
      border: `1.5px solid ${color}20`, textAlign: "center", cursor: href ? "pointer" : "default",
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: OSWALD }}>{value}</div>
      <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link>;
  return inner;
}

function NavCard({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <Link href={href} style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "14px 12px", borderRadius: 12, background: T.white,
      border: `1.5px solid ${T.border}`, textDecoration: "none",
      fontWeight: 600, fontSize: 13, color: T.dark, transition: "border-color 0.15s",
    }}>
      <span style={{ borderBottom: `2px solid ${color}40` }}>{label}</span>
    </Link>
  );
}

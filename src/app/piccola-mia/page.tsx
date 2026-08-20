"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import Chart from "chart.js/auto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";

const COLOR = "#e6c428";
const COLOR_DARK = "#b5960f";
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

function getA1Range(from: string, to: string) {
  const y1 = parseInt(from.slice(0, 4));
  const y2 = parseInt(to.slice(0, 4));
  return { from: `${y1 - 1}${from.slice(4)}`, to: `${y2 - 1}${to.slice(4)}` };
}

function defaultRange(): DateRange {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  return { from: today.slice(0, 8) + "01", to: today };
}

export default function PiccolaMiaDashboard() {
  return (
    // "manager" manquant ici provoquait une boucle / ↔ /piccola-mia
    // (RequireRole renvoyait vers / qui renvoyait ici) — Safari coupe
    // après 100 redirections : « Application error » sur le Mac Piccola
    <RequireRole allowedRoles={["group_admin", "manager", "equipier"]}>
      <PiccolaMiaContent />
    </RequireRole>
  );
}

type DailyCA = { date: string; ca: number };
type TopProduct = { name: string; ca: number; qty: number };
type MixCat = { cat: string; ca: number };
type EventItem = { id: string; name: string; date: string | null; covers: number; type: string | null; status: string };
type MeteoDay = { date: string; emoji: string; desc: string; temp: number; service: string };

function PiccolaMiaContent() {
  const { etablissements, setCurrent, setGroupView } = useEtablissement();
  const today = useMemo(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()), []);
  const etab = useMemo(() => etablissements.find((e) => e.slug?.includes("piccola")), [etablissements]);

  const [range, setRange] = useState<DateRange>(defaultRange);

  const [ca, setCa] = useState(0);
  const [caA1, setCaA1] = useState(0);
  const [couverts, setCouverts] = useState(0);
  const [couvertsA1, setCouvertsA1] = useState(0);
  const [achatsHt, setAchatsHt] = useState(0);
  const [dailyCa, setDailyCa] = useState<DailyCA[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [mixCats, setMixCats] = useState<MixCat[]>([]);
  const [loading, setLoading] = useState(true);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [pendingCommandes, setPendingCommandes] = useState(0);
  const [meteoForecast, setMeteoForecast] = useState<MeteoDay[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => today.slice(0, 7));

  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (etab) { setCurrent(etab); setGroupView(false); }
  }, [etab, setCurrent, setGroupView]);

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

    const byDate: Record<string, number> = {};
    for (const r of dailyRows) { const d = String(r.date_service); byDate[d] = (byDate[d] ?? 0) + (Number(r.ttc) || 0); }
    setDailyCa(Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, ca]) => ({ date, ca })));

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
    setAchatsHt((achatsRes.data ?? []).reduce((s, r: { total_ht: number | null }) => s + (r.total_ht ?? 0), 0));
    setLoading(false);
  }, [etab, range]);

  useEffect(() => { fetchMain(); }, [fetchMain]); // eslint-disable-line react-hooks/set-state-in-effect

  // Secondary data
  useEffect(() => {
    if (!etab) return;
    (async () => {
      const [commandesRes, eventsRes] = await Promise.all([
        supabase.from("commande_sessions").select("id").in("status", ["brouillon", "en_attente", "validee"]).eq("etablissement_id", etab.id),
        supabase.from("events").select("id, name, date, covers, type, status").gte("date", today).order("date").limit(20),
      ]);
      setPendingCommandes(commandesRes.data?.length ?? 0);
      setEvents((eventsRes.data ?? []) as EventItem[]);
      try {
        const meteoRes = await fetch(`/api/meteo?from=${today}&to=${(() => { const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() + 10); return d.toISOString().slice(0, 10); })()}`);
        const meteoData = await meteoRes.json();
        if (meteoData.meteo) setMeteoForecast(meteoData.meteo.map((m: { date_service: string; emoji: string; description: string; temp: number; service: string }) => ({ date: m.date_service, emoji: m.emoji, desc: m.description, temp: m.temp, service: m.service })));
      } catch { /* ignore */ }
    })();
  }, [etab, today]);

  // Chart
  useEffect(() => {
    if (!chartRef.current || dailyCa.length === 0) return;
    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels: dailyCa.map(d => new Date(d.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })),
        datasets: [{ label: "CA TTC", data: dailyCa.map(d => Math.round(d.ca)), backgroundColor: COLOR_DARK + "CC", borderRadius: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${(ctx.parsed.y ?? 0).toLocaleString("fr-FR")} \u20AC` } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10, family: DM_SANS } } },
          y: { grid: { color: "rgba(0,0,0,0.04)" }, ticks: { font: { size: 10, family: DM_SANS }, callback: v => `${Number(v).toLocaleString("fr-FR")}` } },
        },
      },
    });
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [dailyCa]);

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

  // Calendar
  const calendarDays = useMemo(() => {
    const [yr, mo] = calendarMonth.split("-").map(Number);
    const firstDay = new Date(yr, mo - 1, 1);
    const lastDay = new Date(yr, mo, 0).getDate();
    const startDow = firstDay.getDay() || 7;
    const days: { day: number; inMonth: boolean; events: EventItem[] }[] = [];
    for (let i = 1; i < startDow; i++) days.push({ day: 0, inMonth: false, events: [] });
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ day: d, inMonth: true, events: events.filter(e => e.date === dateStr) });
    }
    return days;
  }, [calendarMonth, events]);

  const calendarLabel = useMemo(() => {
    const [yr, mo] = calendarMonth.split("-").map(Number);
    const MONTHS = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];
    return `${MONTHS[mo - 1]} ${yr}`;
  }, [calendarMonth]);

  function shiftCalendar(offset: number) {
    const [yr, mo] = calendarMonth.split("-").map(Number);
    const d = new Date(yr, mo - 1 + offset, 1);
    setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const TYPE_COLORS: Record<string, string> = {
    mariage: "#D4775A", seminaire: "#3B82F6", anniversaire: "#8B5CF6", bapteme: "#10B981", communion: "#F59E0B",
  };

  return (
    <div className="dashboard-page" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 32px 60px", fontFamily: DM_SANS }}>

      {/* ── Header + DateRangePicker ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5, color: COLOR_DARK, marginBottom: 4 }}>
            Tableau de bord
          </div>
          <h1 style={{ fontFamily: OSWALD, fontSize: 32, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: T.dark, margin: 0, lineHeight: 1.1 }}>
            Piccola Mia
          </h1>
        </div>
        <DateRangePicker value={range} onChange={setRange} format="short" />
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
        <KpiCard label="CA TTC" value={`${fmtEur(ca)} \u20AC`} accent={COLOR_DARK} delta={deltaCa} loading={loading} />
        <KpiCard label="Couverts" value={String(couverts)} accent={T.dark} delta={deltaCouverts} loading={loading} />
        <KpiCard label="Ticket moyen" value={`${ticketMoyen.toFixed(1).replace(".", ",")} \u20AC`} accent={T.dore} delta={deltaTm} loading={loading} />
        <KpiCard label="Achats HT" value={`${fmtEur(achatsHt)} \u20AC`} accent={T.sauge} loading={loading} subtitle={ca > 0 ? `Food cost ${fmtPct(foodCost)}%` : undefined} />
      </div>

      {/* ── Main 2-col layout ── */}
      <div className="dashboard-grid" style={{ display: "grid", gap: 20, marginBottom: 28, alignItems: "start" }}>
        {/* Left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {dailyCa.length > 0 && (
            <div style={{ ...CARD, padding: "20px 22px" }}>
              <SectionTitle>CA par jour</SectionTitle>
              <div style={{ marginTop: 12 }}><canvas ref={chartRef} height={220} /></div>
            </div>
          )}

          {mixCats.length > 0 && (
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
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: COLOR_DARK, borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Calendrier events */}
          <div style={{ ...CARD, padding: "18px 20px" }}>
            <SectionTitle>Calendrier evenements</SectionTitle>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 12 }}>
              <button onClick={() => shiftCalendar(-1)} style={{ background: "none", border: "none", fontSize: 16, color: COLOR_DARK, cursor: "pointer", fontWeight: 700 }}>&#8592;</button>
              <span style={{ fontFamily: OSWALD, fontSize: 14, fontWeight: 700, color: T.dark, textTransform: "uppercase" }}>{calendarLabel}</span>
              <button onClick={() => shiftCalendar(1)} style={{ background: "none", border: "none", fontSize: 16, color: COLOR_DARK, cursor: "pointer", fontWeight: 700 }}>&#8594;</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
              {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                <div key={i} style={{ fontSize: 9, fontWeight: 700, color: T.muted, textAlign: "center", padding: "4px 0" }}>{d}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {calendarDays.map((d, i) => {
                if (!d.inMonth) return <div key={i} />;
                const isToday = `${calendarMonth}-${String(d.day).padStart(2, "0")}` === today;
                const hasEvents = d.events.length > 0;
                return (
                  <div key={i} style={{
                    position: "relative", textAlign: "center", padding: "6px 2px", borderRadius: 8,
                    background: isToday ? `${COLOR}30` : hasEvents ? "#fef9e7" : "transparent",
                    border: isToday ? `2px solid ${COLOR_DARK}` : "none", minHeight: 36,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 500, color: isToday ? COLOR_DARK : T.dark }}>{d.day}</div>
                    {d.events.map((ev, ei) => (
                      <Link key={ei} href={`/evenements/${ev.id}`} style={{
                        display: "block", fontSize: 7, fontWeight: 700, color: "#fff",
                        background: TYPE_COLORS[ev.type ?? ""] ?? COLOR_DARK,
                        borderRadius: 3, padding: "1px 3px", marginTop: 1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none",
                      }}>
                        {ev.name.slice(0, 10)}{ev.covers > 0 ? ` · ${ev.covers}` : ""}
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {topProducts.length > 0 && (
            <div style={{ ...CARD, padding: "18px 20px" }}>
              <SectionTitle>Top produits</SectionTitle>
              <div style={{ marginTop: 8 }}>
                {topProducts.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < topProducts.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                    <span style={{ fontSize: 11, color: "#ccc", width: 16, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 12, color: T.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{p.qty}x</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: OSWALD, color: COLOR_DARK, flexShrink: 0 }}>{fmtEur(p.ca)}{"\u20AC"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ ...CARD, padding: "14px", textAlign: "center", background: `${COLOR_DARK}08`, border: `1px solid ${COLOR_DARK}15` }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: COLOR_DARK, fontFamily: OSWALD }}>{pendingCommandes}</div>
            <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, marginTop: 2 }}>Commandes en cours</div>
          </div>

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
                      background: isToday ? `${COLOR}20` : "transparent",
                      border: isToday ? `1.5px solid ${COLOR_DARK}` : "1.5px solid transparent",
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: isToday ? COLOR_DARK : T.muted, textTransform: "uppercase" }}>{dt.toLocaleDateString("fr-FR", { weekday: "short" })}</div>
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
          { href: "/recettes", label: "Recettes" },
          { href: "/commandes", label: "Commandes" },
          { href: "/evenements", label: "Evenements" },
          { href: "/ingredients", label: "Produits" },
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

function KpiCard({ label, value, accent, delta, loading, subtitle }: {
  label: string; value: string; accent: string; delta?: number | null; loading: boolean; subtitle?: string;
}) {
  return (
    <div style={{ ...CARD, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 700, color: accent, fontFamily: OSWALD, lineHeight: 1.15, marginTop: 6, opacity: loading ? 0.4 : 1, transition: "opacity 0.2s" }}>{value}</span>
      {subtitle && <span style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{subtitle}</span>}
      {delta != null && (
        <span style={{ fontSize: 11, fontWeight: 600, color: delta >= 0 ? T.sauge : "#DC2626", marginTop: 4 }}>
          {delta > 0 ? "+" : ""}{Math.round(delta)}% vs A-1
        </span>
      )}
    </div>
  );
}

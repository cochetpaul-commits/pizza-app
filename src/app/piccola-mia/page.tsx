"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";

const COLOR = "#e6c428";
const COLOR_LIGHT = "#f8edb0";

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
  const label = d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `CA du ${label}`;
}

function formatTicketsLabel(dateStr: string, today: string): string {
  if (dateStr === today) return "Tickets du jour";
  const d = new Date(dateStr + "T12:00:00");
  const label = d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `Tickets du ${label}`;
}

async function fetchAllRows(
  etabId: string,
  from: string,
  to: string,
): Promise<{ ttc: number; num_fiscal: string | null }[]> {
  let all: { ttc: number; num_fiscal: string | null }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ventes_lignes")
      .select("ttc, num_fiscal")
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

export default function PiccolaMiaDashboard() {
  return (
    <RequireRole allowedRoles={["group_admin", "equipier"]}>
      <PiccolaMiaContent />
    </RequireRole>
  );
}

function PiccolaMiaContent() {
  const { etablissements, setCurrent, setGroupView } = useEtablissement();

  const today = useMemo(
    () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()),
    [],
  );

  const etab = useMemo(
    () => etablissements.find((e) => e.slug?.includes("piccola")),
    [etablissements],
  );

  const [lastDay, setLastDay] = useState<string | null>(null);
  const [caDay, setCaDay] = useState(0);
  const [caPrev, setCaPrev] = useState(0);
  const [tickets, setTickets] = useState(0);
  const [caWeek, setCaWeek] = useState(0);
  const [caMonth, setCaMonth] = useState(0);
  const [ticketsMonth, setTicketsMonth] = useState(0);
  const [shiftsToday, setShiftsToday] = useState(0);
  const [pendingCommandes, setPendingCommandes] = useState(0);
  const [alertCount, setAlertCount] = useState<number | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<
    { id: string; name: string; date: string | null; covers: number }[]
  >([]);

  // Set context to Piccola Mia
  useEffect(() => {
    if (etab) {
      setCurrent(etab);
      setGroupView(false);
    }
  }, [etab, setCurrent, setGroupView]);

  // Single consolidated fetch
  const fetchAll = useCallback(async () => {
    if (!etab) return;

    // 1. Find last day with data
    const { data: lastRow } = await supabase
      .from("ventes_lignes")
      .select("date_service")
      .eq("etablissement_id", etab.id)
      .eq("type_ligne", "Produit")
      .order("date_service", { ascending: false })
      .limit(1);
    const ld = lastRow?.[0]?.date_service ?? today;
    setLastDay(ld);

    const prevDay = getPrevDay(ld);
    const monday = getMonday(ld);
    const firstOfMonth = ld.slice(0, 8) + "01";

    // 2. Fetch all data in parallel
    const [dayData, prevData, monthData, shiftsRes, commandesRes, alertsRes, eventsRes] =
      await Promise.all([
        // Day data
        supabase
          .from("ventes_lignes")
          .select("ttc, num_fiscal")
          .eq("etablissement_id", etab.id)
          .eq("date_service", ld)
          .eq("type_ligne", "Produit"),
        // Previous day data
        supabase
          .from("ventes_lignes")
          .select("ttc")
          .eq("etablissement_id", etab.id)
          .eq("date_service", prevDay)
          .eq("type_ligne", "Produit"),
        // Month data (paginated)
        fetchAllRows(etab.id, firstOfMonth, ld),
        // Shifts today
        supabase
          .from("shifts")
          .select("id")
          .eq("date", today)
          .eq("etablissement_id", etab.id),
        // Pending commandes
        supabase
          .from("commande_sessions")
          .select("id")
          .in("status", ["brouillon", "en_attente"])
          .eq("etablissement_id", etab.id),
        // Alerts
        supabase
          .from("supplier_invoice_lines")
          .select("id", { count: "exact", head: true })
          .eq("needs_review", true),
        // Upcoming events
        supabase
          .from("events")
          .select("id, name, date, covers")
          .gte("date", today)
          .in("status", ["confirme", "en_cours"])
          .order("date")
          .limit(3),
      ]);

    // Process day
    if (dayData.data) {
      const ca = dayData.data.reduce((s, r) => s + (r.ttc ?? 0), 0);
      const uniqueTickets = new Set(
        dayData.data.map((r) => r.num_fiscal).filter(Boolean),
      );
      setCaDay(ca);
      setTickets(uniqueTickets.size);
    }

    // Process previous day
    if (prevData.data) {
      setCaPrev(prevData.data.reduce((s, r) => s + (r.ttc ?? 0), 0));
    }

    // Process month data
    const monthCa = monthData.reduce((s, r) => s + (r.ttc ?? 0), 0);
    const monthTickets = new Set(monthData.map((r) => r.num_fiscal).filter(Boolean));
    setCaMonth(monthCa);
    setTicketsMonth(monthTickets.size);

    // Week CA
    const weekRows = await fetchAllRows(etab.id, monday, ld);
    setCaWeek(weekRows.reduce((s, r) => s + (r.ttc ?? 0), 0));

    // Shifts, commandes, alerts, events
    setShiftsToday(shiftsRes.data?.length ?? 0);
    setPendingCommandes(commandesRes.data?.length ?? 0);
    setAlertCount(alertsRes.count ?? 0);
    setUpcomingEvents(eventsRes.data ?? []);
  }, [etab, today]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const ticketMoyen = tickets > 0 ? caDay / tickets : 0;
  const deltaCa =
    caPrev > 0 ? Math.round(((caDay - caPrev) / caPrev) * 100) : null;

  const dayLabel = lastDay ? formatDayLabel(lastDay, today) : "CA du jour";
  const ticketsLabel = lastDay ? formatTicketsLabel(lastDay, today) : "Tickets du jour";
  const deltaLabel = lastDay === today ? "vs hier" : `vs ${(() => {
    const prev = getPrevDay(lastDay ?? today);
    const d = new Date(prev + "T12:00:00");
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
  })()}`;

  const dateDisplay = new Date().toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 16px 40px" }}>
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(135deg, ${COLOR} 0%, ${COLOR_LIGHT} 100%)`,
          borderRadius: 16,
          padding: "24px 20px 20px",
          marginBottom: 20,
          color: "#fff",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            opacity: 0.8,
            marginBottom: 4,
          }}
        >
          Tableau de bord
        </div>
        <div
          style={{
            fontFamily: "var(--font-oswald), Oswald, sans-serif",
            fontSize: 28,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Piccola Mia
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{dateDisplay}</div>
      </div>

      {/* KPI cards 3x2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <KpiCard
          label={dayLabel}
          value={`${fmtEur(caDay)} \u20AC`}
          accent={COLOR}
          sub={
            deltaCa != null ? `${deltaCa > 0 ? "+" : ""}${deltaCa}% ${deltaLabel}` : undefined
          }
          subColor={deltaCa != null ? (deltaCa >= 0 ? T.sauge : "#DC2626") : undefined}
        />
        <KpiCard label={ticketsLabel} value={String(tickets)} accent={T.dark} />
        <KpiCard
          label="Ticket moyen"
          value={`${ticketMoyen.toFixed(1).replace(".", ",")} \u20AC`}
          accent={T.dark}
        />
        <KpiCard label="CA semaine" value={`${fmtEur(caWeek)} \u20AC`} accent={COLOR} />
        <KpiCard label="CA mois" value={`${fmtEur(caMonth)} \u20AC`} accent={COLOR} />
        <KpiCard label="Tickets mois" value={String(ticketsMonth)} accent={T.dark} />
      </div>

      {/* Quick stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <QuickStat label="En service" value={String(shiftsToday)} color={T.bleu} />
        <QuickStat
          label="Commandes"
          value={String(pendingCommandes)}
          color={pendingCommandes > 0 ? COLOR : T.sauge}
          href="/commandes"
        />
        <QuickStat
          label="Alertes"
          value={alertCount != null ? String(alertCount) : "\u2014"}
          color={alertCount && alertCount > 0 ? COLOR : T.sauge}
        />
      </div>

      {/* Evenements a venir */}
      {upcomingEvents.length > 0 && (
        <>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: T.muted,
              marginBottom: 10,
            }}
          >
            Evenements a venir
          </div>
          <div style={{ display: "grid", gap: 6, marginBottom: 20 }}>
            {upcomingEvents.map((ev) => (
              <Link
                key={ev.id}
                href={`/evenements/${ev.id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 14px",
                  background: T.white,
                  borderRadius: 12,
                  border: `1.5px solid ${T.border}`,
                  textDecoration: "none",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 13, color: T.dark }}>{ev.name}</span>
                <span style={{ fontSize: 11, color: T.muted }}>
                  {ev.date
                    ? new Date(ev.date).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                      })
                    : "\u2014"}
                  {ev.covers > 0 ? ` \u00B7 ${ev.covers} couv.` : ""}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Navigation rapide */}
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: T.muted,
          marginBottom: 10,
        }}
      >
        Acces rapide
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 20,
        }}
      >
        <NavCard href="/plannings" label="Planning" color={COLOR} />
        <NavCard href="/recettes" label="Recettes" color={COLOR} />
        <NavCard href="/commandes" label="Commandes" color={COLOR} />
        <NavCard href="/evenements" label="Evenements" color={COLOR} />
      </div>

      {/* Retour groupe */}
      <Link
        href="/dashboard"
        style={{
          display: "block",
          textAlign: "center",
          padding: "12px 0",
          borderRadius: 10,
          border: `1.5px solid ${T.border}`,
          background: "transparent",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13,
          fontWeight: 600,
          color: T.muted,
          cursor: "pointer",
          textDecoration: "none",
        }}
      >
        &larr; Retour vue groupe
      </Link>
    </div>
  );
}

/* -- Sub-components -- */

function KpiCard({
  label,
  value,
  accent,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div
      style={{
        background: T.white,
        borderRadius: 14,
        padding: "14px 14px",
        border: `1.5px solid ${T.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: T.muted,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: accent ?? T.dark,
          fontFamily: "var(--font-oswald), Oswald, sans-serif",
          lineHeight: 1.15,
          marginTop: 4,
        }}
      >
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 10, color: subColor ?? T.muted, marginTop: 2 }}>{sub}</span>
      )}
    </div>
  );
}

function QuickStat({
  label,
  value,
  color,
  href,
}: {
  label: string;
  value: string;
  color: string;
  href?: string;
}) {
  const inner = (
    <div
      style={{
        background: `${color}10`,
        borderRadius: 12,
        padding: "12px 14px",
        border: `1.5px solid ${color}20`,
        textAlign: "center",
        cursor: href ? "pointer" : "default",
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color,
          fontFamily: "var(--font-oswald), Oswald, sans-serif",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
  if (href)
    return (
      <Link href={href} style={{ textDecoration: "none" }}>
        {inner}
      </Link>
    );
  return inner;
}

function NavCard({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "14px 12px",
        borderRadius: 12,
        background: T.white,
        border: `1.5px solid ${T.border}`,
        textDecoration: "none",
        fontWeight: 600,
        fontSize: 13,
        color: T.dark,
        transition: "border-color 0.15s",
      }}
    >
      <span style={{ borderBottom: `2px solid ${color}40` }}>{label}</span>
    </Link>
  );
}

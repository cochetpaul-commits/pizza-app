"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";

const GROUP_COLOR = "#b45f57";

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getFirstOfMonth(dateStr: string): string {
  return dateStr.slice(0, 8) + "01";
}

type EtabKpis = {
  caToday: number;
  caYesterday: number;
  couverts: number;
  couvertsYesterday: number;
};

export default function GroupDashboard() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <GroupContent />
    </RequireRole>
  );
}

function GroupContent() {
  const { etablissements, setGroupView } = useEtablissement();

  const today = useMemo(
    () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()),
    [],
  );
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
  }, []);
  const monday = useMemo(() => getMonday(today), [today]);
  const firstOfMonth = useMemo(() => getFirstOfMonth(today), [today]);

  const [caWeek, setCaWeek] = useState(0);
  const [caMonth, setCaMonth] = useState(0);
  const [etabData, setEtabData] = useState<Record<string, EtabKpis>>({});
  const [lastDataDay, setLastDataDay] = useState<string | null>(null);

  // Set group view
  useEffect(() => {
    setGroupView(true);
  }, [setGroupView]);

  // Fetch per-establishment data — today or last day with data
  useEffect(() => {
    if (etablissements.length === 0) return;
    (async () => {
      const result: Record<string, EtabKpis> = {};

      // Find last day with data (in case today has no data yet)
      const { data: lastRow } = await supabase
        .from("ventes_lignes")
        .select("date_service")
        .eq("type_ligne", "Produit")
        .order("date_service", { ascending: false })
        .limit(1);
      const lastDay = lastRow?.[0]?.date_service ?? today;
      const prevDay = (() => {
        const d = new Date(lastDay + "T12:00:00");
        d.setDate(d.getDate() - 1);
        // Skip weekends
        if (d.getDay() === 0) d.setDate(d.getDate() - 2);
        if (d.getDay() === 6) d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
      })();
      setLastDataDay(lastDay);

      for (const etab of etablissements) {
        // Last day with data (or today)
        const { data: todayData } = await supabase
          .from("ventes_lignes")
          .select("ttc, num_fiscal")
          .eq("etablissement_id", etab.id)
          .eq("date_service", lastDay)
          .eq("type_ligne", "Produit");

        const caToday = (todayData ?? []).reduce((s, r) => s + (r.ttc ?? 0), 0);
        const couvertsToday = new Set(
          (todayData ?? []).map((r) => r.num_fiscal).filter(Boolean),
        ).size;

        // Previous day
        const { data: yData } = await supabase
          .from("ventes_lignes")
          .select("ttc, num_fiscal")
          .eq("etablissement_id", etab.id)
          .eq("date_service", prevDay)
          .eq("type_ligne", "Produit");

        const caYest = (yData ?? []).reduce((s, r) => s + (r.ttc ?? 0), 0);
        const couvertsYest = new Set(
          (yData ?? []).map((r) => r.num_fiscal).filter(Boolean),
        ).size;

        result[etab.id] = {
          caToday,
          caYesterday: caYest,
          couverts: couvertsToday,
          couvertsYesterday: couvertsYest,
        };
      }
      setEtabData(result);
    })();
  }, [etablissements, today]);

  // CA week (all establishments)
  useEffect(() => {
    if (etablissements.length === 0) return;
    (async () => {
      let total = 0;
      for (const etab of etablissements) {
        const { data } = await supabase
          .from("ventes_lignes")
          .select("ttc")
          .eq("etablissement_id", etab.id)
          .gte("date_service", monday)
          .lte("date_service", today)
          .eq("type_ligne", "Produit");
        total += (data ?? []).reduce((s, r) => s + (r.ttc ?? 0), 0);
      }
      setCaWeek(total);
    })();
  }, [etablissements, monday, today]);

  // CA month (all establishments)
  useEffect(() => {
    if (etablissements.length === 0) return;
    (async () => {
      let total = 0;
      for (const etab of etablissements) {
        const { data } = await supabase
          .from("ventes_lignes")
          .select("ttc")
          .eq("etablissement_id", etab.id)
          .gte("date_service", firstOfMonth)
          .lte("date_service", today)
          .eq("type_ligne", "Produit");
        total += (data ?? []).reduce((s, r) => s + (r.ttc ?? 0), 0);
      }
      setCaMonth(total);
    })();
  }, [etablissements, firstOfMonth, today]);

  // Derived totals
  const totalCaToday = Object.values(etabData).reduce((s, d) => s + d.caToday, 0);
  const totalCouverts = Object.values(etabData).reduce((s, d) => s + d.couverts, 0);

  const dateDisplay = new Date().toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px 16px 40px" }}>
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(135deg, ${GROUP_COLOR} 0%, ${GROUP_COLOR}DD 100%)`,
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
            opacity: 0.7,
            marginBottom: 4,
          }}
        >
          Vue groupe
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
          iFratelli Group
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{dateDisplay}</div>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <SummaryCard label={lastDataDay === today ? "CA Groupe aujourd'hui" : `CA Groupe ${new Date(lastDataDay + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}`} value={`${fmtEur(totalCaToday)} \u20AC`} accent={GROUP_COLOR} />
        <SummaryCard label="CA Groupe semaine" value={`${fmtEur(caWeek)} \u20AC`} accent={GROUP_COLOR} />
        <SummaryCard label="CA Groupe mois" value={`${fmtEur(caMonth)} \u20AC`} accent={GROUP_COLOR} />
        <SummaryCard label={lastDataDay === today ? "Couverts aujourd'hui" : `Couverts ${new Date(lastDataDay + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}`} value={String(totalCouverts)} accent={T.dark} />
      </div>

      {/* Per-establishment comparison */}
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
        Par etablissement
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {etablissements.map((etab) => {
          const d = etabData[etab.id] ?? { caToday: 0, caYesterday: 0, couverts: 0, couvertsYesterday: 0 };
          const ticket = d.couverts > 0 ? d.caToday / d.couverts : 0;
          const delta =
            d.caYesterday > 0
              ? Math.round(((d.caToday - d.caYesterday) / d.caYesterday) * 100)
              : null;
          const color = etab.slug?.includes("bello") ? T.belloMio : T.piccolaMia;
          const slug = etab.slug?.includes("bello") ? "/bello-mio" : "/piccola-mia";

          return (
            <Link
              key={etab.id}
              href={slug}
              style={{ textDecoration: "none" }}
            >
              <div
                style={{
                  background: T.white,
                  borderRadius: 14,
                  padding: "16px 14px",
                  border: `1.5px solid ${T.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {/* Name + color dot */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-oswald), Oswald, sans-serif",
                      fontSize: 16,
                      fontWeight: 700,
                      color: T.dark,
                      textTransform: "uppercase",
                    }}
                  >
                    {etab.nom}
                  </span>
                </div>

                <Row label="CA du jour" value={`${fmtEur(d.caToday)} \u20AC`} />
                <Row label="Couverts" value={String(d.couverts)} />
                <Row label="Ticket moyen" value={`${ticket.toFixed(1).replace(".", ",")} \u20AC`} />
                {delta != null && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: delta >= 0 ? T.sauge : "#DC2626",
                      marginTop: 2,
                    }}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta}% vs hier
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick access */}
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
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 8,
          marginBottom: 20,
        }}
      >
        <NavCard href="/plannings" label="Planning" />
        <NavCard href="/commandes" label="Commandes" />
        <NavCard href="/recettes" label="Recettes" />
        <NavCard href="/ventes" label="Ventes" />
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
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
          color: accent,
          fontFamily: "var(--font-oswald), Oswald, sans-serif",
          lineHeight: 1.15,
          marginTop: 4,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: T.muted }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: T.dark,
          fontFamily: "var(--font-oswald), Oswald, sans-serif",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function NavCard({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "14px 8px",
        borderRadius: 12,
        background: T.white,
        border: `1.5px solid ${T.border}`,
        textDecoration: "none",
        fontWeight: 600,
        fontSize: 12,
        color: T.dark,
        transition: "border-color 0.15s",
      }}
    >
      <span style={{ borderBottom: `2px solid ${GROUP_COLOR}40` }}>{label}</span>
    </Link>
  );
}

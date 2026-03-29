"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";

const COLOR = "#e27f57";

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

export default function BelloMioDashboard() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <BelloMioContent />
    </RequireRole>
  );
}

function BelloMioContent() {
  const { etablissements, setCurrent, setGroupView } = useEtablissement();

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

  const etab = useMemo(
    () => etablissements.find((e) => e.slug?.includes("bello")),
    [etablissements],
  );

  const [caToday, setCaToday] = useState(0);
  const [caYesterday, setCaYesterday] = useState(0);
  const [couverts, setCouverts] = useState(0);
  const [caWeek, setCaWeek] = useState(0);
  const [shiftsToday, setShiftsToday] = useState(0);
  const [pendingCommandes, setPendingCommandes] = useState(0);
  const [alertCount, setAlertCount] = useState<number | null>(null);

  // Set context to Bello Mio
  useEffect(() => {
    if (etab) {
      setCurrent(etab);
      setGroupView(false);
    }
  }, [etab, setCurrent, setGroupView]);

  // Fetch CA today + couverts from ventes_lignes
  useEffect(() => {
    if (!etab) return;
    (async () => {
      const { data } = await supabase
        .from("ventes_lignes")
        .select("ttc, num_fiscal")
        .eq("etablissement_id", etab.id)
        .eq("date_service", today)
        .eq("type_ligne", "Produit");
      if (!data) return;
      const ca = data.reduce((s, r) => s + (r.ttc ?? 0), 0);
      const uniqueTickets = new Set(data.map((r) => r.num_fiscal).filter(Boolean));
      setCaToday(ca);
      setCouverts(uniqueTickets.size);
    })();
  }, [etab, today]);

  // CA yesterday
  useEffect(() => {
    if (!etab) return;
    (async () => {
      const { data } = await supabase
        .from("ventes_lignes")
        .select("ttc")
        .eq("etablissement_id", etab.id)
        .eq("date_service", yesterday)
        .eq("type_ligne", "Produit");
      if (!data) return;
      setCaYesterday(data.reduce((s, r) => s + (r.ttc ?? 0), 0));
    })();
  }, [etab, yesterday]);

  // CA week
  useEffect(() => {
    if (!etab) return;
    (async () => {
      const { data } = await supabase
        .from("ventes_lignes")
        .select("ttc")
        .eq("etablissement_id", etab.id)
        .gte("date_service", monday)
        .lte("date_service", today)
        .eq("type_ligne", "Produit");
      if (!data) return;
      setCaWeek(data.reduce((s, r) => s + (r.ttc ?? 0), 0));
    })();
  }, [etab, monday, today]);

  // Shifts today
  useEffect(() => {
    if (!etab) return;
    (async () => {
      const { data } = await supabase
        .from("shifts")
        .select("id")
        .eq("date", today)
        .eq("etablissement_id", etab.id);
      setShiftsToday(data?.length ?? 0);
    })();
  }, [etab, today]);

  // Pending commandes
  useEffect(() => {
    if (!etab) return;
    (async () => {
      const { data } = await supabase
        .from("commande_sessions")
        .select("id")
        .in("status", ["brouillon", "en_attente"])
        .eq("etablissement_id", etab.id);
      setPendingCommandes(data?.length ?? 0);
    })();
  }, [etab]);

  // Alerts (supplier_invoice_lines needs_review)
  useEffect(() => {
    (async () => {
      try {
        const { count } = await supabase
          .from("supplier_invoice_lines")
          .select("id", { count: "exact", head: true })
          .eq("needs_review", true);
        setAlertCount(count ?? 0);
      } catch {
        setAlertCount(null);
      }
    })();
  }, []);

  const ticketMoyen = couverts > 0 ? caToday / couverts : 0;
  const deltaCa =
    caYesterday > 0 ? Math.round(((caToday - caYesterday) / caYesterday) * 100) : null;

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
          background: `linear-gradient(135deg, ${COLOR} 0%, ${COLOR}DD 100%)`,
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
          Bello Mio
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{dateDisplay}</div>
      </div>

      {/* KPI cards 2x2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <KpiCard
          label="CA du jour"
          value={`${fmtEur(caToday)} \u20AC`}
          accent={COLOR}
          sub={
            deltaCa != null ? `${deltaCa > 0 ? "+" : ""}${deltaCa}% vs hier` : undefined
          }
          subColor={deltaCa != null ? (deltaCa >= 0 ? T.sauge : "#DC2626") : undefined}
        />
        <KpiCard label="Couverts du jour" value={String(couverts)} accent={T.dark} />
        <KpiCard
          label="Ticket moyen"
          value={`${ticketMoyen.toFixed(1).replace(".", ",")} \u20AC`}
          accent={T.dark}
        />
        <KpiCard label="CA semaine" value={`${fmtEur(caWeek)} \u20AC`} accent={COLOR} />
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
        <NavCard href="/ventes" label="Ventes" color={COLOR} />
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

/* ── Sub-components ── */

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

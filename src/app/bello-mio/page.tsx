"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import { T } from "@/lib/tokens";
import { fetchPriceAlerts } from "@/lib/priceAlerts";

const COLOR = "#e27f57";

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function BelloMioDashboard() {
  const { isGroupAdmin } = useProfile();
  const { etablissements, setCurrent, setGroupView } = useEtablissement();

  const [caToday, setCaToday] = useState(0);
  const [couverts, setCouverts] = useState(0);
  const [ticketMoyen, setTicketMoyen] = useState(0);
  const [caSoir, setCaSoir] = useState(0);
  const [caYesterday, setCaYesterday] = useState<number | null>(null);
  const [shiftsToday, setShiftsToday] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [pendingCommandes, setPendingCommandes] = useState(0);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterday = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const etab = useMemo(() => etablissements.find(e => e.slug?.includes("bello")), [etablissements]);

  // Set context to Bello Mio
  useEffect(() => {
    if (etab) { setCurrent(etab); setGroupView(false); }
  }, [etab, setCurrent, setGroupView]);

  // Fetch CA Popina
  useEffect(() => {
    if (!isGroupAdmin) return;
    (async () => {
      try {
        const res = await fetchApi("/api/popina/ca-jour");
        if (!res.ok) return;
        const d = await res.json();
        setCaToday(d.totalSales ?? 0);
        setCouverts(d.guestsNumber ?? 0);
        setTicketMoyen(d.ticketMoyen ?? 0);
        setCaSoir(d.soir?.ca ?? 0);
      } catch { /* */ }
    })();
  }, [isGroupAdmin]);

  // CA yesterday
  useEffect(() => {
    if (!etab) return;
    (async () => {
      const { data } = await supabase.from("daily_sales").select("ca_ttc").eq("date", yesterday).eq("etablissement_id", etab.id).maybeSingle();
      setCaYesterday(data?.ca_ttc ?? null);
    })();
  }, [etab, yesterday]);

  // Shifts today
  useEffect(() => {
    if (!etab) return;
    (async () => {
      const { data } = await supabase.from("shifts").select("id").eq("date", today).eq("etablissement_id", etab.id);
      setShiftsToday(data?.length ?? 0);
    })();
  }, [etab, today]);

  // Pending commandes
  useEffect(() => {
    if (!etab) return;
    (async () => {
      const { data } = await supabase.from("commande_sessions").select("id").in("status", ["brouillon", "en_attente"]).eq("etablissement_id", etab.id);
      setPendingCommandes(data?.length ?? 0);
    })();
  }, [etab]);

  // Price alerts
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { const a = await fetchPriceAlerts(supabase, user.id); setAlertCount(a.length); }
      } catch { /* */ }
    })();
  }, []);

  const deltaCa = caYesterday && caYesterday > 0 ? Math.round(((caToday - caYesterday) / caYesterday) * 100) : null;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 16px 40px" }}>

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${COLOR} 0%, ${COLOR}DD 100%)`,
        borderRadius: 16, padding: "24px 20px 20px", marginBottom: 20,
        color: "#fff",
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.7, marginBottom: 4 }}>
          Tableau de bord
        </div>
        <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
          Bello Mio
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <KpiCard label="CA du jour" value={`${fmtEur(caToday)} €`} accent={COLOR}
          sub={deltaCa != null ? `${deltaCa > 0 ? "+" : ""}${deltaCa}% vs hier` : undefined}
          subColor={deltaCa != null ? (deltaCa > 0 ? T.sauge : "#DC2626") : undefined} />
        <KpiCard label="Couverts" value={String(couverts)} accent={T.dark} />
        <KpiCard label="Ticket moyen" value={`${ticketMoyen.toFixed(1).replace(".", ",")} €`} accent={T.dark} />
        <KpiCard label="CA soir" value={`${fmtEur(caSoir)} €`} accent={COLOR} />
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        <QuickStat label="En service" value={String(shiftsToday)} color={T.bleu} />
        <QuickStat label="Commandes" value={String(pendingCommandes)} color={pendingCommandes > 0 ? COLOR : T.sauge} href="/commandes" />
        <QuickStat label="Alertes prix" value={String(alertCount)} color={alertCount > 0 ? COLOR : T.sauge} href="/variations-prix" />
      </div>

      {/* Navigation rapide */}
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
        textTransform: "uppercase", color: T.muted, marginBottom: 10,
      }}>
        Acces rapide
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <NavCard href="/plannings" label="Planning" color={COLOR} />
        <NavCard href="/recettes" label="Fiches techniques" color={COLOR} />
        <NavCard href="/commandes" label="Commandes" color={COLOR} />
        <NavCard href="/stats-achats" label="Stats achats" color={COLOR} />
      </div>

      {/* Retour groupe */}
      <Link
        href="/dashboard"
        style={{
          display: "block", textAlign: "center", padding: "12px 0", borderRadius: 10,
          border: `1.5px solid ${T.border}`, background: "transparent",
          fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600,
          color: T.muted, cursor: "pointer", textDecoration: "none",
        }}
      >
        &larr; Retour vue groupe
      </Link>
    </div>
  );
}

/* ── Sub-components ── */

function KpiCard({ label, value, accent, sub, subColor }: {
  label: string; value: string; accent?: string; sub?: string; subColor?: string;
}) {
  return (
    <div style={{
      background: T.white, borderRadius: 14, padding: "14px 14px",
      border: `1.5px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 2,
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 700, color: accent ?? T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif", lineHeight: 1.15, marginTop: 4 }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: subColor ?? T.muted, marginTop: 2 }}>{sub}</span>}
    </div>
  );
}

function QuickStat({ label, value, color, href }: { label: string; value: string; color: string; href?: string }) {
  const inner = (
    <div style={{
      background: `${color}10`, borderRadius: 12, padding: "12px 14px",
      border: `1.5px solid ${color}20`, textAlign: "center",
      cursor: href ? "pointer" : "default",
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{value}</div>
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
      padding: "14px 12px", borderRadius: 12,
      background: T.white, border: `1.5px solid ${T.border}`,
      textDecoration: "none", fontWeight: 600, fontSize: 13, color: T.dark,
      transition: "border-color 0.15s",
    }}>
      <span style={{ borderBottom: `2px solid ${color}40` }}>{label}</span>
    </Link>
  );
}

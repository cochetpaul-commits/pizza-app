"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import { T } from "@/lib/tokens";
import { TileIcon } from "@/components/TileIcon";
import { fetchPriceAlerts } from "@/lib/priceAlerts";

type CaData = { totalSales: number; guestsNumber: number; ticketMoyen: number; soir: { ca: number; couverts: number } } | null;
type PmData = { ca: number; couverts: number; panier_moyen: number } | null;
type UpcomingEvent = { id: string; name: string; date: string | null; status: string; covers: number };
type EtabDayData = { ca: number; couverts: number };
type GroupAlert = { text: string; etab: string; badge: string; color: string };
type RecentImport = { id: string; created_at: string; fournisseur: string | null; status: string };

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/* ───────── Helper: get Monday of next week ───────── */
function getNextWeekMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? 1 : 8 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function getNextWeekSunday(): string {
  const mon = new Date(getNextWeekMonday());
  mon.setDate(mon.getDate() + 6);
  return mon.toISOString().slice(0, 10);
}

/* ───────── Sub-components ───────── */

function KpiCard({ label, value, sub, accent, subColor, progress }: {
  label: string; value: string; sub?: string; accent?: string;
  subColor?: string;
  progress?: { value: number; max: number; color: string };
}) {
  return (
    <div style={{
      background: T.white, borderRadius: 14, padding: "14px 12px",
      border: `1.5px solid ${T.border}`,
      display: "flex", flexDirection: "column", gap: 2,
      minHeight: 80,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
        textTransform: "uppercase", color: T.muted,
        fontFamily: "DM Sans, sans-serif", lineHeight: 1.2,
      }}>{label}</span>
      <span style={{
        fontSize: 26, fontWeight: 700, color: accent ?? T.dark,
        fontFamily: "var(--font-oswald), Oswald, sans-serif",
        lineHeight: 1.15, marginTop: 4,
      }}>{value}</span>
      {sub && (
        <span style={{ fontSize: 10, color: subColor ?? T.muted, marginTop: 2 }}>{sub}</span>
      )}
      {progress && (
        <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: T.border, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 2, background: progress.color, width: `${Math.min(100, (progress.value / progress.max) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function TaskCard({ href, icon, title, subtitle, accent, count }: {
  href: string; icon: React.ComponentProps<typeof TileIcon>["name"];
  title: string; subtitle: string; accent: string; count?: number;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{
        background: T.white, borderRadius: 14, padding: "14px 16px",
        border: `1.5px solid ${T.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        cursor: "pointer", transition: "box-shadow 0.15s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${accent}12`, display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <TileIcon name={icon} size={18} color={accent} />
          </div>
          <div>
            <div style={{
              fontFamily: "DM Sans, sans-serif", fontWeight: 700,
              fontSize: 13, color: T.dark, lineHeight: 1.3,
            }}>
              {title}
              {count !== undefined && count > 0 && (
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 18, height: 18, borderRadius: 9,
                  background: accent, color: "#fff",
                  fontSize: 10, fontWeight: 700, padding: "0 5px",
                  marginLeft: 8, verticalAlign: "middle",
                }}>{count}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{subtitle}</div>
          </div>
        </div>
        <span style={{ fontSize: 11, color: T.terracotta, fontWeight: 600, flexShrink: 0 }}>Voir</span>
      </div>
    </Link>
  );
}

/* ───────── Main ───────── */

export default function DashboardPage() {
  const { role, isGroupAdmin } = useProfile();
  const { isGroupView, current, etablissements, setCurrent, setGroupView } = useEtablissement();
  const isAdmin = isGroupAdmin;

  // Always show group view on dashboard for admins
  useEffect(() => {
    if (isGroupAdmin && !isGroupView) {
      setGroupView(true);
    }
  }, [isGroupAdmin, isGroupView, setGroupView]);

  const [ca, setCa] = useState<CaData>(null);
  const [caPM, setCaPM] = useState<PmData>(null);
  const [caYesterday, setCaYesterday] = useState<number | null>(null);
  const [caYesterdayBM, setCaYesterdayBM] = useState<EtabDayData | null>(null);
  const [caYesterdayPM, setCaYesterdayPM] = useState<EtabDayData | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [pendingCommandes, setPendingCommandes] = useState(0);
  const [shiftsToday, setShiftsToday] = useState(0);
  const [nextWeekHasShifts, setNextWeekHasShifts] = useState<boolean | null>(null);
  const [heuresBM, setHeuresBM] = useState<number | null>(null);
  const [heuresPM, setHeuresPM] = useState<number | null>(null);
  const [groupAlerts, setGroupAlerts] = useState<GroupAlert[]>([]);
  const [recentImports, setRecentImports] = useState<RecentImport[]>([]);

  // Monthly CA
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [monthData, setMonthData] = useState<{ caMois: number; couvertsMois: number; ticketMoyen: number; caPrevMois: number; variation: number; moyJournaliere: number; nbJours: number } | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  // Fetch CA Popina (Bello Mio today)
  useEffect(() => {
    async function fetchCa() {
      try {
        const res = await fetchApi("/api/popina/ca-jour");
        if (!res.ok) return;
        const d = await res.json();
        setCa({
          totalSales: d.totalSales ?? 0,
          guestsNumber: d.guestsNumber ?? 0,
          ticketMoyen: d.ticketMoyen ?? 0,
          soir: { ca: d.soir?.ca ?? 0, couverts: d.soir?.couverts ?? 0 },
        });
      } catch { /* silencieux */ }
    }
    if (isAdmin) fetchCa();
  }, [isAdmin]);

  // Fetch CA Piccola Mia today
  useEffect(() => {
    async function fetchCaPM() {
      const { data } = await supabase
        .from("daily_sales")
        .select("ca_ttc, couverts, panier_moyen")
        .eq("date", today)
        .eq("source", "kezia_pdf")
        .limit(1)
        .maybeSingle();
      setCaPM(data ? { ca: data.ca_ttc ?? 0, couverts: data.couverts ?? 0, panier_moyen: data.panier_moyen ?? 0 } : { ca: 0, couverts: 0, panier_moyen: 0 });
    }
    if (isAdmin) fetchCaPM();
  }, [isAdmin, today]);

  // Fetch CA Yesterday (from daily_sales or Popina)
  useEffect(() => {
    if (!isAdmin) return;
    if (!isGroupView && !current) return;
    async function fetchCaYesterday() {
      const { data } = await supabase
        .from("daily_sales")
        .select("ca_ttc, couverts, etablissement_id")
        .eq("date", yesterday)
        .limit(10);
      const rows = data ?? [];
      if (isGroupView) {
        const total = rows.reduce((s: number, r: { ca_ttc: number | null }) => s + (r.ca_ttc ?? 0), 0);
        setCaYesterday(total > 0 ? total : null);
        // Per-establishment yesterday
        for (const etab of etablissements) {
          const row = rows.find((r: { etablissement_id: string }) => r.etablissement_id === etab.id);
          const d = row ? { ca: row.ca_ttc ?? 0, couverts: row.couverts ?? 0 } : null;
          if (etab.slug?.includes("bello")) setCaYesterdayBM(d);
          else setCaYesterdayPM(d);
        }
      } else if (current) {
        const filtered = rows.filter((r: { etablissement_id: string }) => r.etablissement_id === current!.id);
        const total = filtered.reduce((s: number, r: { ca_ttc: number | null }) => s + (r.ca_ttc ?? 0), 0);
        setCaYesterday(total > 0 ? total : null);
      }
    }
    fetchCaYesterday();
  }, [isAdmin, yesterday, isGroupView, current, etablissements]);

  // Fetch CA mensuel Popina
  useEffect(() => {
    if (!isAdmin) return;
    async function fetchMonthlyCa() {
      try {
        const res = await fetchApi(`/api/popina/ca-mois?month=${selectedMonth}`);
        if (res.ok) {
          const d = await res.json();
          setMonthData(d);
        }
      } catch { /* silencieux */ }
    }
    fetchMonthlyCa();
  }, [isAdmin, selectedMonth]);

  // Events (only for Piccola Mia — events are managed there)
  useEffect(() => {
    if (isGroupView) { setEvents([]); return; } // eslint-disable-line react-hooks/set-state-in-effect
    if (!current) return;
    const isPiccola = current.slug?.includes("piccola");
    if (!isPiccola) { setEvents([]); return; }
    async function fetchEvents() {
      const { data } = await supabase
        .from("events")
        .select("id,name,date,status,covers")
        .gte("date", today)
        .not("status", "in", '("termine","annule")')
        .order("date", { ascending: true })
        .limit(4);
      setEvents((data ?? []) as UpcomingEvent[]);
    }
    fetchEvents();
  }, [today, isGroupView, current]);

  // Price alerts
  useEffect(() => {
    async function fetchAlerts() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      try {
        const alerts = await fetchPriceAlerts(supabase, user.id);
        setAlertCount(alerts.length);
      } catch { /* silencieux */ }
    }
    if (isAdmin) fetchAlerts();
  }, [isAdmin]);

  // Pending commandes
  useEffect(() => {
    async function fetchPending() {
      const { count } = await supabase
        .from("commande_sessions")
        .select("id", { count: "exact", head: true })
        .eq("status", "en_attente");
      setPendingCommandes(count ?? 0);
    }
    if (isAdmin) fetchPending();
  }, [isAdmin]);

  // Recent email imports (errors only, for alert)
  useEffect(() => {
    async function fetchRecentImports() {
      const { data } = await supabase
        .from("email_imports")
        .select("id,created_at,fournisseur,status")
        .in("status", ["error", "no_match"])
        .order("created_at", { ascending: false })
        .limit(10);
      setRecentImports((data ?? []) as RecentImport[]);
    }
    if (isAdmin) fetchRecentImports();
  }, [isAdmin]);

  // Shifts today (employees working tonight)
  useEffect(() => {
    async function fetchShiftsToday() {
      let query = supabase
        .from("shifts")
        .select("id", { count: "exact", head: true })
        .eq("date", today);
      if (!isGroupView && current) {
        query = query.eq("etablissement_id", current.id);
      }
      const { count } = await query;
      setShiftsToday(count ?? 0);
    }
    if (isAdmin) fetchShiftsToday();
  }, [isAdmin, today, isGroupView, current]);

  // Check if next week planning has shifts
  useEffect(() => {
    async function checkNextWeek() {
      const mon = getNextWeekMonday();
      const sun = getNextWeekSunday();
      let query = supabase
        .from("shifts")
        .select("id", { count: "exact", head: true })
        .gte("date", mon)
        .lte("date", sun);
      if (!isGroupView && current) {
        query = query.eq("etablissement_id", current.id);
      }
      const { count } = await query;
      setNextWeekHasShifts((count ?? 0) > 0);
    }
    if (isAdmin) checkNextWeek();
  }, [isAdmin, isGroupView, current]);

  // Fetch heures planifiees per establishment (current week)
  useEffect(() => {
    if (!isAdmin || !isGroupView || etablissements.length === 0) return;
    async function fetchHeures() {
      const d = new Date();
      const day = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      const monStr = mon.toISOString().slice(0, 10);
      const sunStr = sun.toISOString().slice(0, 10);

      const { data } = await supabase
        .from("shifts")
        .select("etablissement_id, heure_debut, heure_fin, pause_minutes")
        .gte("date", monStr)
        .lte("date", sunStr);

      if (!data) return;
      const byEtab: Record<string, number> = {};
      for (const s of data) {
        const [hd, md] = (s.heure_debut as string).split(":").map(Number);
        const [hf, mf] = (s.heure_fin as string).split(":").map(Number);
        let dur = (hf * 60 + mf) - (hd * 60 + md);
        if (dur < 0) dur += 1440;
        dur -= s.pause_minutes ?? 0;
        byEtab[s.etablissement_id] = (byEtab[s.etablissement_id] ?? 0) + Math.max(0, dur / 60);
      }
      for (const etab of etablissements) {
        const h = Math.round(byEtab[etab.id] ?? 0);
        if (etab.slug?.includes("bello")) setHeuresBM(h);
        else setHeuresPM(h);
      }
    }
    fetchHeures();
  }, [isAdmin, isGroupView, etablissements]);

  // Fetch group alerts
  useEffect(() => {
    if (!isAdmin || !isGroupView) return;
    async function fetchGroupAlerts() {
      const alerts: GroupAlert[] = [];

      // Commandes en attente
      const { data: cmdData } = await supabase
        .from("commande_sessions")
        .select("id, etablissement_id")
        .eq("status", "en_attente");
      if (cmdData && cmdData.length > 0) {
        const etabName = (eid: string) => etablissements.find(e => e.id === eid)?.nom ?? "Groupe";
        const grouped: Record<string, number> = {};
        for (const c of cmdData) {
          const n = etabName(c.etablissement_id);
          grouped[n] = (grouped[n] ?? 0) + 1;
        }
        for (const [name, count] of Object.entries(grouped)) {
          alerts.push({ text: `${count} commande${count > 1 ? "s" : ""} fournisseur en attente`, etab: name, badge: "commandes", color: T.dore });
        }
      }

      // Events demain
      const tmrw = new Date();
      tmrw.setDate(tmrw.getDate() + 1);
      const tmrwStr = tmrw.toISOString().slice(0, 10);
      const { data: evData } = await supabase
        .from("events")
        .select("id, name, covers, etablissement_id")
        .eq("date", tmrwStr)
        .not("status", "in", '("termine","annule")');
      if (evData && evData.length > 0) {
        for (const ev of evData) {
          const etabName = etablissements.find(e => e.id === ev.etablissement_id)?.nom ?? "";
          alerts.push({ text: `Evenement demain — ${ev.covers ?? 0} couverts reserves`, etab: etabName, badge: "evenement", color: T.bleu });
        }
      }

      // Absences en attente
      const { data: absData } = await supabase
        .from("absences")
        .select("id, employe_id")
        .eq("statut", "en_attente");
      if (absData && absData.length > 0) {
        alerts.push({ text: `${absData.length} demande${absData.length > 1 ? "s" : ""} de conge en attente de validation`, etab: "", badge: "RH", color: T.bleu });
      }

      // Price alerts
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const pa = await fetchPriceAlerts(supabase, user.id);
          if (pa.length > 0) {
            alerts.push({ text: `${pa.length} variation${pa.length > 1 ? "s" : ""} de prix detectee${pa.length > 1 ? "s" : ""}`, etab: "", badge: "prix", color: T.terracotta });
          }
        }
      } catch { /* silencieux */ }

      setGroupAlerts(alerts);
    }
    fetchGroupAlerts();
  }, [isAdmin, isGroupView, etablissements]);

  const caTotal = (ca?.totalSales ?? 0) + (caPM?.ca ?? 0);

  // ─── Non-admin: simple dashboard with quick links ───
  if (role && role !== "group_admin") {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>
        <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          <QuickTile href="/recettes" title="Recettes" sub="Toutes les recettes" accent={T.terracotta} iconName="cuisine" />
          <QuickTile href="/plannings" title="Planning" sub="Planning de la semaine" accent={T.bleu} iconName="planning" />
          <QuickTile href="/mes-shifts" title="Mon planning" sub="Mes shifts" accent={T.dore} iconName="horloge" />
          <QuickTile href="/commandes" title="Commandes" sub="Commandes fournisseurs" accent={T.sauge} iconName="commandes" />
          <QuickTile href="/fournisseurs" title="Fournisseurs" sub="Fiches fournisseurs" accent={T.sauge} iconName="gestion" />
        </div>

        <SectionLabel>Taches du jour</SectionLabel>
        <div style={{ marginBottom: 20 }}>
          <ZoneChecklist />
        </div>

        {events.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <SectionLabel>Evenements a venir</SectionLabel>
            <div style={{ display: "grid", gap: 6 }}>
              {events.map(ev => (
                <div key={ev.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 14px", background: "#fff", borderRadius: 10,
                  border: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: T.dark }}>{ev.name}</span>
                  <span style={{ fontSize: 11, color: T.muted }}>
                    {ev.date ? fmtDateShort(ev.date) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Admin / Direction: GROUP VIEW (synthese financiere) ───
  if (isGroupView) {
    const couvTotal = (ca?.guestsNumber ?? 0) + (caPM?.couverts ?? 0);
    const ticketMoyenGroupe = couvTotal > 0 ? caTotal / couvTotal : 0;
    const caYestTotal = (caYesterdayBM?.ca ?? 0) + (caYesterdayPM?.ca ?? 0);
    const deltaCa = caYestTotal > 0 ? Math.round(((caTotal - caYestTotal) / caYestTotal) * 100) : null;
    const couvYest = (caYesterdayBM?.couverts ?? 0) + (caYesterdayPM?.couverts ?? 0);
    const deltaCouverts = couvYest > 0 ? couvTotal - couvYest : null;
    const ticketYest = couvYest > 0 ? caYestTotal / couvYest : 0;
    const deltaTicket = ticketYest > 0 ? ticketMoyenGroupe - ticketYest : null;

    // Per-establishment deltas
    const deltaCaBM = caYesterdayBM && caYesterdayBM.ca > 0 ? Math.round((((ca?.totalSales ?? 0) - caYesterdayBM.ca) / caYesterdayBM.ca) * 100) : null;
    const deltaCaPM = caYesterdayPM && caYesterdayPM.ca > 0 ? Math.round(((caPM?.ca ?? 0) - caYesterdayPM.ca) / caYesterdayPM.ca * 100) : null;
    const deltaCouvBM = caYesterdayBM ? (ca?.guestsNumber ?? 0) - (caYesterdayBM.couverts ?? 0) : null;
    const deltaCouvPM = caYesterdayPM ? (caPM?.couverts ?? 0) - (caYesterdayPM.couverts ?? 0) : null;

    // Masse salariale estimates per establishment
    const bmEtab = etablissements.find(e => e.slug?.includes("bello"));
    const pmEtab = etablissements.find(e => !e.slug?.includes("bello"));
    const masseSalBM = bmEtab && heuresBM != null ? Math.round(bmEtab.taux_horaire_moyen * heuresBM * (1 + bmEtab.cotisations_patronales / 100)) : null;
    const masseSalPM = pmEtab && heuresPM != null ? Math.round(pmEtab.taux_horaire_moyen * heuresPM * (1 + pmEtab.cotisations_patronales / 100)) : null;

    // Ratio MS placeholder (would need weekly CA)
    const ratioMSBM = masseSalBM != null && (ca?.totalSales ?? 0) > 0 ? Math.round((masseSalBM / (ca!.totalSales * 7)) * 100) : null;
    const ratioMSPM = masseSalPM != null && (caPM?.ca ?? 0) > 0 ? Math.round((masseSalPM / ((caPM?.ca ?? 0) * 7)) * 100) : null;
    const ratioMSGroupe = masseSalBM != null && masseSalPM != null && caTotal > 0
      ? Math.round(((masseSalBM + masseSalPM) / (caTotal * 7)) * 100) : null;
    const objMS = bmEtab?.objectif_cout_ventes ?? 37;

    const fmtDelta = (v: number | null, suffix = "") => {
      if (v == null) return null;
      const sign = v > 0 ? "+" : "";
      return `${sign}${v}${suffix}`;
    };
    const deltaColor = (v: number | null) => v == null ? T.muted : v > 0 ? T.sauge : v < 0 ? "#DC2626" : T.muted;

    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 16px 40px" }}>

        <SectionLabel>Vue groupe &mdash; aujourd&apos;hui</SectionLabel>

        {/* ── 4 KPI Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
          <KpiCard label="CA Groupe" value={`${fmtEur(caTotal)} €`} accent={T.terracotta}
            sub={fmtDelta(deltaCa, "% vs hier") ?? undefined} subColor={deltaColor(deltaCa)} />
          <KpiCard label="Couverts" value={String(couvTotal)} accent={T.dark}
            sub={fmtDelta(deltaCouverts, " vs hier") ?? undefined} subColor={deltaColor(deltaCouverts)} />
          <KpiCard label="Ticket moyen" value={`${ticketMoyenGroupe.toFixed(1).replace(".", ",")} €`} accent={T.dark}
            sub={deltaTicket != null ? `${deltaTicket > 0 ? "+" : ""}${deltaTicket.toFixed(1).replace(".", ",")} € vs hier` : undefined}
            subColor={deltaColor(deltaTicket != null ? Math.round(deltaTicket * 10) : null)} />
          <KpiCard label="Ratio MS Groupe" value={ratioMSGroupe != null ? `${ratioMSGroupe}%` : "—"}
            accent={ratioMSGroupe != null && ratioMSGroupe > objMS ? "#DC2626" : T.dore}
            sub={`obj. ${objMS}%`} subColor={T.dore}
            progress={ratioMSGroupe != null ? { value: ratioMSGroupe, max: objMS + 20, color: ratioMSGroupe > objMS ? "#DC2626" : T.dore } : undefined} />
        </div>

        {/* ── CA Mensuel Popina (Bello Mio) ── */}
        <div style={{
          background: T.white, borderRadius: 14, border: `1.5px solid ${T.border}`,
          padding: "18px 20px", marginBottom: 20,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <SectionLabel>CA mensuel &mdash; Bello Mio (Popina)</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" onClick={() => {
                const [y, m] = selectedMonth.split("-").map(Number);
                const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
                setSelectedMonth(prev);
              }} style={{
                width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.border}`,
                background: T.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={T.dark} strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "DM Sans, sans-serif", color: T.dark, minWidth: 90, textAlign: "center" }}>
                {new Date(selectedMonth + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              </span>
              <button type="button" onClick={() => {
                const [y, m] = selectedMonth.split("-").map(Number);
                const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
                const now = new Date();
                const maxMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                if (next <= maxMonth) setSelectedMonth(next);
              }} style={{
                width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.border}`,
                background: T.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={T.dark} strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          </div>

          {monthData ? (
            <>
              {/* KPIs mensuels */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted }}>CA cumule</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.terracotta, fontFamily: "var(--font-oswald), Oswald, sans-serif", marginTop: 2 }}>{fmtEur(monthData.caMois)}&nbsp;&euro;</div>
                </div>
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted }}>Couverts</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif", marginTop: 2 }}>{monthData.couvertsMois}</div>
                </div>
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted }}>Moy. jour</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif", marginTop: 2 }}>{fmtEur(monthData.moyJournaliere)}&nbsp;&euro;</div>
                </div>
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted }}>Var. M-1</div>
                  <div style={{
                    fontSize: 22, fontWeight: 700, fontFamily: "var(--font-oswald), Oswald, sans-serif", marginTop: 2,
                    color: monthData.variation > 0 ? T.sauge : monthData.variation < 0 ? "#DC2626" : T.muted,
                  }}>
                    {monthData.variation > 0 ? "+" : ""}{monthData.variation.toFixed(1).replace(".", ",")}%
                  </div>
                  <div style={{ fontSize: 10, color: T.muted }}>
                    M-1 : {fmtEur(monthData.caPrevMois)}&nbsp;&euro;
                  </div>
                </div>
              </div>

              {/* Ticket moyen + nbJours */}
              <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12, color: T.muted, fontFamily: "DM Sans, sans-serif" }}>
                <span>Ticket moyen : <strong style={{ color: T.dark }}>{monthData.ticketMoyen.toFixed(1).replace(".", ",")}&nbsp;&euro;</strong></span>
                <span>{monthData.nbJours} jour{monthData.nbJours > 1 ? "s" : ""} d&apos;activite</span>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: 20, color: T.muted, fontSize: 12 }}>Chargement...</div>
          )}
        </div>

        {/* ── 2 Establishment Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          {/* Bello Mio */}
          <div style={{
            background: `linear-gradient(135deg, ${T.belloMio}12 0%, ${T.white} 60%)`,
            borderRadius: 16, border: `2px solid ${T.belloMio}30`,
            padding: "18px 20px", display: "flex", flexDirection: "column",
            boxShadow: `0 4px 16px ${T.belloMio}10`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: T.belloMio, boxShadow: `0 0 8px ${T.belloMio}60` }} />
              <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 17, color: T.dark, textTransform: "uppercase", letterSpacing: 0.5 }}>Bello Mio</span>
            </div>
            <EtabStatRow label="CA du jour" value={`${fmtEur(ca?.totalSales ?? 0)} €`} delta={fmtDelta(deltaCaBM, "%")} deltaColor={deltaColor(deltaCaBM)} />
            <EtabStatRow label="Couverts" value={String(ca?.guestsNumber ?? 0)} delta={fmtDelta(deltaCouvBM)} deltaColor={deltaColor(deltaCouvBM)} />
            <EtabStatRow label="Soir" value={`${fmtEur(ca?.soir.ca ?? 0)} €`} />
            <div style={{ display: "flex", gap: 14, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.belloMio}20` }}>
              <MiniStat label="planifiees" value={heuresBM != null ? `${heuresBM} h` : "—"} />
              <MiniStat label="ratio MS" value={ratioMSBM != null ? `${ratioMSBM}%` : "—"} valueColor={ratioMSBM != null && ratioMSBM > objMS ? "#DC2626" : T.sauge} />
              <MiniStat label="masse sal." value={masseSalBM != null ? `${fmtEur(masseSalBM)} €` : "—"} />
            </div>
            <Link
              href="/bello-mio"
              onClick={() => {
                const bm = etablissements.find(e => e.slug?.includes("bello"));
                if (bm) { setCurrent(bm); setGroupView(false); }
              }}
              style={{
                marginTop: 16, width: "100%", padding: "10px 0", borderRadius: 10,
                border: `1.5px solid ${T.belloMio}40`, background: T.belloMio,
                fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600,
                color: "#fff", cursor: "pointer", textAlign: "center", textDecoration: "none",
              }}
            >
              Entrer dans Bello Mio &rarr;
            </Link>
          </div>

          {/* Piccola Mia */}
          <div style={{
            background: `linear-gradient(135deg, ${T.piccolaMia}25 0%, ${T.white} 60%)`,
            borderRadius: 16, border: `2px solid ${T.piccolaMia}60`,
            padding: "18px 20px", display: "flex", flexDirection: "column",
            boxShadow: `0 4px 16px ${T.piccolaMia}15`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: T.piccolaMia, boxShadow: `0 0 8px ${T.piccolaMia}80` }} />
              <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 17, color: T.dark, textTransform: "uppercase", letterSpacing: 0.5 }}>Piccola Mia</span>
            </div>
            <EtabStatRow label="CA du jour" value={`${fmtEur(caPM?.ca ?? 0)} €`} delta={fmtDelta(deltaCaPM, "%")} deltaColor={deltaColor(deltaCaPM)} />
            <EtabStatRow label="Couverts" value={String(caPM?.couverts ?? 0)} delta={fmtDelta(deltaCouvPM)} deltaColor={deltaColor(deltaCouvPM)} />
            <EtabStatRow label="Soir" value={"—"} />
            <div style={{ display: "flex", gap: 14, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.piccolaMia}40` }}>
              <MiniStat label="planifiees" value={heuresPM != null ? `${heuresPM} h` : "—"} />
              <MiniStat label="ratio MS" value={ratioMSPM != null ? `${ratioMSPM}%` : "—"} valueColor={ratioMSPM != null && ratioMSPM > objMS ? "#DC2626" : T.sauge} />
              <MiniStat label="masse sal." value={masseSalPM != null ? `${fmtEur(masseSalPM)} €` : "—"} />
            </div>
            <Link
              href="/piccola-mia"
              onClick={() => {
                const pm = etablissements.find(e => !e.slug?.includes("bello"));
                if (pm) { setCurrent(pm); setGroupView(false); }
              }}
              style={{
                marginTop: 16, width: "100%", padding: "10px 0", borderRadius: 10,
                border: `1.5px solid ${T.piccolaMia}60`, background: "#8B6914",
                fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600,
                color: "#fff", cursor: "pointer", textAlign: "center", textDecoration: "none",
              }}
            >
              Entrer dans Piccola Mia &rarr;
            </Link>
          </div>
        </div>

        {/* ── Alertes Groupe ── */}
        {groupAlerts.length > 0 && (
          <div style={{
            background: T.white, borderRadius: 14, border: `1.5px solid ${T.border}`,
            padding: "18px 20px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <SectionLabel>Alertes groupe</SectionLabel>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                minWidth: 24, height: 24, borderRadius: 12,
                background: `${T.sauge}18`, color: T.sauge,
                fontSize: 12, fontWeight: 700,
              }}>{groupAlerts.length}</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {groupAlerts.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: T.dark, fontFamily: "DM Sans, sans-serif", flex: 1 }}>{a.text}</span>
                  {a.etab && <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{a.etab}</span>}
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                    background: `${a.color}15`, color: a.color, flexShrink: 0,
                  }}>{a.badge}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    );
  }

  // ─── Admin / Direction: SINGLE ETAB VIEW (operationnel) ───
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 16px 40px" }}>

      {/* Alert banner — next week planning not published */}
      {nextWeekHasShifts === false && (
        <div style={{
          background: "#fef3cd", border: "1px solid #f0d78c",
          borderRadius: 12, padding: "12px 16px",
          marginBottom: 16, display: "flex", alignItems: "center", gap: 10,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: "#8a6d1b" }}>
            <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 13, color: "#664d03", fontFamily: "DM Sans, sans-serif", fontWeight: 500 }}>
            Le planning de la semaine prochaine n&apos;est pas encore publie
          </span>
          <Link href="/plannings" style={{
            marginLeft: "auto", fontSize: 11, fontWeight: 700,
            color: "#664d03", textDecoration: "underline", flexShrink: 0,
          }}>Planifier</Link>
        </div>
      )}

      {/* KPI Cards — 4 columns grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 10,
        marginBottom: 20,
      }}>
        <KpiCard
          label="En service ce soir"
          value={String(shiftsToday)}
          accent={T.bleu}
        />
        <KpiCard
          label="Taches du jour"
          value={String(pendingCommandes)}
          sub={pendingCommandes > 0 ? "en attente" : undefined}
          accent={T.sauge}
        />
        <KpiCard
          label="CA hier"
          value={caYesterday != null ? `${fmtEur(caYesterday)} €` : "—"}
          accent={T.terracotta}
        />
        <KpiCard
          label="Ratio MS/CA"
          value={"—"}
          sub="bientot"
          accent={T.dore}
        />
      </div>

      {/* Taches du jour section */}
      <SectionLabel>Taches du jour</SectionLabel>
      <div style={{ marginBottom: 20 }}>
        {/* Alerts row (commandes + prix) */}
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {pendingCommandes > 0 && (
            <TaskCard
              href="/commandes"
              icon="commandes"
              title="Commandes en attente"
              subtitle={`${pendingCommandes} commande${pendingCommandes > 1 ? "s" : ""} a valider`}
              accent={T.sauge}
              count={pendingCommandes}
            />
          )}
          {alertCount > 0 && (
            <TaskCard
              href="/variations-prix"
              icon="variations"
              title="Alertes prix"
              subtitle={`${alertCount} variation${alertCount > 1 ? "s" : ""} de prix detectee${alertCount > 1 ? "s" : ""}`}
              accent={T.terracotta}
              count={alertCount}
            />
          )}
        </div>

        {/* Zone checklist */}
        <ZoneChecklist />
      </div>

      {/* Events */}
      {events.length > 0 && (
        <>
          <SectionLabel>Evenements a venir</SectionLabel>
          <Link href="/evenements" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{
              background: T.white, borderRadius: 14, padding: "14px 16px",
              border: `1.5px solid ${T.border}`,
              marginBottom: 20, cursor: "pointer",
            }}>
              <div style={{ display: "grid", gap: 6 }}>
                {events.map(ev => (
                  <div key={ev.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", background: `${T.violet}08`, borderRadius: 10,
                    border: `1px solid ${T.violet}15`,
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: T.dark }}>{ev.name}</span>
                    <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }}>
                      {ev.date ? fmtDateShort(ev.date) : "—"}
                      {ev.covers > 0 ? ` · ${ev.covers} couv.` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Link>
        </>
      )}

      {/* Import errors alert */}
      {recentImports.length > 0 && (
        <div style={{ marginTop: 4, marginBottom: 20 }}>
          <TaskCard
            href="/achats"
            icon="gestion"
            title="Imports factures en erreur"
            subtitle={`${recentImports.length} facture${recentImports.length > 1 ? "s" : ""} non importee${recentImports.length > 1 ? "s" : ""}`}
            accent={T.terracotta}
            count={recentImports.length}
          />
        </div>
      )}

    </div>
  );
}

/* ───────── Zone Checklist ───────── */

type ZoneKey = "cuisine" | "salle" | "sanitaires";

const ZONE_LABELS: Record<ZoneKey, string> = {
  cuisine: "Cuisine",
  salle: "Salle",
  sanitaires: "Sanitaires",
};

const DEFAULT_TASKS: Record<ZoneKey, string[]> = {
  cuisine: [
    "Verifier les DLC",
    "Releve temperatures frigos",
    "Nettoyage plan de travail",
  ],
  salle: [
    "Mise en place couverts",
    "Verifier reservations du soir",
    "Reapprovisionnement bar",
  ],
  sanitaires: [
    "Nettoyage toilettes",
    "Verifier savon/papier",
    "Desinfection surfaces",
  ],
};

const ZONE_KEYS: ZoneKey[] = ["cuisine", "salle", "sanitaires"];

function ZoneChecklist() {
  const [activeZone, setActiveZone] = useState<ZoneKey>("cuisine");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [tasks, setTasks] = useState<Record<ZoneKey, string[]>>(DEFAULT_TASKS);
  const [loaded, setLoaded] = useState(false);

  // Try to load tasks from DB, fallback to defaults
  useEffect(() => {
    async function loadTasks() {
      try {
        const { data, error } = await supabase
          .from("taches")
          .select("id, label, zone")
          .eq("active", true)
          .order("position", { ascending: true });
        if (!error && data && data.length > 0) {
          const grouped: Record<ZoneKey, string[]> = { cuisine: [], salle: [], sanitaires: [] };
          for (const row of data) {
            const z = row.zone as ZoneKey;
            if (grouped[z]) grouped[z].push(row.label);
          }
          // Only use DB tasks if at least one zone has items
          const hasItems = Object.values(grouped).some(arr => arr.length > 0);
          if (hasItems) setTasks(grouped);
        }
      } catch {
        // Table doesn't exist or query failed — use defaults
      }
      setLoaded(true);
    }
    loadTasks();
  }, []);

  const toggleCheck = (key: string) => {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const zoneTasks = tasks[activeZone] ?? [];
  const doneCount = zoneTasks.filter((_, i) => checked[`${activeZone}-${i}`]).length;

  if (!loaded) return null;

  return (
    <div style={{
      background: T.white, borderRadius: 14, padding: "16px 16px 12px",
      border: `1.5px solid ${T.border}`,
    }}>
      {/* Zone tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {ZONE_KEYS.map(zone => {
          const isActive = zone === activeZone;
          return (
            <button
              key={zone}
              type="button"
              onClick={() => setActiveZone(zone)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: `1.5px solid ${isActive ? T.terracotta : T.border}`,
                background: isActive ? T.terracotta : "transparent",
                color: isActive ? "#fff" : T.dark,
                fontSize: 12, fontWeight: 600,
                fontFamily: "DM Sans, sans-serif",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {ZONE_LABELS[zone]}
            </button>
          );
        })}
      </div>

      {/* Counter */}
      <div style={{
        fontSize: 11, color: T.muted, marginBottom: 10,
        fontFamily: "DM Sans, sans-serif", fontWeight: 600,
      }}>
        {doneCount}/{zoneTasks.length} tache{zoneTasks.length > 1 ? "s" : ""} completee{zoneTasks.length > 1 ? "s" : ""}
      </div>

      {/* Task list */}
      <div style={{ display: "grid", gap: 4 }}>
        {zoneTasks.map((task, i) => {
          const key = `${activeZone}-${i}`;
          const done = !!checked[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleCheck(key)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 10,
                background: done ? `${T.sauge}08` : "transparent",
                border: `1px solid ${done ? `${T.sauge}20` : T.border}`,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
              }}
            >
              {/* Checkbox */}
              <span style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                border: `2px solid ${done ? T.sauge : T.border}`,
                background: done ? T.sauge : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}>
                {done && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span style={{
                fontSize: 13, fontFamily: "DM Sans, sans-serif",
                color: done ? T.muted : T.dark,
                fontWeight: done ? 400 : 500,
                textDecoration: done ? "line-through" : "none",
                transition: "all 0.15s",
              }}>
                {task}
              </span>
            </button>
          );
        })}
        {zoneTasks.length === 0 && (
          <div style={{
            textAlign: "center", padding: "12px",
            color: T.muted, fontSize: 12,
            fontFamily: "DM Sans, sans-serif",
          }}>
            Aucune tache pour cette zone
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── Establishment card sub-components ───────── */

function EtabStatRow({ label, value, delta, deltaColor }: {
  label: string; value: string; delta?: string | null; deltaColor?: string;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "7px 0", borderBottom: `1px solid ${T.border}08`,
    }}>
      <span style={{ fontSize: 13, color: T.muted, fontFamily: "DM Sans, sans-serif" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{value}</span>
        {delta && <span style={{ fontSize: 11, fontWeight: 600, color: deltaColor ?? T.muted }}>{delta}</span>}
      </div>
    </div>
  );
}

function MiniStat({ label, value, valueColor }: {
  label: string; value: string; valueColor?: string;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: valueColor ?? T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{value}</div>
      <div style={{ fontSize: 10, color: T.muted }}>{label}</div>
    </div>
  );
}

/* ───────── Shared sub-components ───────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "DM Sans, sans-serif", fontSize: 9, fontWeight: 700,
      letterSpacing: "0.18em", textTransform: "uppercase",
      color: T.mutedLight, marginBottom: 10, marginTop: 4,
    }}>{children}</div>
  );
}

function QuickTile({ href, iconName, title, sub, accent }: {
  href: string; iconName: React.ComponentProps<typeof TileIcon>["name"]; title: string; sub: string; accent: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        background: T.white, borderRadius: 14, padding: "14px 16px",
        border: `1.5px solid ${T.border}`,
        borderLeft: `3px solid ${accent}`,
        minHeight: 80, display: "flex", flexDirection: "column",
        justifyContent: "space-between", cursor: "pointer",
        transition: "all 0.2s", boxShadow: T.tileShadow,
      }}>
        <div>
          <div style={{ marginBottom: 6 }}><TileIcon name={iconName} size={18} color={accent} /></div>
          <div style={{
            fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 600,
            fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
            color: accent,
          }}>{title}</div>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>
        </div>
      </div>
    </Link>
  );
}

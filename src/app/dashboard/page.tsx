"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";

const GROUP_COLOR = "#b45f57";
const OSWALD = "var(--font-oswald), Oswald, sans-serif";

type Period = "semaine" | "mois" | "exercice";

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/* ── Date helpers ── */

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

/** Fiscal year starts Oct 1. Returns YYYY-MM-DD of the fiscal year start for a given date. */
function getFiscalYearStart(dateStr: string): string {
  const y = parseInt(dateStr.slice(0, 4));
  const m = parseInt(dateStr.slice(5, 7));
  const fiscalYear = m >= 10 ? y : y - 1;
  return `${fiscalYear}-10-01`;
}

/** Previous period boundaries based on period type */
function getPreviousPeriodRange(
  period: Period,
  today: string,
): { start: string; end: string } {
  if (period === "semaine") {
    const monday = getMonday(today);
    const d = new Date(monday + "T00:00:00");
    d.setDate(d.getDate() - 7);
    const prevMonday = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 6);
    const prevSunday = d.toISOString().slice(0, 10);
    return { start: prevMonday, end: prevSunday };
  }
  if (period === "mois") {
    const y = parseInt(today.slice(0, 4));
    const m = parseInt(today.slice(5, 7));
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const day = parseInt(today.slice(8, 10));
    // Same day in previous month (capped)
    const lastDayPrev = new Date(prevY, prevM, 0).getDate();
    const endDay = Math.min(day, lastDayPrev);
    const start = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
    const end = `${prevY}-${String(prevM).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
    return { start, end };
  }
  // exercice: previous fiscal year same period
  const fyStart = getFiscalYearStart(today);
  const prevFyY = parseInt(fyStart.slice(0, 4)) - 1;
  const prevFyStart = `${prevFyY}-10-01`;
  // Offset today by -1 year
  const y = parseInt(today.slice(0, 4));
  const endDate = `${y - 1}-${today.slice(5)}`;
  return { start: prevFyStart, end: endDate };
}

function getPeriodRange(period: Period, today: string): { start: string; end: string } {
  if (period === "semaine") return { start: getMonday(today), end: today };
  if (period === "mois") return { start: getFirstOfMonth(today), end: today };
  return { start: getFiscalYearStart(today), end: today };
}

/* ── Types ── */

type EtabKpis = {
  ca: number;
  caPrev: number;
  couverts: number;
  couvertsPrev: number;
};

type SupplierTotal = { name: string; total: number };

export default function GroupDashboard() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <GroupContent />
    </RequireRole>
  );
}

function GroupContent() {
  const { etablissements, setGroupView } = useEtablissement();
  const [period, setPeriod] = useState<Period>("mois");

  const today = useMemo(
    () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()),
    [],
  );

  const range = useMemo(() => getPeriodRange(period, today), [period, today]);
  const prevRange = useMemo(() => getPreviousPeriodRange(period, today), [period, today]);
  const fiscalStart = useMemo(() => getFiscalYearStart(today), [today]);

  const [etabData, setEtabData] = useState<Record<string, EtabKpis>>({});
  const [caExercice, setCaExercice] = useState(0);
  const [achatsMonth, setAchatsMonth] = useState(0);
  const [topFournisseurs, setTopFournisseurs] = useState<SupplierTotal[]>([]);
  const [tresoBalance, setTresoBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Set group view
  useEffect(() => {
    setGroupView(true);
  }, [setGroupView]);

  // Fetch all data in parallel
  const fetchData = useCallback(async () => {
    if (etablissements.length === 0) return;
    setLoading(true);

    const etabIds = etablissements.map((e) => e.id);

    // 1. CA for current period per etab
    const caPromises = etablissements.map(async (etab) => {
      const { data } = await supabase
        .from("ventes_lignes")
        .select("ttc, num_fiscal")
        .eq("etablissement_id", etab.id)
        .gte("date_service", range.start)
        .lte("date_service", range.end)
        .eq("type_ligne", "Produit");
      const rows = data ?? [];
      const ca = rows.reduce((s, r) => s + (r.ttc ?? 0), 0);
      const couverts = new Set(rows.map((r) => r.num_fiscal).filter(Boolean)).size;
      return { id: etab.id, ca, couverts };
    });

    // 2. CA for previous period per etab
    const caPrevPromises = etablissements.map(async (etab) => {
      const { data } = await supabase
        .from("ventes_lignes")
        .select("ttc, num_fiscal")
        .eq("etablissement_id", etab.id)
        .gte("date_service", prevRange.start)
        .lte("date_service", prevRange.end)
        .eq("type_ligne", "Produit");
      const rows = data ?? [];
      const ca = rows.reduce((s, r) => s + (r.ttc ?? 0), 0);
      const couverts = new Set(rows.map((r) => r.num_fiscal).filter(Boolean)).size;
      return { id: etab.id, ca, couverts };
    });

    // 3. CA exercice (cumulative fiscal year)
    const fyPromise = (async () => {
      let total = 0;
      for (const etab of etablissements) {
        const { data } = await supabase
          .from("ventes_lignes")
          .select("ttc")
          .eq("etablissement_id", etab.id)
          .gte("date_service", fiscalStart)
          .lte("date_service", today)
          .eq("type_ligne", "Produit");
        total += (data ?? []).reduce((s, r) => s + (r.ttc ?? 0), 0);
      }
      return total;
    })();

    // 4. Achats du mois (supplier_invoices)
    const achatsPromise = (async () => {
      const monthStart = getFirstOfMonth(today);
      const { data } = await supabase
        .from("supplier_invoices")
        .select("total_ht, supplier_id, suppliers(name)")
        .gte("invoice_date", monthStart)
        .lte("invoice_date", today)
        .in("etablissement_id", etabIds);
      const rows = (data ?? []) as unknown as {
        total_ht: number | null;
        supplier_id: string;
        suppliers: { name: string } | null;
      }[];
      const total = rows.reduce((s, r) => s + (r.total_ht ?? 0), 0);

      // Top 3 fournisseurs
      const bySupplier: Record<string, { name: string; total: number }> = {};
      for (const r of rows) {
        const name = r.suppliers?.name ?? "Inconnu";
        const key = name.toLowerCase().trim();
        if (!bySupplier[key]) bySupplier[key] = { name, total: 0 };
        bySupplier[key].total += r.total_ht ?? 0;
      }
      const top3 = Object.values(bySupplier)
        .sort((a, b) => b.total - a.total)
        .slice(0, 3);

      return { total, top3 };
    })();

    // 5. Tresorerie balance
    const tresoPromise = (async () => {
      const monthStart = getFirstOfMonth(today);
      const { data, error } = await supabase
        .from("bank_operations")
        .select("amount")
        .gte("operation_date", monthStart)
        .lte("operation_date", today)
        .in("etablissement_id", etabIds);
      if (error || !data || data.length === 0) return null;
      return (data as { amount: number }[]).reduce((s, r) => s + (r.amount ?? 0), 0);
    })();

    // Execute all in parallel
    const [caResults, caPrevResults, fy, achats, treso] = await Promise.all([
      Promise.all(caPromises),
      Promise.all(caPrevPromises),
      fyPromise,
      achatsPromise,
      tresoPromise,
    ]);

    // Build etab data
    const result: Record<string, EtabKpis> = {};
    for (const cur of caResults) {
      const prev = caPrevResults.find((p) => p.id === cur.id);
      result[cur.id] = {
        ca: cur.ca,
        caPrev: prev?.ca ?? 0,
        couverts: cur.couverts,
        couvertsPrev: prev?.couverts ?? 0,
      };
    }
    setEtabData(result);
    setCaExercice(fy);
    setAchatsMonth(achats.total);
    setTopFournisseurs(achats.top3);
    setTresoBalance(treso);
    setLoading(false);
  }, [etablissements, range, prevRange, fiscalStart, today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived totals
  const totalCa = Object.values(etabData).reduce((s, d) => s + d.ca, 0);
  const totalCaPrev = Object.values(etabData).reduce((s, d) => s + d.caPrev, 0);
  const totalCouverts = Object.values(etabData).reduce((s, d) => s + d.couverts, 0);
  const totalCouvertsPrev = Object.values(etabData).reduce((s, d) => s + d.couvertsPrev, 0);
  const ticketMoyen = totalCouverts > 0 ? totalCa / totalCouverts : 0;
  const ticketMoyenPrev = totalCouvertsPrev > 0 ? totalCaPrev / totalCouvertsPrev : 0;
  const margeGlobale = totalCa > 0 ? totalCa - achatsMonth : 0;
  const foodCostRatio = totalCa > 0 ? (achatsMonth / totalCa) * 100 : 0;

  const periodLabel = period === "semaine" ? "semaine" : period === "mois" ? "mois" : "exercice";
  const prevLabel =
    period === "semaine"
      ? "sem. prec."
      : period === "mois"
        ? "mois prec."
        : "exercice prec.";

  const dateDisplay = new Date().toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px 16px 40px" }}>
      {/* ── Hero header ── */}
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
            fontFamily: OSWALD,
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

      {/* ── Period selector ── */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 18,
          borderRadius: 10,
          overflow: "hidden",
          border: `1px solid ${T.border}`,
        }}
      >
        {(["semaine", "mois", "exercice"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              flex: 1,
              padding: "10px 0",
              border: "none",
              background: period === p ? GROUP_COLOR : T.white,
              color: period === p ? "#fff" : T.dark,
              fontWeight: 700,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              cursor: "pointer",
              fontFamily: OSWALD,
              transition: "all 0.15s",
            }}
          >
            {p === "exercice" ? "Exercice" : p === "semaine" ? "Semaine" : "Mois"}
          </button>
        ))}
      </div>

      {/* ── KPIs 2x2 ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 24,
        }}
      >
        <KpiCard
          label={`CA TTC ${periodLabel}`}
          value={`${fmtEur(totalCa)} \u20AC`}
          accent={GROUP_COLOR}
          delta={totalCaPrev > 0 ? ((totalCa - totalCaPrev) / totalCaPrev) * 100 : null}
          deltaLabel={prevLabel}
          loading={loading}
        />
        <KpiCard
          label={`Couverts ${periodLabel}`}
          value={String(totalCouverts)}
          accent={T.dark}
          delta={totalCouvertsPrev > 0 ? ((totalCouverts - totalCouvertsPrev) / totalCouvertsPrev) * 100 : null}
          deltaLabel={prevLabel}
          loading={loading}
        />
        <KpiCard
          label="Ticket moyen"
          value={`${ticketMoyen.toFixed(1).replace(".", ",")} \u20AC`}
          accent={T.dore}
          delta={ticketMoyenPrev > 0 ? ((ticketMoyen - ticketMoyenPrev) / ticketMoyenPrev) * 100 : null}
          deltaLabel={prevLabel}
          loading={loading}
        />
        <KpiCard
          label="CA Exercice"
          value={`${fmtEur(caExercice)} \u20AC`}
          accent={GROUP_COLOR}
          delta={null}
          deltaLabel=""
          loading={loading}
          subtitle={`depuis oct. ${getFiscalYearStart(today).slice(0, 4)}`}
        />
      </div>

      {/* ── Par etablissement ── */}
      <SectionTitle>Par etablissement</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {etablissements.map((etab) => {
          const d = etabData[etab.id] ?? { ca: 0, caPrev: 0, couverts: 0, couvertsPrev: 0 };
          const ticket = d.couverts > 0 ? d.ca / d.couverts : 0;
          const delta = d.caPrev > 0 ? Math.round(((d.ca - d.caPrev) / d.caPrev) * 100) : null;
          const color = etab.slug?.includes("bello") ? T.belloMio : T.piccolaMia;
          const slug = etab.slug?.includes("bello") ? "/bello-mio" : "/piccola-mia";

          return (
            <Link key={etab.id} href={slug} style={{ textDecoration: "none" }}>
              <div
                style={{
                  background: T.white,
                  borderRadius: 12,
                  padding: "14px 16px",
                  border: `1px solid #e0d8ce`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
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
                      fontFamily: OSWALD,
                      fontSize: 16,
                      fontWeight: 700,
                      color: T.dark,
                      textTransform: "uppercase",
                    }}
                  >
                    {etab.nom}
                  </span>
                </div>
                <Row label={`CA ${periodLabel}`} value={`${fmtEur(d.ca)} \u20AC`} />
                <Row label="Couverts" value={String(d.couverts)} />
                <Row
                  label="Ticket moyen"
                  value={`${ticket.toFixed(1).replace(".", ",")} \u20AC`}
                />
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
                    {delta}% vs {prevLabel}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Pilotage ── */}
      <SectionTitle>Pilotage</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {/* Marge globale */}
        <MiniCard
          label="Marge globale"
          value={totalCa > 0 ? `${fmtEur(margeGlobale)} \u20AC` : "-"}
          accent={T.sauge}
          subtitle={totalCa > 0 ? `${fmtPct(100 - foodCostRatio)}%` : undefined}
        />
        {/* Ratio masse salariale */}
        <MiniCard label="Masse salariale" value="A configurer" accent={T.bleu} muted />
        {/* Tresorerie */}
        <MiniCard
          label="Tresorerie"
          value={tresoBalance != null ? `${fmtEur(tresoBalance)} \u20AC` : "Importer un releve"}
          accent={T.dore}
          muted={tresoBalance == null}
        />
      </div>

      {/* ── Achats summary ── */}
      <SectionTitle>Achats du mois</SectionTitle>
      <div
        style={{
          background: T.white,
          borderRadius: 12,
          padding: "14px 16px",
          border: "1px solid #e0d8ce",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: T.muted }}>Total achats HT</span>
          <span
            style={{
              fontFamily: OSWALD,
              fontSize: 18,
              fontWeight: 700,
              color: T.sauge,
            }}
          >
            {fmtEur(achatsMonth)} {"\u20AC"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: T.muted }}>Food cost ratio</span>
          <span
            style={{
              fontFamily: OSWALD,
              fontSize: 14,
              fontWeight: 700,
              color: foodCostRatio > 35 ? "#DC2626" : T.dark,
            }}
          >
            {totalCa > 0 ? `${fmtPct(foodCostRatio)}%` : "-"}
          </span>
        </div>
        {topFournisseurs.length > 0 && (
          <>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#777",
                marginBottom: 6,
              }}
            >
              Top fournisseurs
            </div>
            {topFournisseurs.map((f, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "3px 0",
                }}
              >
                <span style={{ fontSize: 12, color: T.dark }}>{f.name}</span>
                <span
                  style={{ fontSize: 12, fontWeight: 700, fontFamily: OSWALD, color: T.dark }}
                >
                  {fmtEur(f.total)} {"\u20AC"}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Raccourcis ── */}
      <SectionTitle>Raccourcis</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <ShortcutCard
          title="Pilotage"
          icon="P"
          links={[
            { href: "/ventes", label: "Rapport de vente" },
            { href: "/stats-achats", label: "Marges" },
            { href: "/tresorerie", label: "Tresorerie" },
          ]}
        />
        <ShortcutCard
          title="Personnel"
          icon="H"
          links={[
            { href: "/rh/equipe", label: "Employes" },
            { href: "/plannings", label: "Planning" },
          ]}
        />
        <ShortcutCard
          title="Production"
          icon="R"
          links={[{ href: "/recettes", label: "Fiches techniques" }]}
        />
        <ShortcutCard
          title="Achats"
          icon="A"
          links={[
            { href: "/commandes", label: "Commandes" },
            { href: "/achats", label: "Factures" },
          ]}
        />
        <ShortcutCard
          title="Evenementiel"
          icon="E"
          links={[{ href: "/evenements", label: "Evenements" }]}
          subtitle="Piccola Mia"
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#777",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  delta,
  deltaLabel,
  loading,
  subtitle,
}: {
  label: string;
  value: string;
  accent: string;
  delta: number | null;
  deltaLabel: string;
  loading: boolean;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        background: T.white,
        borderRadius: 12,
        padding: "14px 16px",
        border: "1px solid #e0d8ce",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#777",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: accent,
          fontFamily: OSWALD,
          lineHeight: 1.15,
          marginTop: 4,
          opacity: loading ? 0.4 : 1,
          transition: "opacity 0.2s",
        }}
      >
        {value}
      </span>
      {subtitle && (
        <span style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{subtitle}</span>
      )}
      {delta != null && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: delta >= 0 ? T.sauge : "#DC2626",
            marginTop: 2,
          }}
        >
          {delta > 0 ? "+" : ""}
          {Math.round(delta)}% vs {deltaLabel}
        </span>
      )}
    </div>
  );
}

function MiniCard({
  label,
  value,
  accent,
  subtitle,
  muted: isMuted,
}: {
  label: string;
  value: string;
  accent: string;
  subtitle?: string;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        background: T.white,
        borderRadius: 12,
        padding: "12px 10px",
        border: "1px solid #e0d8ce",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#777",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: isMuted ? 11 : 16,
          fontWeight: 700,
          color: isMuted ? T.muted : accent,
          fontFamily: isMuted ? undefined : OSWALD,
          lineHeight: 1.2,
          marginTop: 4,
        }}
      >
        {value}
      </span>
      {subtitle && (
        <span style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{subtitle}</span>
      )}
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
          fontFamily: OSWALD,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ShortcutCard({
  title,
  icon,
  links,
  subtitle,
}: {
  title: string;
  icon: string;
  links: { href: string; label: string }[];
  subtitle?: string;
}) {
  return (
    <div
      style={{
        background: T.white,
        borderRadius: 12,
        padding: "14px 16px",
        border: "1px solid #e0d8ce",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: `${GROUP_COLOR}18`,
            color: GROUP_COLOR,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: OSWALD,
            fontWeight: 700,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <div>
          <div
            style={{
              fontFamily: OSWALD,
              fontSize: 13,
              fontWeight: 700,
              color: T.dark,
              textTransform: "uppercase",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 500 }}>{subtitle}</div>
          )}
        </div>
      </div>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          style={{
            fontSize: 12,
            color: GROUP_COLOR,
            textDecoration: "none",
            fontWeight: 600,
            padding: "2px 0",
            borderBottom: `1px solid ${GROUP_COLOR}15`,
          }}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}

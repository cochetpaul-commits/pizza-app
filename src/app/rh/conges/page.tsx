"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import { FloatingActions, FAIconPlus } from "@/components/layout/FloatingActions";

/* ── Types ─────────────────────────────────────────────────────── */

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  email: string | null;
};

type Contrat = {
  employe_id: string;
  date_debut: string;
};

type Absence = {
  id: string;
  employe_id: string;
  type: string;
  date_debut: string;
  date_fin: string;
  nb_jours: number | null;
  statut: string;
  note: string | null;
  created_at: string;
  employes?: { prenom: string; nom: string }[] | { prenom: string; nom: string } | null;
};

type DayCell = {
  date: Date;
  iso: string;
  isCurrentMonth: boolean;
};

type CpBalance = {
  employe_id: string;
  prenom: string;
  nom: string;
  acquis: number;
  pris: number;
  solde: number;
};

/* ── Constants ─────────────────────────────────────────────────── */

const TYPE_OPTIONS = [
  { value: "CP", label: "CP (Conge paye)" },
  { value: "RTT", label: "RTT" },
  { value: "maladie", label: "Maladie" },
  { value: "sans_solde", label: "Sans solde" },
  { value: "conge_special", label: "Conge special" },
  { value: "evenement_familial", label: "Evenement familial" },
];

const TYPE_LABELS: Record<string, string> = {
  CP: "CP",
  conge_paye: "CP",
  RTT: "RTT",
  rtt: "RTT",
  maladie: "Maladie",
  sans_solde: "Sans solde",
  conge_special: "Conge special",
  evenement_familial: "Evt. familial",
  absence_injustifiee: "Abs. injustifiee",
  ferie: "Ferie",
  repos_compensateur: "Repos comp.",
  formation: "Formation",
  accident_travail: "Acc. travail",
  maternite: "Maternite",
};

const TYPE_COLORS: Record<string, string> = {
  CP: "#2E7D32",
  conge_paye: "#2E7D32",
  RTT: "#1565C0",
  rtt: "#1565C0",
  maladie: "#c62828",
  sans_solde: "#666",
  conge_special: "#7B1FA2",
  evenement_familial: "#E65100",
  absence_injustifiee: "#c62828",
  ferie: "#1565C0",
  repos_compensateur: "#1565C0",
  formation: "#7B1FA2",
  accident_travail: "#c62828",
  maternite: "#7B1FA2",
};

const TYPE_BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  CP: { bg: "#E8F5E9", fg: "#2E7D32" },
  conge_paye: { bg: "#E8F5E9", fg: "#2E7D32" },
  RTT: { bg: "#E3F2FD", fg: "#1565C0" },
  rtt: { bg: "#E3F2FD", fg: "#1565C0" },
  maladie: { bg: "#fce4e4", fg: "#c62828" },
  sans_solde: { bg: "#f0ece6", fg: "#666" },
  conge_special: { bg: "#F3E5F5", fg: "#7B1FA2" },
  evenement_familial: { bg: "#FFF3E0", fg: "#E65100" },
  absence_injustifiee: { bg: "#fce4e4", fg: "#c62828" },
  ferie: { bg: "#E3F2FD", fg: "#1565C0" },
  repos_compensateur: { bg: "#E3F2FD", fg: "#1565C0" },
  formation: { bg: "#F3E5F5", fg: "#7B1FA2" },
  accident_travail: { bg: "#fce4e4", fg: "#c62828" },
  maternite: { bg: "#F3E5F5", fg: "#7B1FA2" },
};

const STATUT_COLORS: Record<string, { bg: string; fg: string }> = {
  en_attente: { bg: "#FFF3E0", fg: "#E65100" },
  valide: { bg: "#e8ede6", fg: "#4a6741" },
  refuse: { bg: "#fce4e4", fg: "#c62828" },
};

const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente",
  valide: "Valide",
  refuse: "Refuse",
};

const MONTH_LABELS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

const DAY_HEADERS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/* ── Helpers ───────────────────────────────────────────────────── */

function toISO(d: Date): string {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function todayISO(): string {
  return toISO(new Date());
}

function formatDateFR(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function businessDaysBetween(start: string, end: string): number {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  let count = 0;
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function getMonthDays(year: number, month: number): DayCell[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
  const days: DayCell[] = [];
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, iso: toISO(d), isCurrentMonth: false });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i);
    days.push({ date: d, iso: toISO(d), isCurrentMonth: true });
  }
  while (days.length % 7 !== 0) {
    const nextIdx = days.length - startDow - lastDay.getDate() + 1;
    const d = new Date(year, month + 1, nextIdx);
    days.push({ date: d, iso: toISO(d), isCurrentMonth: false });
  }
  return days;
}

function getAbsencesForDate(dateISO: string, absences: Absence[]): Absence[] {
  return absences.filter(
    (a) => a.date_debut <= dateISO && a.date_fin >= dateISO && a.statut !== "refuse"
  );
}

function getInitials(prenom: string, nom: string): string {
  return (prenom.charAt(0) + nom.charAt(0)).toUpperCase();
}

function getEmpFromAbsence(a: Absence): { prenom: string; nom: string } | undefined {
  if (!a.employes) return undefined;
  if (Array.isArray(a.employes)) return a.employes[0] ?? undefined;
  return a.employes;
}

function isInRange(iso: string, start: string | null, end: string | null): boolean {
  if (!start) return false;
  if (!end) return iso === start;
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  return iso >= lo && iso <= hi;
}

function rangeOrdered(start: string | null, end: string | null): { lo: string; hi: string } | null {
  if (!start || !end) return null;
  return start <= end ? { lo: start, hi: end } : { lo: end, hi: start };
}

/**
 * Compute CP reference period (June N-1 to May N).
 * If today is between June and December, period is June of current year to May of next year.
 * If today is between January and May, period is June of previous year to May of current year.
 */
function getCpReferencePeriod(now: Date): { start: string; end: string } {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  if (month >= 5) {
    // June (5) to December -> period starts this year
    return {
      start: `${year}-06-01`,
      end: `${year + 1}-05-31`,
    };
  } else {
    return {
      start: `${year - 1}-06-01`,
      end: `${year}-05-31`,
    };
  }
}

/**
 * Compute months worked within the reference period.
 * Capped at the number of full months elapsed so far.
 */
function computeMonthsWorkedInPeriod(
  hireDate: string | null,
  periodStart: string,
  now: Date
): number {
  const pStart = new Date(periodStart + "T00:00:00");
  const effectiveStart = hireDate && new Date(hireDate + "T00:00:00") > pStart
    ? new Date(hireDate + "T00:00:00")
    : pStart;

  if (effectiveStart > now) return 0;

  const months =
    (now.getFullYear() - effectiveStart.getFullYear()) * 12 +
    (now.getMonth() - effectiveStart.getMonth());

  // Count the current month as started if we are past the hire day
  const adjustedMonths = now.getDate() >= effectiveStart.getDate() ? months + 1 : months;

  return Math.max(0, Math.min(adjustedMonths, 12));
}

/* ── Component ─────────────────────────────────────────────────── */

export default function CongesPage() {
  const { current: etab } = useEtablissement();
  const { isGroupAdmin, role } = useProfile();
  const isEquipier = role === "equipier";

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Calendar nav
  const [nowStable] = useState(() => new Date());
  const now = nowStable;
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  // Airbnb-style date selection
  const [selectStart, setSelectStart] = useState<string | null>(null);
  const [selectEnd, setSelectEnd] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // Request form
  const [formType, setFormType] = useState("CP");
  const [formNote, setFormNote] = useState("");
  const [formEmployeId, setFormEmployeId] = useState("");
  const [saving, setSaving] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Refuse reason
  const [refuseId, setRefuseId] = useState<string | null>(null);
  const [refuseReason, setRefuseReason] = useState("");

  const today = todayISO();

  /* ── Get user email for equipier matching ─────────────────────── */

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email ?? null);
    });
  }, []);

  /* ── Data loading ───────────────────────────────────────────── */

  const loadData = useCallback(async () => {
    if (!etab) return;
    setLoading(true);

    const [empRes, absRes, contratRes] = await Promise.all([
      supabase
        .from("employes")
        .select("id, prenom, nom, email")
        .eq("etablissement_id", etab.id)
        .eq("actif", true)
        .order("nom"),
      supabase
        .from("absences")
        .select("id, employe_id, type, date_debut, date_fin, nb_jours, statut, note, created_at, employes(prenom, nom)")
        .eq("etablissement_id", etab.id)
        .order("date_debut", { ascending: false })
        .limit(500),
      supabase
        .from("contrats")
        .select("employe_id, date_debut")
        .eq("actif", true)
        .order("date_debut", { ascending: true }),
    ]);

    const emps: Employe[] = empRes.data ?? [];
    setEmployes(emps);
    setContrats((contratRes.data ?? []) as Contrat[]);

    const empIds = new Set(emps.map((e) => e.id));
    const raw = (absRes.data ?? []) as Absence[];
    const filtered = raw.filter((a) => empIds.has(a.employe_id));
    setAbsences(filtered);
    setLoading(false);
  }, [etab]);

  useEffect(() => {
    if (!etab) return;
    loadData(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [etab, loadData]);

  /* ── Equipier: auto-select own employee ─────────────────────── */

  const myEmploye = useMemo(() => {
    if (!isEquipier || !userEmail) return null;
    return employes.find(
      (e) => e.email && e.email.toLowerCase() === userEmail.toLowerCase()
    ) ?? null;
  }, [isEquipier, userEmail, employes]);

  // For equipier, the effective employee ID is always their own
  const effectiveFormEmployeId = isEquipier && myEmploye ? myEmploye.id : formEmployeId;

  /* ── Calendar data ──────────────────────────────────────────── */

  const monthDays = useMemo(() => getMonthDays(calYear, calMonth), [calYear, calMonth]);

  const empMap = useMemo(() => {
    const m = new Map<string, Employe>();
    for (const e of employes) m.set(e.id, e);
    return m;
  }, [employes]);

  /* ── CP Balances ─────────────────────────────────────────────── */

  const cpReferencePeriod = useMemo(() => getCpReferencePeriod(now), [now]);

  const cpBalances: CpBalance[] = useMemo(() => {
    return employes.map((emp) => {
      const contrat = contrats.find((c) => c.employe_id === emp.id);
      const hireDate = contrat?.date_debut ?? null;

      const monthsWorked = computeMonthsWorkedInPeriod(
        hireDate,
        cpReferencePeriod.start,
        now
      );
      const acquis = Math.min(monthsWorked * 2.5, 30);

      // Sum nb_jours from validated CP absences within current reference period
      const pris = absences
        .filter((a) => {
          if (a.employe_id !== emp.id) return false;
          if (a.type !== "CP" && a.type !== "conge_paye") return false;
          if (a.statut !== "valide") return false;
          // Overlaps with reference period
          return a.date_fin >= cpReferencePeriod.start && a.date_debut <= cpReferencePeriod.end;
        })
        .reduce((sum, a) => {
          if (a.nb_jours != null && a.nb_jours > 0) return sum + Number(a.nb_jours);
          return sum + businessDaysBetween(a.date_debut, a.date_fin);
        }, 0);

      return {
        employe_id: emp.id,
        prenom: emp.prenom,
        nom: emp.nom,
        acquis: Math.round(acquis * 10) / 10,
        pris: Math.round(pris * 10) / 10,
        solde: Math.round((acquis - pris) * 10) / 10,
      };
    });
  }, [employes, contrats, absences, cpReferencePeriod, now]);

  /* ── KPIs ───────────────────────────────────────────────────── */

  const pendingCount = useMemo(
    () => absences.filter((a) => a.statut === "en_attente").length,
    [absences]
  );

  const currentMonthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  const daysThisMonth = useMemo(() => {
    return absences
      .filter((a) => {
        if (a.statut === "refuse") return false;
        return a.date_debut.substring(0, 7) === currentMonthKey || a.date_fin.substring(0, 7) === currentMonthKey;
      })
      .reduce((sum, a) => sum + daysBetween(a.date_debut, a.date_fin), 0);
  }, [absences, currentMonthKey]);

  /* ── Pending requests ───────────────────────────────────────── */

  const pendingRequests = useMemo(
    () => absences.filter((a) => a.statut === "en_attente"),
    [absences]
  );

  /* ── Calendar click handlers ────────────────────────────────── */

  const handleDayClick = (iso: string) => {
    if (!selectStart || (selectStart && selectEnd)) {
      setSelectStart(iso);
      setSelectEnd(null);
    } else {
      setSelectEnd(iso);
    }
  };

  const clearSelection = () => {
    setSelectStart(null);
    setSelectEnd(null);
    setFormType("CP");
    setFormNote("");
    if (!isEquipier) setFormEmployeId("");
  };

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalYear(calYear - 1);
      setCalMonth(11);
    } else {
      setCalMonth(calMonth - 1);
    }
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalYear(calYear + 1);
      setCalMonth(0);
    } else {
      setCalMonth(calMonth + 1);
    }
  };

  /* ── Conflict check for selected range ──────────────────────── */

  const selectedRange = rangeOrdered(selectStart, selectEnd);
  const conflictsInRange = useMemo(() => {
    if (!selectedRange) return [];
    return absences.filter(
      (a) =>
        a.statut !== "refuse" &&
        a.date_debut <= selectedRange.hi &&
        a.date_fin >= selectedRange.lo
    );
  }, [absences, selectedRange]);

  /* ── Selected employee CP balance ─────────────────────────── */

  const selectedEmployeeCp = useMemo(() => {
    if (!effectiveFormEmployeId) return null;
    return cpBalances.find((b) => b.employe_id === effectiveFormEmployeId) ?? null;
  }, [effectiveFormEmployeId, cpBalances]);

  const requestedDays = useMemo(() => {
    if (!selectedRange) return 0;
    return businessDaysBetween(selectedRange.lo, selectedRange.hi);
  }, [selectedRange]);

  const exceedsBalance = useMemo(() => {
    if (!selectedEmployeeCp || formType !== "CP") return false;
    return requestedDays > selectedEmployeeCp.solde;
  }, [selectedEmployeeCp, requestedDays, formType]);

  /* ── Submit request ─────────────────────────────────────────── */

  const handleSubmit = async () => {
    if (!selectedRange) return;
    const empId = effectiveFormEmployeId;
    if (!empId) return;

    setSaving(true);
    const nbJours = businessDaysBetween(selectedRange.lo, selectedRange.hi);

    const { error } = await supabase.from("absences").insert({
      employe_id: empId,
      etablissement_id: etab?.id,
      type: formType,
      date_debut: selectedRange.lo,
      date_fin: selectedRange.hi,
      nb_jours: nbJours,
      statut: "en_attente",
      note: formNote || null,
    });
    setSaving(false);

    if (!error) {
      clearSelection();
      loadData();
    } else {
      alert("Erreur : " + error.message);
    }
  };

  /* ── Approve / refuse ───────────────────────────────────────── */

  const handleApprove = async (id: string) => {
    const { error } = await supabase
      .from("absences")
      .update({ statut: "valide" })
      .eq("id", id);
    if (!error) loadData();
    else alert("Erreur : " + error.message);
  };

  const handleRefuse = async (id: string) => {
    const { error } = await supabase
      .from("absences")
      .update({ statut: "refuse", motif_refus: refuseReason || null })
      .eq("id", id);
    if (!error) {
      setRefuseId(null);
      setRefuseReason("");
      loadData();
    } else {
      alert("Erreur : " + error.message);
    }
  };

  /* ── Determine visual end for hover preview ─────────────────── */
  const visualEnd = selectEnd ?? (selectStart && hoveredDate ? hoveredDate : null);

  /* ── Absences filtered for equipier ────────────────────────── */
  const displayedAbsences = useMemo(() => {
    if (isEquipier && myEmploye) {
      return absences.filter((a) => a.employe_id === myEmploye.id);
    }
    return absences;
  }, [absences, isEquipier, myEmploye]);

  /* ── Render ─────────────────────────────────────────────────── */

  const kpiCardStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 140,
    background: "#fff",
    border: "1px solid #ddd6c8",
    borderRadius: 12,
    padding: "16px 18px",
    textAlign: "center",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #ddd6c8",
    borderRadius: 8,
    fontSize: 14,
    background: "#fff",
    boxSizing: "border-box",
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontFamily: "var(--font-oswald), Oswald, sans-serif",
    fontSize: 16,
    fontWeight: 700,
    color: "#1a1a1a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  };

  return (
    <RequireRole allowedRoles={["group_admin", "equipier"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 120px" }}>
        {/* ── Header ──────────────────────────────────────────── */}
        <h1
          style={{
            fontFamily: "var(--font-oswald), Oswald, sans-serif",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 1,
            marginBottom: 20,
            color: "#1a1a1a",
            textTransform: "uppercase",
          }}
        >
          {isEquipier ? "Mes conges" : "Conges"}
        </h1>

        {/* ── KPI Cards ───────────────────────────────────────── */}
        {!loading && etab && (
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            {isEquipier && myEmploye ? (
              // Equipier: show own CP balance prominently
              (() => {
                const myCp = cpBalances.find((b) => b.employe_id === myEmploye.id);
                return myCp ? (
                  <>
                    <div style={kpiCardStyle}>
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 700,
                          color: "#2E7D32",
                          fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        }}
                      >
                        {myCp.acquis}
                      </div>
                      <div style={{ fontSize: 12, color: "#999", marginTop: 4, fontWeight: 500 }}>
                        CP acquis
                      </div>
                    </div>
                    <div style={kpiCardStyle}>
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 700,
                          color: "#D4775A",
                          fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        }}
                      >
                        {myCp.pris}
                      </div>
                      <div style={{ fontSize: 12, color: "#999", marginTop: 4, fontWeight: 500 }}>
                        CP pris
                      </div>
                    </div>
                    <div style={kpiCardStyle}>
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 700,
                          color: myCp.solde <= 0 ? "#c62828" : "#1a1a1a",
                          fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        }}
                      >
                        {myCp.solde}
                      </div>
                      <div style={{ fontSize: 12, color: "#999", marginTop: 4, fontWeight: 500 }}>
                        Solde CP
                      </div>
                    </div>
                  </>
                ) : null;
              })()
            ) : (
              // Admin view: show global KPIs
              <>
                <div style={kpiCardStyle}>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: pendingCount > 0 ? "#E65100" : "#1a1a1a",
                      fontFamily: "var(--font-oswald), Oswald, sans-serif",
                    }}
                  >
                    {pendingCount}
                  </div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 4, fontWeight: 500 }}>
                    Demandes en attente
                  </div>
                </div>
                <div style={kpiCardStyle}>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: "#1a1a1a",
                      fontFamily: "var(--font-oswald), Oswald, sans-serif",
                    }}
                  >
                    {daysThisMonth}
                  </div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 4, fontWeight: 500 }}>
                    Jours poses ce mois
                  </div>
                </div>
                <div style={kpiCardStyle}>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: "#1a1a1a",
                      fontFamily: "var(--font-oswald), Oswald, sans-serif",
                    }}
                  >
                    {employes.length}
                  </div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 4, fontWeight: 500 }}>
                    Employes
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {loading ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>
            Chargement...
          </p>
        ) : !etab ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>
            Selectionnez un etablissement
          </p>
        ) : (
          <>
            {/* ── SOLDES CP (admin only) ──────────────────────── */}
            {!isEquipier && cpBalances.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h2 style={sectionTitleStyle}>Soldes CP</h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 10,
                  }}
                >
                  {cpBalances.map((b) => {
                    const pct = b.acquis > 0 ? Math.min((b.pris / b.acquis) * 100, 100) : 0;
                    const barColor = b.solde <= 5 ? "#c62828" : b.solde <= 10 ? "#E65100" : "#2E7D32";
                    return (
                      <div
                        key={b.employe_id}
                        style={{
                          background: "#fff",
                          border: "1px solid #ddd6c8",
                          borderRadius: 12,
                          padding: "12px 14px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 6,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "#f6eedf",
                                border: "1px solid #ddd6c8",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#D4775A",
                                flexShrink: 0,
                              }}
                            >
                              {getInitials(b.prenom, b.nom)}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>
                              {b.prenom} {b.nom}
                            </span>
                          </div>
                          <span
                            style={{
                              fontFamily: "var(--font-oswald), Oswald, sans-serif",
                              fontSize: 18,
                              fontWeight: 700,
                              color: b.solde <= 0 ? "#c62828" : "#1a1a1a",
                            }}
                          >
                            {b.solde}j
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 11,
                            color: "#999",
                            marginBottom: 4,
                          }}
                        >
                          <span>Acquis : {b.acquis}j</span>
                          <span>Pris : {b.pris}j</span>
                        </div>
                        {/* Progress bar */}
                        <div
                          style={{
                            height: 4,
                            borderRadius: 2,
                            background: "#f0ece6",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${pct}%`,
                              background: barColor,
                              borderRadius: 2,
                              transition: "width 0.3s",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>
                  Periode de reference : {formatDateFR(cpReferencePeriod.start)} au{" "}
                  {formatDateFR(cpReferencePeriod.end)} -- 2.5 jours/mois
                </div>
              </div>
            )}

            {/* ── Calendar ────────────────────────────────────── */}
            <div
              ref={calendarRef}
              style={{
                background: "#fff",
                border: "1px solid #ddd6c8",
                borderRadius: 16,
                padding: "20px",
                marginBottom: 24,
              }}
            >
              {/* Month navigation */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <button
                  onClick={prevMonth}
                  style={{
                    background: "none",
                    border: "1px solid #ddd6c8",
                    borderRadius: 8,
                    width: 36,
                    height: 36,
                    cursor: "pointer",
                    fontSize: 16,
                    color: "#1a1a1a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  &#8249;
                </button>
                <span
                  style={{
                    fontFamily: "var(--font-oswald), Oswald, sans-serif",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#1a1a1a",
                  }}
                >
                  {MONTH_LABELS[calMonth]} {calYear}
                </span>
                <button
                  onClick={nextMonth}
                  style={{
                    background: "none",
                    border: "1px solid #ddd6c8",
                    borderRadius: 8,
                    width: 36,
                    height: 36,
                    cursor: "pointer",
                    fontSize: 16,
                    color: "#1a1a1a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  &#8250;
                </button>
              </div>

              {/* Day headers */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 0,
                }}
              >
                {DAY_HEADERS.map((d) => (
                  <div
                    key={d}
                    style={{
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#999",
                      padding: "6px 0",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {d}
                  </div>
                ))}

                {/* Day cells */}
                {monthDays.map((cell) => {
                  const dayAbsences = getAbsencesForDate(cell.iso, absences);
                  const absCount = dayAbsences.length;
                  const isToday = cell.iso === today;
                  const isStart = cell.iso === selectStart;
                  const isEnd = cell.iso === (selectEnd ?? selectStart);
                  const inRange = isInRange(cell.iso, selectStart, visualEnd);
                  const isEndpoint = isStart || (selectEnd && cell.iso === selectEnd);
                  const isWeekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;

                  // Heat color
                  let heatBg = "transparent";
                  if (isWeekend && cell.isCurrentMonth) heatBg = "rgba(0,0,0,0.02)";
                  else if (absCount >= 3 && cell.isCurrentMonth) heatBg = "rgba(198,40,40,0.07)";
                  else if (absCount === 2 && cell.isCurrentMonth) heatBg = "rgba(230,81,0,0.06)";
                  else if (absCount === 1 && cell.isCurrentMonth) heatBg = "rgba(46,125,50,0.05)";

                  // Selection background
                  let cellBg = heatBg;
                  if (inRange && !isEndpoint) cellBg = "rgba(212,119,90,0.12)";
                  if (isEndpoint) cellBg = "#D4775A";

                  return (
                    <div
                      key={cell.iso}
                      onClick={() => cell.isCurrentMonth && handleDayClick(cell.iso)}
                      onMouseEnter={() => {
                        if (selectStart && !selectEnd) setHoveredDate(cell.iso);
                      }}
                      onMouseLeave={() => setHoveredDate(null)}
                      style={{
                        minHeight: 76,
                        padding: "4px 3px 2px",
                        border: isToday ? "2px solid #1565C0" : "1px solid #e0d8ce",
                        background: cellBg,
                        cursor: cell.isCurrentMonth ? "pointer" : "default",
                        position: "relative",
                        transition: "background 0.15s",
                        borderRadius:
                          isStart && !selectEnd
                            ? 8
                            : isStart
                              ? "8px 0 0 8px"
                              : isEnd && selectEnd
                                ? "0 8px 8px 0"
                                : 0,
                      }}
                    >
                      {/* Day number */}
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: isToday ? 700 : 400,
                          color: isEndpoint
                            ? "#fff"
                            : !cell.isCurrentMonth
                              ? "#ccc"
                              : isWeekend
                                ? "#bbb"
                                : "#1a1a1a",
                          marginBottom: 2,
                          textAlign: "right",
                          paddingRight: 2,
                        }}
                      >
                        {cell.date.getDate()}
                      </div>

                      {/* Employee badges */}
                      {cell.isCurrentMonth && dayAbsences.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 1,
                            overflow: "hidden",
                            maxHeight: 40,
                          }}
                        >
                          {dayAbsences.slice(0, 3).map((a) => {
                            const emp = empMap.get(a.employe_id);
                            const dotColor = TYPE_COLORS[a.type] ?? "#999";
                            return (
                              <div
                                key={a.id}
                                title={
                                  emp
                                    ? `${emp.prenom} ${emp.nom} - ${TYPE_LABELS[a.type] ?? a.type}`
                                    : TYPE_LABELS[a.type] ?? a.type
                                }
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: "50%",
                                  background: dotColor,
                                  color: "#fff",
                                  fontSize: 7,
                                  fontWeight: 700,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  lineHeight: 1,
                                  flexShrink: 0,
                                }}
                              >
                                {emp ? getInitials(emp.prenom, emp.nom) : "?"}
                              </div>
                            );
                          })}
                          {dayAbsences.length > 3 && (
                            <div
                              style={{
                                fontSize: 8,
                                color: isEndpoint ? "#fff" : "#999",
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                              }}
                            >
                              +{dayAbsences.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  marginTop: 12,
                  fontSize: 11,
                  color: "#999",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#2E7D32",
                      display: "inline-block",
                    }}
                  />
                  CP
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#1565C0",
                      display: "inline-block",
                    }}
                  />
                  RTT
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#c62828",
                      display: "inline-block",
                    }}
                  />
                  Maladie
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#7B1FA2",
                      display: "inline-block",
                    }}
                  />
                  Autre
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      border: "2px solid #1565C0",
                      borderRadius: 3,
                      display: "inline-block",
                      boxSizing: "border-box",
                    }}
                  />
                  Aujourd&apos;hui
                </span>
              </div>
            </div>

            {/* ── Request Form (when dates selected) ──────────── */}
            {selectStart && (
              <div
                style={{
                  background: "#fff",
                  border: "2px solid #D4775A",
                  borderRadius: 16,
                  padding: "20px 24px",
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        fontSize: 16,
                        fontWeight: 700,
                        color: "#1a1a1a",
                        marginBottom: 4,
                      }}
                    >
                      Nouvelle demande
                    </div>
                    <div style={{ fontSize: 14, color: "#666" }}>
                      {selectedRange ? (
                        <>
                          Du{" "}
                          <strong style={{ color: "#D4775A" }}>
                            {formatDateFR(selectedRange.lo)}
                          </strong>{" "}
                          au{" "}
                          <strong style={{ color: "#D4775A" }}>
                            {formatDateFR(selectedRange.hi)}
                          </strong>
                          {" "}
                          <span style={{ color: "#999", fontSize: 13 }}>
                            ({requestedDays} jour{requestedDays > 1 ? "s" : ""} ouvre{requestedDays > 1 ? "s" : ""})
                          </span>
                        </>
                      ) : (
                        <>
                          Debut :{" "}
                          <strong style={{ color: "#D4775A" }}>
                            {formatDateFR(selectStart)}
                          </strong>
                          {" "}
                          <span style={{ color: "#999", fontSize: 13 }}>
                            -- cliquez sur une autre date pour terminer
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={clearSelection}
                    style={{
                      background: "none",
                      border: "1px solid #ddd6c8",
                      borderRadius: 8,
                      padding: "4px 10px",
                      fontSize: 13,
                      color: "#999",
                      cursor: "pointer",
                    }}
                  >
                    Annuler
                  </button>
                </div>

                {/* Conflicts */}
                {selectedRange && conflictsInRange.length > 0 && (
                  <div
                    style={{
                      background: "#FFF3E0",
                      border: "1px solid #FFCC80",
                      borderRadius: 10,
                      padding: "10px 14px",
                      marginBottom: 14,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#E65100", marginBottom: 4 }}>
                      Deja en absence sur cette periode :
                    </div>
                    {conflictsInRange.map((c) => {
                      const emp = empMap.get(c.employe_id);
                      return (
                        <div key={c.id} style={{ color: "#666", marginBottom: 2 }}>
                          {emp ? `${emp.prenom} ${emp.nom}` : "Inconnu"} --{" "}
                          {TYPE_LABELS[c.type] ?? c.type} ({formatDateFR(c.date_debut)}
                          {c.date_debut !== c.date_fin && ` au ${formatDateFR(c.date_fin)}`})
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedRange && (
                  <>
                    {/* CP Balance warning */}
                    {selectedEmployeeCp && formType === "CP" && (
                      <div
                        style={{
                          background: exceedsBalance ? "#fce4e4" : "#E8F5E9",
                          border: `1px solid ${exceedsBalance ? "#ef9a9a" : "#A5D6A7"}`,
                          borderRadius: 10,
                          padding: "10px 14px",
                          marginBottom: 14,
                          fontSize: 13,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 600, color: exceedsBalance ? "#c62828" : "#2E7D32" }}>
                            Solde CP : {selectedEmployeeCp.solde} jours
                          </span>
                          <span style={{ color: "#666", marginLeft: 8 }}>
                            ({selectedEmployeeCp.acquis} acquis - {selectedEmployeeCp.pris} pris)
                          </span>
                        </div>
                        {exceedsBalance && (
                          <span style={{ color: "#c62828", fontWeight: 600, fontSize: 12 }}>
                            Solde insuffisant
                          </span>
                        )}
                      </div>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isEquipier ? "1fr" : "1fr 1fr",
                        gap: 12,
                        marginBottom: 14,
                      }}
                    >
                      {/* Type */}
                      <label>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#1a1a1a",
                            display: "block",
                            marginBottom: 4,
                          }}
                        >
                          Type
                        </span>
                        <select
                          value={formType}
                          onChange={(e) => setFormType(e.target.value)}
                          style={inputStyle}
                        >
                          {TYPE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {/* Employee (for managers only) */}
                      {!isEquipier && (
                        <label>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#1a1a1a",
                              display: "block",
                              marginBottom: 4,
                            }}
                          >
                            Employe
                          </span>
                          <select
                            value={formEmployeId}
                            onChange={(e) => setFormEmployeId(e.target.value)}
                            style={inputStyle}
                          >
                            <option value="">Choisir...</option>
                            {employes.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.prenom} {e.nom}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>

                    {/* Note */}
                    <label style={{ display: "block", marginBottom: 16 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#1a1a1a",
                          display: "block",
                          marginBottom: 4,
                        }}
                      >
                        Note (optionnel)
                      </span>
                      <textarea
                        value={formNote}
                        onChange={(e) => setFormNote(e.target.value)}
                        rows={2}
                        placeholder="Raison, commentaire..."
                        style={{
                          ...inputStyle,
                          resize: "vertical",
                        }}
                      />
                    </label>

                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button
                        onClick={clearSelection}
                        style={{
                          padding: "8px 18px",
                          border: "1px solid #ddd6c8",
                          borderRadius: 20,
                          background: "#fff",
                          fontSize: 13,
                          cursor: "pointer",
                          color: "#1a1a1a",
                        }}
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={!effectiveFormEmployeId || saving}
                        style={{
                          padding: "8px 20px",
                          border: "none",
                          borderRadius: 20,
                          background: !effectiveFormEmployeId ? "#ccc" : "#D4775A",
                          color: "#fff",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: !effectiveFormEmployeId ? "default" : "pointer",
                          opacity: saving ? 0.7 : 1,
                        }}
                      >
                        {saving ? "Envoi..." : "Soumettre la demande"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Pending Requests (managers) ─────────────────── */}
            {isGroupAdmin && pendingRequests.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h2 style={sectionTitleStyle}>
                  Demandes en attente
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pendingRequests.map((a) => {
                    const emp = getEmpFromAbsence(a) ?? empMap.get(a.employe_id);
                    const empName = emp
                      ? `${emp.prenom} ${emp.nom}`
                      : "Employe inconnu";
                    const initials = emp ? getInitials(emp.prenom, emp.nom) : "??";
                    const tc = TYPE_BADGE_COLORS[a.type] ?? { bg: "#f0ece6", fg: "#666" };
                    const days = a.nb_jours ?? businessDaysBetween(a.date_debut, a.date_fin);
                    const isRefusing = refuseId === a.id;

                    return (
                      <div
                        key={a.id}
                        style={{
                          border: "1px solid #ddd6c8",
                          borderRadius: 12,
                          padding: "14px 18px",
                          background: "#fff",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 12,
                          }}
                        >
                          <div style={{ display: "flex", gap: 12, flex: 1, alignItems: "flex-start" }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: "#f6eedf",
                                border: "1px solid #ddd6c8",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                                fontWeight: 700,
                                color: "#D4775A",
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                                {empName}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  marginBottom: 4,
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: tc.bg,
                                    color: tc.fg,
                                  }}
                                >
                                  {TYPE_LABELS[a.type] ?? a.type}
                                </span>
                                <span style={{ fontSize: 13, color: "#666" }}>
                                  {formatDateFR(a.date_debut)}
                                  {a.date_debut !== a.date_fin && ` → ${formatDateFR(a.date_fin)}`}
                                </span>
                                <span style={{ fontSize: 12, color: "#999", fontWeight: 500 }}>
                                  {days} jour{days > 1 ? "s" : ""}
                                </span>
                              </div>
                              {a.note && (
                                <div style={{ fontSize: 12, color: "#999", fontStyle: "italic" }}>
                                  {a.note}
                                </div>
                              )}
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexShrink: 0,
                              alignItems: "center",
                            }}
                          >
                            <button
                              onClick={() => handleApprove(a.id)}
                              style={{
                                padding: "6px 14px",
                                borderRadius: 20,
                                border: "1px solid #4a6741",
                                background: "#e8ede6",
                                color: "#4a6741",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Valider
                            </button>
                            <button
                              onClick={() => {
                                setRefuseId(isRefusing ? null : a.id);
                                setRefuseReason("");
                              }}
                              style={{
                                padding: "6px 14px",
                                borderRadius: 20,
                                border: "1px solid #c62828",
                                background: "#fce4e4",
                                color: "#c62828",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Refuser
                            </button>
                          </div>
                        </div>

                        {/* Refuse reason input */}
                        {isRefusing && (
                          <div
                            style={{
                              marginTop: 12,
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="text"
                              value={refuseReason}
                              onChange={(e) => setRefuseReason(e.target.value)}
                              placeholder="Motif du refus..."
                              style={{
                                flex: 1,
                                padding: "6px 10px",
                                border: "1px solid #ddd6c8",
                                borderRadius: 8,
                                fontSize: 13,
                              }}
                            />
                            <button
                              onClick={() => handleRefuse(a.id)}
                              style={{
                                padding: "6px 14px",
                                borderRadius: 20,
                                border: "none",
                                background: "#c62828",
                                color: "#fff",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Confirmer
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── All Absences ────────────────────────────────── */}
            <div>
              <h2 style={sectionTitleStyle}>
                {isEquipier ? "Historique" : "Absences"}
              </h2>
              {displayedAbsences.length === 0 ? (
                <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 20 }}>
                  Aucune absence enregistree
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {displayedAbsences.slice(0, 30).map((a) => {
                    const emp = getEmpFromAbsence(a) ?? empMap.get(a.employe_id);
                    const empName = emp
                      ? `${emp.prenom} ${emp.nom}`
                      : "Inconnu";
                    const initials = emp ? getInitials(emp.prenom, emp.nom) : "??";
                    const sc = STATUT_COLORS[a.statut] ?? { bg: "#f0ece6", fg: "#999" };
                    const tc = TYPE_BADGE_COLORS[a.type] ?? { bg: "#f0ece6", fg: "#666" };
                    const days = a.nb_jours ?? businessDaysBetween(a.date_debut, a.date_fin);

                    return (
                      <div
                        key={a.id}
                        style={{
                          border: "1px solid #ddd6c8",
                          borderRadius: 12,
                          padding: "12px 16px",
                          background: "#fff",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f0e8")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: "50%",
                                background: "#f6eedf",
                                border: "1px solid #ddd6c8",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#D4775A",
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                }}
                              >
                                {!isEquipier && (
                                  <span style={{ fontWeight: 600, fontSize: 13 }}>{empName}</span>
                                )}
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "1px 7px",
                                    borderRadius: 6,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    background: tc.bg,
                                    color: tc.fg,
                                  }}
                                >
                                  {TYPE_LABELS[a.type] ?? a.type}
                                </span>
                                <span style={{ fontSize: 12, color: "#666" }}>
                                  {formatDateFR(a.date_debut)}
                                  {a.date_debut !== a.date_fin && ` → ${formatDateFR(a.date_fin)}`}
                                </span>
                                <span style={{ fontSize: 11, color: "#999" }}>
                                  {days}j
                                </span>
                              </div>
                              {a.note && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: "#999",
                                    fontStyle: "italic",
                                    marginTop: 2,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {a.note}
                                </div>
                              )}
                            </div>
                          </div>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: 8,
                              fontSize: 11,
                              fontWeight: 600,
                              background: sc.bg,
                              color: sc.fg,
                              flexShrink: 0,
                            }}
                          >
                            {STATUT_LABELS[a.statut] ?? a.statut}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {displayedAbsences.length > 30 && (
                    <p style={{ color: "#999", fontSize: 12, textAlign: "center", marginTop: 8 }}>
                      {displayedAbsences.length - 30} absences supplementaires non affichees
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
        <FloatingActions actions={[
          { icon: <FAIconPlus size={22} color="#fff" />, label: "Nouvelle demande", onClick: () => calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), primary: true },
        ]} />
      </div>
    </RequireRole>
  );
}

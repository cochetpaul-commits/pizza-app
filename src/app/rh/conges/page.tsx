"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";

/* ── Types ─────────────────────────────────────────────────────── */

type Employe = {
  id: string;
  prenom: string;
  nom: string;
};

type Absence = {
  id: string;
  employe_id: string;
  type: string;
  date_debut: string;
  date_fin: string;
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

/* ── Constants ─────────────────────────────────────────────────── */

const TYPE_OPTIONS = [
  { value: "conge_paye", label: "CP (Conge paye)" },
  { value: "rtt", label: "RTT" },
  { value: "maladie", label: "Maladie" },
  { value: "sans_solde", label: "Sans solde" },
  { value: "conge_special", label: "Conge special" },
  { value: "evenement_familial", label: "Evenement familial" },
];

const TYPE_LABELS: Record<string, string> = {
  conge_paye: "CP",
  rtt: "RTT",
  maladie: "Maladie",
  sans_solde: "Sans solde",
  conge_special: "Conge special",
  evenement_familial: "Evt. familial",
  absence_injustifiee: "Abs. injustifiee",
};

const TYPE_COLORS: Record<string, string> = {
  conge_paye: "#2E7D32",
  rtt: "#1565C0",
  maladie: "#c62828",
  sans_solde: "#666",
  conge_special: "#7B1FA2",
  evenement_familial: "#E65100",
  absence_injustifiee: "#c62828",
};

const TYPE_BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  conge_paye: { bg: "#E8F5E9", fg: "#2E7D32" },
  rtt: { bg: "#E3F2FD", fg: "#1565C0" },
  maladie: { bg: "#fce4e4", fg: "#c62828" },
  sans_solde: { bg: "#f0ece6", fg: "#666" },
  conge_special: { bg: "#F3E5F5", fg: "#7B1FA2" },
  evenement_familial: { bg: "#FFF3E0", fg: "#E65100" },
  absence_injustifiee: { bg: "#fce4e4", fg: "#c62828" },
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

function getMonthDays(year: number, month: number): DayCell[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
  const days: DayCell[] = [];
  // Padding days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, iso: toISO(d), isCurrentMonth: false });
  }
  // Current month days
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i);
    days.push({ date: d, iso: toISO(d), isCurrentMonth: true });
  }
  // Padding to complete last week
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

/* ── Component ─────────────────────────────────────────────────── */

export default function CongesPage() {
  const { current: etab } = useEtablissement();
  const { isGroupAdmin } = useProfile();

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar nav
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  // Airbnb-style date selection
  const [selectStart, setSelectStart] = useState<string | null>(null);
  const [selectEnd, setSelectEnd] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // Request form
  const [formType, setFormType] = useState("conge_paye");
  const [formNote, setFormNote] = useState("");
  const [formEmployeId, setFormEmployeId] = useState("");
  const [saving, setSaving] = useState(false);

  // Refuse reason
  const [refuseId, setRefuseId] = useState<string | null>(null);
  const [refuseReason, setRefuseReason] = useState("");

  const today = todayISO();

  /* ── Data loading ───────────────────────────────────────────── */

  const loadData = useCallback(async () => {
    if (!etab) return;
    setLoading(true);

    const [empRes, absRes] = await Promise.all([
      supabase
        .from("employes")
        .select("id, prenom, nom")
        .eq("etablissement_id", etab.id)
        .eq("actif", true)
        .order("nom"),
      supabase
        .from("absences")
        .select("id, employe_id, type, date_debut, date_fin, statut, note, created_at, employes(prenom, nom)")
        .eq("etablissement_id", etab.id)
        .order("date_debut", { ascending: false })
        .limit(500),
    ]);

    const emps: Employe[] = empRes.data ?? [];
    setEmployes(emps);

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

  /* ── Calendar data ──────────────────────────────────────────── */

  const monthDays = useMemo(() => getMonthDays(calYear, calMonth), [calYear, calMonth]);

  const empMap = useMemo(() => {
    const m = new Map<string, Employe>();
    for (const e of employes) m.set(e.id, e);
    return m;
  }, [employes]);

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

  const avgCpRemaining = useMemo(() => {
    if (employes.length === 0) return 0;
    let total = 0;
    for (const emp of employes) {
      const used = absences
        .filter((a) => a.employe_id === emp.id && a.type === "conge_paye" && a.statut === "valide")
        .reduce((s, a) => s + daysBetween(a.date_debut, a.date_fin), 0);
      total += 25 - used;
    }
    return Math.round((total / employes.length) * 10) / 10;
  }, [employes, absences]);

  /* ── Pending requests ───────────────────────────────────────── */

  const pendingRequests = useMemo(
    () => absences.filter((a) => a.statut === "en_attente"),
    [absences]
  );

  /* ── Calendar click handlers ────────────────────────────────── */

  const handleDayClick = (iso: string) => {
    if (!selectStart || (selectStart && selectEnd)) {
      // Start new selection
      setSelectStart(iso);
      setSelectEnd(null);
    } else {
      // Complete selection
      setSelectEnd(iso);
    }
  };

  const clearSelection = () => {
    setSelectStart(null);
    setSelectEnd(null);
    setFormType("conge_paye");
    setFormNote("");
    setFormEmployeId("");
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

  /* ── Submit request ─────────────────────────────────────────── */

  const handleSubmit = async () => {
    if (!selectedRange) return;
    const empId = isGroupAdmin && formEmployeId ? formEmployeId : formEmployeId;
    if (!empId) return;

    setSaving(true);
    const { error } = await supabase.from("absences").insert({
      employe_id: empId,
      type: formType,
      date_debut: selectedRange.lo,
      date_fin: selectedRange.hi,
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
      .update({ statut: "refuse", note: refuseReason ? refuseReason : undefined })
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

  return (
    <RequireRole allowedRoles={["group_admin", "equipier"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
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
          Conges
        </h1>

        {/* ── KPI Cards ───────────────────────────────────────── */}
        {!loading && etab && (
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
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
                {avgCpRemaining}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4, fontWeight: 500 }}>
                Solde CP moyen
              </div>
            </div>
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
            {/* ── Calendar ────────────────────────────────────── */}
            <div
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

                  // Heat color
                  let heatBg = "transparent";
                  if (absCount >= 3 && cell.isCurrentMonth) heatBg = "rgba(198,40,40,0.07)";
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
                        minHeight: 70,
                        padding: "4px 4px 2px",
                        border: "1px solid #e0d8ce",
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
                          fontSize: 13,
                          fontWeight: isToday ? 700 : 400,
                          color: isEndpoint
                            ? "#fff"
                            : cell.isCurrentMonth
                              ? "#1a1a1a"
                              : "#ccc",
                          marginBottom: 2,
                          position: "relative",
                          display: "inline-block",
                        }}
                      >
                        {isToday && !isEndpoint && (
                          <span
                            style={{
                              position: "absolute",
                              inset: -3,
                              border: "2px solid #1565C0",
                              borderRadius: "50%",
                              width: 24,
                              height: 24,
                              display: "block",
                            }}
                          />
                        )}
                        <span style={{ position: "relative", zIndex: 1, padding: "0 2px" }}>
                          {cell.date.getDate()}
                        </span>
                      </div>

                      {/* Employee dots */}
                      {cell.isCurrentMonth && dayAbsences.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 2,
                            marginTop: 2,
                          }}
                        >
                          {dayAbsences.slice(0, 4).map((a) => {
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
                                  width: 18,
                                  height: 18,
                                  borderRadius: "50%",
                                  background: dotColor,
                                  color: "#fff",
                                  fontSize: 8,
                                  fontWeight: 700,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  lineHeight: 1,
                                }}
                              >
                                {emp ? getInitials(emp.prenom, emp.nom) : "?"}
                              </div>
                            );
                          })}
                          {dayAbsences.length > 4 && (
                            <div
                              style={{
                                fontSize: 9,
                                color: isEndpoint ? "#fff" : "#999",
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                              }}
                            >
                              +{dayAbsences.length - 4}
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
                            ({daysBetween(selectedRange.lo, selectedRange.hi)} jour
                            {daysBetween(selectedRange.lo, selectedRange.hi) > 1 ? "s" : ""})
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
                            — cliquez sur une autre date pour terminer
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
                          {emp ? `${emp.prenom} ${emp.nom}` : "Inconnu"} —{" "}
                          {TYPE_LABELS[c.type] ?? c.type} ({formatDateFR(c.date_debut)}
                          {c.date_debut !== c.date_fin && ` au ${formatDateFR(c.date_fin)}`})
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedRange && (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
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

                      {/* Employee (for managers) */}
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
                        disabled={!formEmployeId || saving}
                        style={{
                          padding: "8px 20px",
                          border: "none",
                          borderRadius: 20,
                          background: !formEmployeId ? "#ccc" : "#D4775A",
                          color: "#fff",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: !formEmployeId ? "default" : "pointer",
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
                <h2
                  style={{
                    fontFamily: "var(--font-oswald), Oswald, sans-serif",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#1a1a1a",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 12,
                  }}
                >
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
                    const days = daysBetween(a.date_debut, a.date_fin);
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
              <h2
                style={{
                  fontFamily: "var(--font-oswald), Oswald, sans-serif",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#1a1a1a",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 12,
                }}
              >
                Absences
              </h2>
              {absences.length === 0 ? (
                <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 20 }}>
                  Aucune absence enregistree
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {absences.slice(0, 30).map((a) => {
                    const emp = getEmpFromAbsence(a) ?? empMap.get(a.employe_id);
                    const empName = emp
                      ? `${emp.prenom} ${emp.nom}`
                      : "Inconnu";
                    const initials = emp ? getInitials(emp.prenom, emp.nom) : "??";
                    const sc = STATUT_COLORS[a.statut] ?? { bg: "#f0ece6", fg: "#999" };
                    const tc = TYPE_BADGE_COLORS[a.type] ?? { bg: "#f0ece6", fg: "#666" };
                    const days = daysBetween(a.date_debut, a.date_fin);

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
                                <span style={{ fontWeight: 600, fontSize: 13 }}>{empName}</span>
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
                  {absences.length > 30 && (
                    <p style={{ color: "#999", fontSize: 12, textAlign: "center", marginTop: 8 }}>
                      {absences.length - 30} absences supplementaires non affichees
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </RequireRole>
  );
}

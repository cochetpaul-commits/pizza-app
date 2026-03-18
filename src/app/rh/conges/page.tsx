"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

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
  employe?: Employe;
};

type StatusFilter = "tous" | "en_attente" | "valide" | "refuse";

/* ── Styles ────────────────────────────────────────────────────── */

const h1Style: React.CSSProperties = {
  fontFamily: "var(--font-oswald), Oswald, sans-serif",
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 1,
  marginBottom: 16,
  color: "#1a1a1a",
};

const TYPE_LABELS: Record<string, string> = {
  conge_paye: "Conge paye",
  rtt: "RTT",
  maladie: "Maladie",
  sans_solde: "Sans solde",
  conge_special: "Conge special",
  absence_injustifiee: "Absence injustifiee",
};

const TYPE_OPTIONS = [
  { value: "conge_paye", label: "Conge paye" },
  { value: "rtt", label: "RTT" },
  { value: "maladie", label: "Maladie" },
  { value: "sans_solde", label: "Sans solde" },
  { value: "conge_special", label: "Conge special" },
  { value: "absence_injustifiee", label: "Absence injustifiee" },
];

const TYPE_BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  conge_paye: { bg: "#E3F2FD", fg: "#1565C0" },
  rtt: { bg: "#F3E5F5", fg: "#7B1FA2" },
  maladie: { bg: "#FFF3E0", fg: "#E65100" },
  sans_solde: { bg: "#f0ece6", fg: "#666" },
  conge_special: { bg: "#E8F5E9", fg: "#2E7D32" },
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

/* ── Helpers ───────────────────────────────────────────────────── */

function formatDateFR(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function getMonthKey(iso: string): string {
  return iso.substring(0, 7); // "2026-03"
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[parseInt(month, 10) - 1]} ${year}`;
}

function getInitials(prenom: string, nom: string): string {
  return (prenom.charAt(0) + nom.charAt(0)).toUpperCase();
}

/* ── Component ─────────────────────────────────────────────────── */

export default function CongesPage() {
  const { current: etab } = useEtablissement();
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("tous");
  const [showModal, setShowModal] = useState(false);

  // Modal state
  const [modalEmployeId, setModalEmployeId] = useState("");
  const [modalType, setModalType] = useState("conge_paye");
  const [modalDebut, setModalDebut] = useState(todayISO());
  const [modalFin, setModalFin] = useState(todayISO());
  const [modalMotif, setModalMotif] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
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
        .select("id, employe_id, type, date_debut, date_fin, statut, note, created_at")
        .order("date_debut", { ascending: false })
        .limit(200),
    ]);

    const emps: Employe[] = empRes.data ?? [];
    setEmployes(emps);

    const empMap = new Map<string, Employe>();
    for (const e of emps) empMap.set(e.id, e);

    const empIds = new Set(emps.map((e) => e.id));
    const filtered = (absRes.data ?? [])
      .filter((a: Absence) => empIds.has(a.employe_id))
      .map((a: Absence) => ({ ...a, employe: empMap.get(a.employe_id) }));

    setAbsences(filtered);
    setLoading(false);
  };

  useEffect(() => {
    if (!etab) return;
    let cancelled = false;

    (async () => {
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
          .select("id, employe_id, type, date_debut, date_fin, statut, note, created_at")
          .order("date_debut", { ascending: false })
          .limit(200),
      ]);

      if (cancelled) return;

      const emps: Employe[] = empRes.data ?? [];
      setEmployes(emps);

      const empMap = new Map<string, Employe>();
      for (const e of emps) empMap.set(e.id, e);

      const empIds = new Set(emps.map((e) => e.id));
      const filtered = (absRes.data ?? [])
        .filter((a: Absence) => empIds.has(a.employe_id))
        .map((a: Absence) => ({ ...a, employe: empMap.get(a.employe_id) }));

      setAbsences(filtered);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [etab]);

  const handleCreate = async () => {
    if (!modalEmployeId || !modalDebut || !modalFin) return;
    setSaving(true);

    const { error } = await supabase.from("absences").insert({
      employe_id: modalEmployeId,
      type: modalType,
      date_debut: modalDebut,
      date_fin: modalFin,
      statut: "en_attente",
      note: modalMotif || null,
    });

    setSaving(false);
    if (!error) {
      setShowModal(false);
      setModalEmployeId("");
      setModalType("conge_paye");
      setModalDebut(todayISO());
      setModalFin(todayISO());
      setModalMotif("");
      loadData();
    } else {
      alert("Erreur : " + error.message);
    }
  };

  const handleStatusChange = async (id: string, newStatus: "valide" | "refuse") => {
    const { error } = await supabase
      .from("absences")
      .update({ statut: newStatus })
      .eq("id", id);
    if (!error) {
      loadData();
    } else {
      alert("Erreur : " + error.message);
    }
  };

  const filtered = absences.filter((a) => {
    if (filter === "tous") return true;
    return a.statut === filter;
  });

  // ── Computed counters ──────────────────────────────────────────
  const now = new Date();
  const currentMonth = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

  const pendingCount = absences.filter((a) => a.statut === "en_attente").length;

  const daysThisMonth = useMemo(() => {
    return absences
      .filter((a) => {
        if (a.statut === "refuse") return false;
        const mk = getMonthKey(a.date_debut);
        return mk === currentMonth;
      })
      .reduce((sum, a) => sum + daysBetween(a.date_debut, a.date_fin), 0);
  }, [absences, currentMonth]);

  // CP balances per employee (25 days/year default minus validated conge_paye)
  const cpBalances = useMemo(() => {
    const balances: { empId: string; name: string; cpUsed: number; cpRemaining: number; rc: number }[] = [];
    for (const emp of employes) {
      const cpUsed = absences
        .filter((a) => a.employe_id === emp.id && a.type === "conge_paye" && a.statut === "valide")
        .reduce((sum, a) => sum + daysBetween(a.date_debut, a.date_fin), 0);
      balances.push({
        empId: emp.id,
        name: `${emp.prenom} ${emp.nom}`,
        cpUsed,
        cpRemaining: 25 - cpUsed,
        rc: 0, // placeholder
      });
    }
    return balances;
  }, [employes, absences]);

  const avgCpRemaining = cpBalances.length > 0
    ? Math.round((cpBalances.reduce((s, b) => s + b.cpRemaining, 0) / cpBalances.length) * 10) / 10
    : 0;

  // ── Group filtered absences by month ───────────────────────────
  const groupedByMonth = useMemo(() => {
    const groups: { key: string; label: string; items: Absence[] }[] = [];
    const map = new Map<string, Absence[]>();
    for (const a of filtered) {
      const mk = getMonthKey(a.date_debut);
      if (!map.has(mk)) map.set(mk, []);
      map.get(mk)!.push(a);
    }
    const sortedKeys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    for (const k of sortedKeys) {
      groups.push({ key: k, label: getMonthLabel(k), items: map.get(k)! });
    }
    return groups;
  }, [filtered]);

  const filterPills: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "tous", label: "Tous" },
    { value: "en_attente", label: "En attente", count: absences.filter((a) => a.statut === "en_attente").length },
    { value: "valide", label: "Valides" },
    { value: "refuse", label: "Refuses" },
  ];

  const kpiCardStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 140,
    background: "#fff",
    border: "1px solid #ddd6c8",
    borderRadius: 12,
    padding: "16px 18px",
    textAlign: "center",
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ ...h1Style, marginBottom: 0 }}>Conges et absences</h1>
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: "#e27f57",
              color: "#fff",
              border: "none",
              borderRadius: 20,
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Nouvelle demande
          </button>
        </div>

        {/* ── KPI cards ──────────────────────────────────────────── */}
        {!loading && etab && (
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={kpiCardStyle}>
              <div style={{ fontSize: 28, fontWeight: 700, color: pendingCount > 0 ? "#E65100" : "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>
                {pendingCount}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4, fontWeight: 500 }}>
                Demandes en attente
              </div>
            </div>
            <div style={kpiCardStyle}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>
                {daysThisMonth}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4, fontWeight: 500 }}>
                Jours poses ce mois
              </div>
            </div>
            <div style={kpiCardStyle}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>
                {avgCpRemaining}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4, fontWeight: 500 }}>
                CP restants (moy.)
              </div>
            </div>
          </div>
        )}

        {/* ── Per-employee CP balances (collapsible) ───────────── */}
        {!loading && etab && cpBalances.length > 0 && (
          <details style={{ marginBottom: 20 }}>
            <summary
              style={{
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                color: "#1a1a1a",
                padding: "8px 0",
                userSelect: "none",
              }}
            >
              Soldes individuels CP / RC
            </summary>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 8,
                marginTop: 8,
              }}
            >
              {cpBalances.map((b) => (
                <div
                  key={b.empId}
                  style={{
                    background: "#f6eedf",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4, color: "#1a1a1a" }}>{b.name}</div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ color: b.cpRemaining < 5 ? "#c62828" : "#4a6741", fontWeight: 600 }}>
                      CP: {b.cpRemaining}j
                    </span>
                    <span style={{ color: "#999" }}>RC: {b.rc}j</span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {filterPills.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: filter === f.value ? "2px solid #e27f57" : "1px solid #ddd6c8",
                background: filter === f.value ? "rgba(226,127,87,0.08)" : "#fff",
                color: filter === f.value ? "#e27f57" : "#1a1a1a",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {f.label}
              {f.count != null && f.count > 0 && (
                <span
                  style={{
                    display: "inline-block",
                    marginLeft: 6,
                    background: "#E65100",
                    color: "#fff",
                    borderRadius: 10,
                    padding: "1px 7px",
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: "16px",
                  }}
                >
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>Chargement...</p>
        ) : !etab ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>
            Selectionnez un etablissement
          </p>
        ) : filtered.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>Aucune absence trouvee</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {groupedByMonth.map((group) => (
              <div key={group.key} style={{ marginBottom: 20 }}>
                {/* Month section header */}
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: "var(--font-oswald), Oswald, sans-serif",
                    letterSpacing: 0.5,
                    color: "#999",
                    textTransform: "uppercase",
                    marginBottom: 10,
                    paddingBottom: 6,
                    borderBottom: "1px solid #ddd6c8",
                  }}
                >
                  {group.label}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {group.items.map((a) => {
                    const sc = STATUT_COLORS[a.statut] ?? { bg: "#f0ece6", fg: "#999" };
                    const tc = TYPE_BADGE_COLORS[a.type] ?? { bg: "#f0ece6", fg: "#666" };
                    const days = daysBetween(a.date_debut, a.date_fin);
                    const initials = a.employe ? getInitials(a.employe.prenom, a.employe.nom) : "??";
                    return (
                      <div
                        key={a.id}
                        style={{
                          border: "1px solid #ddd6c8",
                          borderRadius: 12,
                          padding: "14px 18px",
                          background: "#fff",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f0e8")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ display: "flex", gap: 12, flex: 1, alignItems: "flex-start" }}>
                            {/* Avatar initials */}
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
                                color: "#e27f57",
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                                {a.employe ? `${a.employe.prenom} ${a.employe.nom}` : "Employe inconnu"}
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                                {/* Type badge */}
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
                                <div style={{ fontSize: 12, color: "#999", fontStyle: "italic" }}>{a.note}</div>
                              )}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "3px 10px",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 600,
                                background: sc.bg,
                                color: sc.fg,
                              }}
                            >
                              {STATUT_LABELS[a.statut] ?? a.statut}
                            </span>
                            {a.statut === "en_attente" && (
                              <div style={{ display: "flex", gap: 4 }}>
                                <button
                                  onClick={() => handleStatusChange(a.id, "valide")}
                                  title="Valider"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    border: "1px solid #4a6741",
                                    background: "#e8ede6",
                                    color: "#4a6741",
                                    fontSize: 14,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  &#10003;
                                </button>
                                <button
                                  onClick={() => handleStatusChange(a.id, "refuse")}
                                  title="Refuser"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    border: "1px solid #c62828",
                                    background: "#fce4e4",
                                    color: "#c62828",
                                    fontSize: 14,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  &#10005;
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 1000,
            }}
            onClick={() => setShowModal(false)}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 28,
                width: "90%",
                maxWidth: 420,
                boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                style={{
                  fontFamily: "var(--font-oswald), Oswald, sans-serif",
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 20,
                  color: "#1a1a1a",
                }}
              >
                Nouvelle demande d&apos;absence
              </h2>

              <label style={{ display: "block", marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>
                  Employe
                </span>
                <select
                  value={modalEmployeId}
                  onChange={(e) => setModalEmployeId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid #ddd6c8",
                    borderRadius: 8,
                    fontSize: 14,
                    background: "#fff",
                  }}
                >
                  <option value="">Choisir...</option>
                  {employes.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.prenom} {e.nom}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "block", marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>
                  Type
                </span>
                <select
                  value={modalType}
                  onChange={(e) => setModalType(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid #ddd6c8",
                    borderRadius: 8,
                    fontSize: 14,
                    background: "#fff",
                  }}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                <label style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>
                    Date debut
                  </span>
                  <input
                    type="date"
                    value={modalDebut}
                    onChange={(e) => setModalDebut(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid #ddd6c8",
                      borderRadius: 8,
                      fontSize: 14,
                    }}
                  />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>
                    Date fin
                  </span>
                  <input
                    type="date"
                    value={modalFin}
                    onChange={(e) => setModalFin(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid #ddd6c8",
                      borderRadius: 8,
                      fontSize: 14,
                    }}
                  />
                </label>
              </div>

              <label style={{ display: "block", marginBottom: 20 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>
                  Motif (optionnel)
                </span>
                <textarea
                  value={modalMotif}
                  onChange={(e) => setModalMotif(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid #ddd6c8",
                    borderRadius: 8,
                    fontSize: 14,
                    resize: "vertical",
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowModal(false)}
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
                  onClick={handleCreate}
                  disabled={!modalEmployeId || !modalDebut || !modalFin || saving}
                  style={{
                    padding: "8px 18px",
                    border: "none",
                    borderRadius: 20,
                    background: !modalEmployeId || !modalDebut || !modalFin ? "#ccc" : "#e27f57",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: !modalEmployeId || !modalDebut || !modalFin ? "default" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Enregistrement..." : "Creer la demande"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RequireRole>
  );
}

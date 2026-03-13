"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import {
  calculerBilanMensuel,
  genererExportSilae,
  exportSilaeToCSV,
  type ShiftInput,
  type ContratInput,
  type BilanMensuel,
  type Alerte,
} from "@/hooks/useConventionLegale";

/* ── Types ─────────────────────────────────────────────────────── */

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  initiales: string | null;
  matricule: string | null;
  actif: boolean;
  contrats: {
    type: string;
    heures_semaine: number;
    actif: boolean;
  }[];
};

type Absence = {
  employe_id: string;
  type: string;
  code_silae: string | null;
  date_debut: string;
  date_fin: string;
  nb_jours: number | null;
};

type EmpBilan = {
  emp: Employe;
  bilan: BilanMensuel;
  contrat: { type: string; heures_semaine: number };
};

/* ── Helpers ───────────────────────────────────────────────────── */

const MONTHS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

function firstOfMonth(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

function lastOfMonth(y: number, m: number): string {
  const d = new Date(y, m + 1, 0);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function downloadCSV(csv: string, filename: string) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Component ─────────────────────────────────────────────────── */

export default function RapportsPage() {
  const { current: etab } = useEtablissement();
  const { canWrite } = useProfile();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  const [empBilans, setEmpBilans] = useState<EmpBilan[]>([]);
  const [allAlertes, setAllAlertes] = useState<Alerte[]>([]);
  const [absencesByEmp, setAbsencesByEmp] = useState<Map<string, Absence[]>>(new Map());
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);

  const dateDebut = firstOfMonth(year, month);
  const dateFin = lastOfMonth(year, month);

  /* ── Load data ── */
  useEffect(() => {
    if (!etab) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      const [empRes, shiftsRes, absRes] = await Promise.all([
        supabase
          .from("employes")
          .select("id, prenom, nom, initiales, matricule, actif, contrats(type, heures_semaine, actif)")
          .eq("etablissement_id", etab.id)
          .eq("actif", true)
          .order("nom"),
        supabase
          .from("shifts")
          .select("employe_id, date, heure_debut, heure_fin, pause_minutes")
          .eq("etablissement_id", etab.id)
          .gte("date", dateDebut)
          .lte("date", dateFin),
        supabase
          .from("absences")
          .select("employe_id, type, code_silae, date_debut, date_fin, nb_jours")
          .eq("etablissement_id", etab.id)
          .gte("date_debut", dateDebut)
          .lte("date_fin", dateFin),
      ]);

      if (cancelled) return;

      const employes = (empRes.data ?? []) as Employe[];
      const shifts = (shiftsRes.data ?? []) as (ShiftInput & { employe_id: string })[];
      const absences = (absRes.data ?? []) as Absence[];

      // Group shifts by employe
      const shiftsByEmp = new Map<string, ShiftInput[]>();
      for (const s of shifts) {
        const arr = shiftsByEmp.get(s.employe_id) ?? [];
        arr.push(s);
        shiftsByEmp.set(s.employe_id, arr);
      }

      // Group absences by employe
      const absByEmp = new Map<string, Absence[]>();
      for (const a of absences) {
        const arr = absByEmp.get(a.employe_id) ?? [];
        arr.push(a);
        absByEmp.set(a.employe_id, arr);
      }
      setAbsencesByEmp(absByEmp);

      // Calculate bilans
      const bilans: EmpBilan[] = [];
      const alerts: Alerte[] = [];

      for (const emp of employes) {
        const contrat = emp.contrats?.find((c) => c.actif);
        if (!contrat) continue;

        const empShifts = shiftsByEmp.get(emp.id) ?? [];
        if (empShifts.length === 0) continue;

        const ci: ContratInput = {
          type: contrat.type,
          heures_semaine: contrat.heures_semaine,
          convention: "HCR_1979",
        };

        const bilan = calculerBilanMensuel(empShifts, ci, emp.id);
        bilans.push({ emp, bilan, contrat });
        alerts.push(...bilan.alertes);
      }

      setEmpBilans(bilans);
      setAllAlertes(alerts);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [etab, dateDebut, dateFin]);

  /* ── Totals ── */
  const totals = useMemo(() => {
    let h = 0, s25 = 0, s50 = 0, s10 = 0, s20 = 0, repas = 0, jours = 0;
    for (const { bilan } of empBilans) {
      h += bilan.heures_travaillees;
      s25 += bilan.heures_supp_25;
      s50 += bilan.heures_supp_50;
      s10 += bilan.heures_supp_10;
      s20 += bilan.heures_supp_20;
      repas += bilan.nb_repas;
      jours += bilan.jours_travailles;
    }
    return { h, s25, s50, s10, s20, repas, jours };
  }, [empBilans]);

  /* ── Export SILAE ── */
  const handleExportSilae = () => {
    const allRows = empBilans.flatMap(({ emp, bilan, contrat }) => {
      const mat = emp.matricule ?? emp.id.slice(0, 5);
      const abs = (absencesByEmp.get(emp.id) ?? []).map((a) => ({
        type: a.type,
        code_silae: a.code_silae ?? undefined,
        date_debut: a.date_debut,
        date_fin: a.date_fin,
        nb_jours: a.nb_jours ?? 0,
      }));
      return genererExportSilae(bilan, mat, contrat.type, dateDebut, dateFin, abs);
    });

    const csv = exportSilaeToCSV(allRows);
    downloadCSV(csv, `silae-${year}-${String(month + 1).padStart(2, "0")}.csv`);
  };

  /* ── Export recap CSV ── */
  const handleExportRecap = () => {
    const header = "Employe;Heures;H.Normales;HS25;HS50;HS10;HS20;Repas;Jours;Delta";
    const lines = empBilans.map(({ emp, bilan }) =>
      `${emp.prenom} ${emp.nom};${bilan.heures_travaillees};${bilan.heures_normales};${bilan.heures_supp_25};${bilan.heures_supp_50};${bilan.heures_supp_10};${bilan.heures_supp_20};${bilan.nb_repas};${bilan.jours_travailles};${bilan.delta_contrat}`
    );
    downloadCSV([header, ...lines].join("\n"), `recap-heures-${year}-${String(month + 1).padStart(2, "0")}.csv`);
  };

  /* ── Month navigation ── */
  const goMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m);
    setYear(y);
  };

  return (
    <RequireRole allowedRoles={["admin", "direction"]}>
      <NavBar
        backHref="/rh/equipe"
        backLabel="Equipe"
        menuItems={canWrite ? [
          { label: "Export SILAE", onClick: handleExportSilae },
          { label: "Export recap CSV", onClick: handleExportRecap },
        ] : undefined}
      />

      <div style={pageStyle}>
        {/* ── Month navigation ── */}
        <div style={monthNav}>
          <button type="button" onClick={() => goMonth(-1)} style={navArrow}>←</button>
          <span style={monthLabel}>{MONTHS[month]} {year}</span>
          <button type="button" onClick={() => goMonth(1)} style={navArrow}>→</button>
        </div>

        {/* ── Summary cards ── */}
        <div style={summaryRow}>
          <SummaryCard label="Heures" value={`${totals.h.toFixed(1)}h`} />
          <SummaryCard label="Jours" value={String(totals.jours)} />
          <SummaryCard label="Repas" value={String(totals.repas)} />
          <SummaryCard label="Alertes" value={String(allAlertes.length)} color={allAlertes.length > 0 ? "#DC2626" : undefined} />
        </div>

        {/* ── Overtime summary ── */}
        {(totals.s25 > 0 || totals.s50 > 0 || totals.s10 > 0 || totals.s20 > 0) && (
          <div style={otRow}>
            {totals.s25 > 0 && <span style={otPill}>HS 25% : {totals.s25.toFixed(1)}h</span>}
            {totals.s50 > 0 && <span style={otPill}>HS 50% : {totals.s50.toFixed(1)}h</span>}
            {totals.s10 > 0 && <span style={otPill}>HS 10% : {totals.s10.toFixed(1)}h</span>}
            {totals.s20 > 0 && <span style={otPill}>HS 20% : {totals.s20.toFixed(1)}h</span>}
          </div>
        )}

        {/* ── Employee bilans ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>
        ) : empBilans.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Aucun shift ce mois</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {empBilans.map(({ emp, bilan, contrat }) => {
              const expanded = expandedEmp === emp.id;
              const hasAlerts = bilan.alertes.length > 0;
              const initials = emp.initiales || ((emp.prenom?.[0] ?? "") + (emp.nom?.[0] ?? "")).toUpperCase();

              return (
                <div key={emp.id} style={empCard}>
                  {/* Header row */}
                  <div
                    style={empHeader}
                    onClick={() => setExpandedEmp(expanded ? null : emp.id)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={avatar}>{initials}</div>
                      <div>
                        <div style={empNameStyle}>{emp.prenom} {emp.nom}</div>
                        <div style={{ fontSize: 11, color: "#999" }}>
                          {contrat.type} · {contrat.heures_semaine}h/sem
                          {emp.matricule && ` · #${emp.matricule}`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>
                          {bilan.heures_travaillees.toFixed(1)}h
                        </div>
                        {bilan.delta_contrat !== 0 && (
                          <div style={{
                            fontSize: 11, fontWeight: 600,
                            color: bilan.delta_contrat > 0 ? "#D4775A" : "#2563eb",
                          }}>
                            {bilan.delta_contrat > 0 ? "+" : ""}{bilan.delta_contrat.toFixed(1)}h
                          </div>
                        )}
                      </div>
                      {hasAlerts && <span style={alertBadge}>{bilan.alertes.length}</span>}
                      <span style={{ fontSize: 14, color: "#999", transform: expanded ? "rotate(180deg)" : "none", transition: "0.2s" }}>
                        ▼
                      </span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div style={detailSection}>
                      {/* Hours breakdown */}
                      <div style={detailGrid}>
                        <DetailItem label="H. normales" value={`${bilan.heures_normales.toFixed(1)}h`} />
                        <DetailItem label="Jours" value={String(bilan.jours_travailles)} />
                        <DetailItem label="Repas" value={String(bilan.nb_repas)} />
                        {bilan.heures_supp_25 > 0 && <DetailItem label="HS 25%" value={`${bilan.heures_supp_25.toFixed(1)}h`} color="#D4775A" />}
                        {bilan.heures_supp_50 > 0 && <DetailItem label="HS 50%" value={`${bilan.heures_supp_50.toFixed(1)}h`} color="#DC2626" />}
                        {bilan.heures_supp_10 > 0 && <DetailItem label="HS 10%" value={`${bilan.heures_supp_10.toFixed(1)}h`} color="#D4775A" />}
                        {bilan.heures_supp_20 > 0 && <DetailItem label="HS 20%" value={`${bilan.heures_supp_20.toFixed(1)}h`} color="#D4775A" />}
                        {bilan.heures_comp_10 > 0 && <DetailItem label="HC 10%" value={`${bilan.heures_comp_10.toFixed(1)}h`} color="#2563eb" />}
                        {bilan.heures_comp_25 > 0 && <DetailItem label="HC 25%" value={`${bilan.heures_comp_25.toFixed(1)}h`} color="#2563eb" />}
                        {bilan.rc_acquis > 0 && <DetailItem label="RC acquis" value={`${bilan.rc_acquis.toFixed(1)}h`} color="#4a6741" />}
                      </div>

                      {/* Week-by-week breakdown */}
                      {bilan.bilans_semaines.length > 1 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={miniHeader}>Semaines</div>
                          {bilan.bilans_semaines.map((bs, i) => (
                            <div key={i} style={weekRow}>
                              <span style={{ fontSize: 12, color: "#999" }}>S{i + 1}</span>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{bs.heures_travaillees.toFixed(1)}h</span>
                              {bs.delta_contrat !== 0 && (
                                <span style={{ fontSize: 11, color: bs.delta_contrat > 0 ? "#D4775A" : "#2563eb" }}>
                                  {bs.delta_contrat > 0 ? "+" : ""}{bs.delta_contrat.toFixed(1)}
                                </span>
                              )}
                              {bs.alertes.length > 0 && <span style={{ fontSize: 11, color: "#DC2626" }}>⚠ {bs.alertes.length}</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Alerts */}
                      {hasAlerts && (
                        <div style={{ marginTop: 10 }}>
                          <div style={miniHeader}>Alertes</div>
                          {bilan.alertes.map((a, i) => (
                            <div key={i} style={alertRow}>
                              <span style={{ fontSize: 11, color: "#DC2626", fontWeight: 700 }}>⚠</span>
                              <span style={{ fontSize: 12, color: "#6f6a61" }}>{a.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </RequireRole>
  );
}

/* ── Sub-components ── */

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={summaryCard}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{value}</div>
    </div>
  );
}

function DetailItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color ?? "#1a1a1a" }}>{value}</div>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────── */

const pageStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "16px 16px 60px",
};

const monthNav: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  justifyContent: "center",
  marginBottom: 16,
};

const navArrow: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: "1px solid #ddd6c8", background: "#fff",
  fontSize: 16, fontWeight: 700, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#1a1a1a",
};

const monthLabel: React.CSSProperties = {
  fontSize: 18, fontWeight: 700, color: "#1a1a1a",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  minWidth: 180, textAlign: "center",
};

const summaryRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 8,
  marginBottom: 12,
};

const summaryCard: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd6c8",
  borderRadius: 12,
  padding: "10px 14px",
  textAlign: "center",
};

const otRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 14,
  justifyContent: "center",
};

const otPill: React.CSSProperties = {
  padding: "4px 12px",
  borderRadius: 20,
  background: "rgba(212,119,90,0.10)",
  color: "#D4775A",
  fontSize: 12,
  fontWeight: 700,
  border: "1px solid rgba(212,119,90,0.25)",
};

const empCard: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd6c8",
  borderRadius: 12,
  overflow: "hidden",
};

const empHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 14px",
  cursor: "pointer",
};

const avatar: React.CSSProperties = {
  width: 32, height: 32, borderRadius: "50%",
  background: "#D4775A", color: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 12, fontWeight: 700, flexShrink: 0,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const empNameStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: "#1a1a1a",
};

const alertBadge: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minWidth: 20, height: 20, borderRadius: 10,
  background: "rgba(220,38,38,0.12)", color: "#DC2626",
  fontSize: 11, fontWeight: 800, padding: "0 5px",
};

const detailSection: React.CSSProperties = {
  padding: "0 14px 14px",
  borderTop: "1px solid #f0ebe3",
};

const detailGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
  gap: "8px 12px",
  marginTop: 10,
};

const miniHeader: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#999",
  textTransform: "uppercase", letterSpacing: 0.5,
  marginBottom: 4,
};

const weekRow: React.CSSProperties = {
  display: "flex", gap: 10, alignItems: "center",
  padding: "3px 0", borderBottom: "1px solid #f5f0e8",
};

const alertRow: React.CSSProperties = {
  display: "flex", gap: 6, alignItems: "center",
  padding: "4px 0",
};

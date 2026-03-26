"use client";

import { useEffect, useState, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

/* ── Types ─────────────────────────────────────────────────────── */

type Contrat = {
  id: string;
  employe_id: string;
  type: string;
  heures_semaine: number;
  salaire_brut: number | null;
  remuneration: number | null;
  taux_horaire: number | null;
  actif: boolean;
};

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  matricule: string | null;
  actif: boolean;
  contrats: Contrat[];
};

type EmpCost = {
  emp: Employe;
  contratType: string;
  heuresSemaine: number;
  brut: number;
  net: number;
  chargesPatronales: number;
  fillon: number;
  coutEmployeur: number;
  tauxReel: number;
  coutHoraire: number;
  isTNS: boolean;
};

type SimRow = {
  id: string;
  nom: string;
  type: string;
  remplace: string;
  brut: number;
  heures: number;
};

type Tab = "reel" | "tns" | "simulateur";

/* ── Constants ─────────────────────────────────────────────────── */

const SMIC_MENSUEL = 1802;
const SMIC_HORAIRE = 11.88;
const TAUX_CHARGES_PATRONALES = 0.45;
const TAUX_CHARGES_SALARIALES = 0.22;
const TAUX_FILLON_MAX = 0.32;
const TAUX_CHARGES_TNS = 0.465;
const OBJECTIF_MS_CA = 37;

const TNS_DETAIL = [
  { label: "Maladie / IJ", taux: 6.50, color: "#8B7EC8" },
  { label: "Indemnites journalieres", taux: 0.90, color: "#8B7EC8" },
  { label: "Retraite de base", taux: 17.75, color: "#7C8EC8" },
  { label: "Retraite complementaire", taux: 7.0, color: "#7C8EC8" },
  { label: "Invalidite / Deces", taux: 1.30, color: "#9BA3B5" },
  { label: "Allocations familiales", taux: 3.10, color: "#9BA3B5" },
  { label: "CSG / CRDS", taux: 9.70, color: "#C49A6C" },
  { label: "Formation professionnelle", taux: 0.25, color: "#9BA3B5" },
];

const TNS_TOTAL_TAUX = TNS_DETAIL.reduce((a, d) => a + d.taux, 0);

/* ── Avatar colors ─────────────────────────────────────────────── */
const AVATAR_COLORS = [
  "#D4775A", "#4a6741", "#7C8EC8", "#C49A6C", "#8B7EC8",
  "#5B9BD5", "#A0845C", "#DC7F9B", "#6BA68A", "#B8860B",
];
function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

/* ── Helpers ───────────────────────────────────────────────────── */

function calcFillon(brut: number, heuresMois: number): number {
  const smicMois = SMIC_HORAIRE * heuresMois;
  if (brut > smicMois * 1.6) return 0;
  const ratio = smicMois / brut;
  const coeff = Math.min(TAUX_FILLON_MAX, TAUX_FILLON_MAX / 0.6 * (1.6 * ratio - 1));
  return Math.max(0, coeff * brut);
}

function calcCostLine(emp: Employe): EmpCost {
  const contrat = emp.contrats?.find((c) => c.actif);
  const isTNS = contrat?.type === "TNS";
  const heures = contrat?.heures_semaine ?? 0;
  const brut = contrat?.salaire_brut ?? contrat?.remuneration ?? 0;
  const heuresMois = heures * 52 / 12;

  if (isTNS) {
    return {
      emp, contratType: "TNS", heuresSemaine: heures,
      brut, net: brut, chargesPatronales: brut * TAUX_CHARGES_TNS, fillon: 0,
      coutEmployeur: brut * (1 + TAUX_CHARGES_TNS),
      tauxReel: TAUX_CHARGES_TNS * 100,
      coutHoraire: heuresMois > 0 ? (brut * (1 + TAUX_CHARGES_TNS)) / heuresMois : 0,
      isTNS: true,
    };
  }

  const net = brut * (1 - TAUX_CHARGES_SALARIALES);
  const chargesPatronales = brut * TAUX_CHARGES_PATRONALES;
  const fillon = calcFillon(brut, heuresMois);
  const coutEmployeur = brut + chargesPatronales - fillon;
  const tauxReel = brut > 0 ? (chargesPatronales - fillon) / brut * 100 : 0;
  const coutHoraire = heuresMois > 0 ? coutEmployeur / heuresMois : 0;

  return {
    emp, contratType: contrat?.type ?? "CDI", heuresSemaine: heures,
    brut, net, chargesPatronales, fillon, coutEmployeur, tauxReel, coutHoraire, isTNS: false,
  };
}

function calcSimCost(brut: number, heures: number, type: string) {
  const heuresMois = heures * 52 / 12;
  const charges = brut * TAUX_CHARGES_PATRONALES;
  const fillon = calcFillon(brut, heuresMois);
  const coutCDI = brut + charges - fillon;
  const coutCDD = coutCDI * 1.10; // +10% precarite
  const extraHoraire = heuresMois > 0 ? coutCDI / heuresMois : 0;
  const coutApprenti = brut * 0.80 + (brut * 0.80) * 0.15; // aide ~85% charges reduites
  const eurH = heuresMois > 0 ? coutCDI / heuresMois : 0;

  const selected = type === "CDD" ? coutCDD : type === "extra" ? coutCDI : type === "apprenti" ? coutApprenti : coutCDI;

  return { coutCDI, coutCDD, extraHoraire, coutApprenti, selected, eurH, charges, fillon };
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("fr-FR");
}

function fmtDec(n: number, d = 2): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/* ── Component ─────────────────────────────────────────────────── */

export default function SimulationPage() {
  const { current: etab } = useEtablissement();
  const accent = etab?.couleur ?? "#D4775A";

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("reel");
  const [caSimule, setCaSimule] = useState(85000);
  const [simRows, setSimRows] = useState<SimRow[]>([]);
  const [selectedTns, setSelectedTns] = useState<string | null>(null);
  // Salary overrides for simulation (empId → new brut/net amount)
  const [salaryOverrides, setSalaryOverrides] = useState<Record<string, number>>({});

  /* ── Load ── */
  useEffect(() => {
    if (!etab) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const empRes = await supabase
        .from("employes").select("*")
        .eq("etablissement_id", etab.id).eq("actif", true).order("nom");
      if (cancelled) return;

      const empIds = (empRes.data ?? []).map((e: Record<string, unknown>) => e.id as string);
      const contratRes = empIds.length > 0
        ? await supabase.from("contrats").select("*").eq("actif", true).in("employe_id", empIds)
        : { data: [] };
      if (cancelled) return;

      const contrats = (contratRes.data ?? []) as Contrat[];
      const emps = (empRes.data ?? []).map((e: Record<string, unknown>) => ({
        ...e,
        contrats: contrats.filter((c) => c.employe_id === e.id),
      })) as Employe[];
      setEmployes(emps);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [etab]);

  /* ── Costs (base from contracts) ── */
  const baseCosts = useMemo(() => {
    return employes.filter((e) => e.contrats?.some((c) => c.actif)).map((e) => calcCostLine(e));
  }, [employes]);

  /* ── Costs (with salary overrides applied) ── */
  const costs = useMemo(() => {
    return baseCosts.map((c) => {
      const override = salaryOverrides[c.emp.id];
      if (override === undefined || override === c.brut) return c;
      // Recalculate with overridden salary
      const heuresMois = c.heuresSemaine * 52 / 12;
      if (c.isTNS) {
        const chargesP = override * TAUX_CHARGES_TNS;
        return {
          ...c, brut: override, net: override,
          chargesPatronales: chargesP,
          coutEmployeur: override + chargesP,
          coutHoraire: heuresMois > 0 ? (override + chargesP) / heuresMois : 0,
        };
      }
      const chargesP = override * TAUX_CHARGES_PATRONALES;
      const fillon = calcFillon(override, heuresMois);
      const coutEmp = override + chargesP - fillon;
      return {
        ...c, brut: override,
        net: override * (1 - TAUX_CHARGES_SALARIALES),
        chargesPatronales: chargesP,
        fillon,
        coutEmployeur: coutEmp,
        tauxReel: override > 0 ? (chargesP - fillon) / override * 100 : 0,
        coutHoraire: heuresMois > 0 ? coutEmp / heuresMois : 0,
      };
    });
  }, [baseCosts, salaryOverrides]);

  const salaries = costs.filter((c) => !c.isTNS);
  const tnsEmployes = costs.filter((c) => c.isTNS);

  const totalBrut = salaries.reduce((acc, c) => acc + c.brut, 0);
  const totalChargesPatronales = salaries.reduce((acc, c) => acc + c.chargesPatronales, 0);
  const totalFillon = salaries.reduce((acc, c) => acc + c.fillon, 0);
  const totalMSSalaries = salaries.reduce((acc, c) => acc + c.coutEmployeur, 0);
  const totalTNS = tnsEmployes.reduce((acc, c) => acc + c.coutEmployeur, 0);
  const totalMS = totalMSSalaries + totalTNS;
  const totalCharges = totalChargesPatronales - totalFillon + tnsEmployes.reduce((acc, c) => acc + c.chargesPatronales, 0);
  const tauxMoyen = totalBrut > 0 ? (totalCharges / (totalBrut + tnsEmployes.reduce((a, c) => a + c.brut, 0))) * 100 : 0;
  const ratioMS = caSimule > 0 ? (totalMS / caSimule) * 100 : 0;
  const caNeeded = totalMS / (OBJECTIF_MS_CA / 100);

  // Base MS (without overrides) for comparison
  const baseTotalMS = useMemo(() => baseCosts.reduce((acc, c) => acc + c.coutEmployeur, 0), [baseCosts]);
  const hasOverrides = Object.keys(salaryOverrides).length > 0;

  const setSalaryOverride = (empId: string, value: number) => {
    setSalaryOverrides((prev) => ({ ...prev, [empId]: value }));
  };
  const resetOverride = (empId: string) => {
    setSalaryOverrides((prev) => {
      const next = { ...prev };
      delete next[empId];
      return next;
    });
  };

  // Auto-select first TNS
  useEffect(() => {
    if (tnsEmployes.length > 0 && !selectedTns) setSelectedTns(tnsEmployes[0].emp.id);
  }, [tnsEmployes, selectedTns]);

  /* ── Simulateur ── */
  const simCosts = useMemo(() => {
    return simRows.map((r) => ({
      row: r,
      ...calcSimCost(r.brut, r.heures, r.type),
    }));
  }, [simRows]);

  const simTotalCost = simCosts.reduce((acc, s) => acc + s.selected, 0);

  const replacedCost = useMemo(() => {
    const ids = [...new Set(simRows.map((r) => r.remplace).filter((r) => r !== "nouveau"))];
    return ids.reduce((acc, id) => {
      const c = costs.find((c) => c.emp.id === id);
      return acc + (c ? c.coutEmployeur : 0);
    }, 0);
  }, [simRows, costs]);

  const msProjetee = totalMS - replacedCost + simTotalCost;
  const ratioProjecte = caSimule > 0 ? (msProjetee / caSimule) * 100 : 0;
  const caNeededProjecte = msProjetee / (OBJECTIF_MS_CA / 100);

  const addSimRow = () => {
    setSimRows((prev) => [...prev, {
      id: crypto.randomUUID(),
      nom: `Collaborateur ${prev.length + 1}`,
      type: "CDI",
      remplace: "nouveau",
      brut: 2100,
      heures: 39,
    }]);
  };
  const updateSim = (id: string, patch: Partial<SimRow>) => setSimRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  const removeSim = (id: string) => setSimRows((prev) => prev.filter((r) => r.id !== id));

  if (loading) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <div style={pageStyle}><div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div></div>
      </RequireRole>
    );
  }

  const etabName = etab?.nom?.toUpperCase() ?? "ETABLISSEMENT";

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={pageStyle}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h1 style={{
              margin: 0, fontSize: 22, fontWeight: 700, color: accent,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif", letterSpacing: 1,
            }}>
              {etabName}
            </h1>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a" }}>Charges &amp; Masse Salariale</span>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 24, marginBottom: 20, borderBottom: "1px solid #f0ebe3", paddingBottom: 10 }}>
          {([
            { key: "reel" as Tab, label: "Masse salariale reelle", icon: "\uD83D\uDCCA" },
            { key: "tns" as Tab, label: "Statuts TNS", icon: "\uD83D\uDCCB" },
            { key: "simulateur" as Tab, label: "Simulateur d\u2019embauche", icon: "\uD83C\uDFAF" },
          ]).map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
              background: "none", border: "none", cursor: "pointer", padding: "4px 0",
              fontSize: 14, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? accent : "#999",
              borderBottom: tab === t.key ? `2px solid ${accent}` : "2px solid transparent",
              marginBottom: -11,
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ═══ TAB 1: MASSE SALARIALE REELLE ═══ */}
        {tab === "reel" && (
          <>
            {/* CA slider */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "#6f6a61", fontWeight: 600, whiteSpace: "nowrap" }}>CA HT mensuel simule :</span>
                <input
                  type="range" min={30000} max={200000} step={1000}
                  value={caSimule} onChange={(e) => setCaSimule(Number(e.target.value))}
                  style={{ flex: 1, minWidth: 120, accentColor: accent }}
                />
                <span style={{ fontSize: 22, fontWeight: 700, color: accent, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                  {fmt(caSimule)} &euro;
                </span>
              </div>
            </div>

            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
              <div style={kpiCard}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmt(totalMS)} &euro;</div>
                <div style={kpiLabel}>Masse salariale totale</div>
                <div style={kpiSub}>cout employeur mensuel</div>
              </div>
              <div style={kpiCard}>
                <div style={{ fontSize: 24, fontWeight: 700, color: accent, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmt(totalCharges)} &euro;</div>
                <div style={kpiLabel}>Charges totales</div>
                <div style={kpiSub}>taux moyen {tauxMoyen.toFixed(1)}%</div>
              </div>
              <div style={{
                ...kpiCard,
                border: ratioMS <= OBJECTIF_MS_CA ? "1.5px solid #4a6741" : "1.5px solid #DC2626",
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: ratioMS <= OBJECTIF_MS_CA ? "#4a6741" : "#DC2626", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                  {ratioMS.toFixed(1)}%
                </div>
                <div style={kpiLabel}>Ratio MS / CA</div>
                <div style={kpiSub}>objectif {OBJECTIF_MS_CA}%</div>
              </div>
              <div style={kpiCard}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmt(caNeeded)} &euro;</div>
                <div style={kpiLabel}>CA necessaire ({OBJECTIF_MS_CA}%)</div>
                <div style={kpiSub}>pour tenir l&apos;objectif</div>
              </div>
            </div>

            {/* Ratio bar */}
            <div style={{ ...card, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "#6f6a61" }}>Ratio masse salariale</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: ratioMS <= OBJECTIF_MS_CA ? "#4a6741" : "#DC2626" }}>
                  {ratioMS.toFixed(1)}% <span style={{ color: "#999", fontWeight: 400 }}>/ cible {OBJECTIF_MS_CA}%</span>
                </span>
              </div>
              <div style={barBg}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: `${Math.min((ratioMS / 50) * 100, 100)}%`,
                  background: ratioMS <= OBJECTIF_MS_CA
                    ? "linear-gradient(90deg, #4a6741, #6ba68a)"
                    : "linear-gradient(90deg, #DC2626, #ef4444)",
                  transition: "width 0.3s",
                }} />
              </div>
            </div>

            {/* Employee table */}
            <div style={card}>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={{ ...th, minWidth: 160 }}>Collaborateur</th>
                      <th style={th}>Statut</th>
                      <th style={thR}>Brut / Net</th>
                      <th style={thR}>Charges</th>
                      <th style={thR}>Reduction Fillon</th>
                      <th style={thR}>Cout employeur</th>
                      <th style={thR}>Taux reel</th>
                      <th style={thR}>&euro;/h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.map((c, i) => (
                      <tr key={c.emp.id} style={trStyle}>
                        <td style={td}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: "50%",
                              background: avatarColor(i), color: "#fff",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 12, fontWeight: 700, flexShrink: 0,
                            }}>
                              {(c.emp.prenom?.[0] ?? "").toUpperCase()}{(c.emp.nom?.[0] ?? "").toUpperCase()}
                            </div>
                            <Link href={`/rh/employe/${c.emp.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{c.emp.prenom}</div>
                              <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase" }}>{c.emp.nom}</div>
                            </Link>
                          </div>
                        </td>
                        <td style={td}>
                          <span style={{
                            display: "inline-block", padding: "3px 10px", borderRadius: 12,
                            fontSize: 11, fontWeight: 700,
                            background: c.isTNS ? "#A0845C20" : "#4a674120",
                            color: c.isTNS ? "#A0845C" : "#4a6741",
                          }}>
                            {c.isTNS ? "TNS" : "Salarie"}
                          </span>
                        </td>
                        <td style={tdR}>
                          <div style={{ fontWeight: 600 }}>{fmt(c.brut)} &euro;</div>
                          {c.isTNS && <div style={{ fontSize: 10, color: "#999" }}>net</div>}
                        </td>
                        <td style={{ ...tdR, color: accent, fontWeight: 600 }}>
                          {c.isTNS ? fmt(c.chargesPatronales) : fmt(c.chargesPatronales)} &euro;
                        </td>
                        <td style={{ ...tdR, color: c.fillon > 0 ? "#4a6741" : "#ccc", fontWeight: 600 }}>
                          {c.isTNS ? "N/A" : c.fillon > 0 ? `-${fmt(c.fillon)} \u20AC` : "\u2014"}
                        </td>
                        <td style={{ ...tdR, fontWeight: 700, color: accent }}>
                          {fmt(c.coutEmployeur)} &euro;
                        </td>
                        <td style={{ ...tdR, fontWeight: 600, color: c.tauxReel > 30 ? "#DC2626" : "#1a1a1a" }}>
                          {c.tauxReel.toFixed(1)} %
                        </td>
                        <td style={tdR}>
                          <div style={{ fontWeight: 600 }}>{fmtDec(c.coutHoraire)}</div>
                          <div style={{ fontSize: 10, color: "#999" }}>&euro;</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ═══ TAB 2: STATUTS TNS ═══ */}
        {tab === "tns" && (
          <>
            {/* Explanation banner */}
            <div style={{
              padding: "14px 18px", borderRadius: 10, marginBottom: 16,
              background: "#faf7f2", border: "1px solid #f0ebe3",
            }}>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: "#4a3f35" }}>
                <strong style={{ color: accent }}>Gerant majoritaire SARL (TNS)</strong> — Les charges sont calculees sur le revenu net, pas sur un brut.
                Le TNS est integre dans le planning mais son cout n&apos;est pas a l&apos;heure — il est mensuel fixe.
              </div>
            </div>

            {tnsEmployes.length === 0 ? (
              <div style={card}>
                <div style={{ textAlign: "center", padding: 24, color: "#999" }}>
                  Aucun TNS actif dans cet etablissement.
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
                {/* Left: TNS cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {tnsEmployes.map((c) => {
                    const isSelected = selectedTns === c.emp.id;
                    const isOvr = salaryOverrides[c.emp.id] !== undefined;
                    return (
                      <button
                        key={c.emp.id}
                        type="button"
                        onClick={() => setSelectedTns(c.emp.id)}
                        style={{
                          padding: "14px 16px", borderRadius: 10, textAlign: "left",
                          border: isSelected ? `2px solid ${accent}` : "1px solid #ddd6c8",
                          background: isSelected ? "#faf7f2" : "#fff",
                          cursor: "pointer",
                          borderLeft: isSelected ? `4px solid ${accent}` : "1px solid #ddd6c8",
                        }}
                      >
                        <Link href={`/rh/employe/${c.emp.id}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none", color: "#1a1a1a", fontSize: 16, fontWeight: 700 }}>{c.emp.prenom}</Link>
                        <div style={{ fontSize: 12, color: "#999" }}>Gerant TNS</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isOvr ? accent : "#1a1a1a", marginTop: 4 }}>
                          {fmt(c.brut)} &euro; net
                          {isOvr && <span style={{ fontSize: 10, fontWeight: 500, color: "#999" }}> (modifie)</span>}
                        </div>
                      </button>
                    );
                  })}

                  {/* Info box */}
                  <div style={{
                    padding: "12px 14px", borderRadius: 10,
                    background: "#faf7f2", border: "1px solid #f0ebe3",
                    fontSize: 12, color: "#6f6a61", lineHeight: 1.5,
                    marginTop: 8,
                  }}>
                    Le TNS ne beneficie <strong>pas</strong> de la reduction Fillon.
                    <br /><br />
                    Ses charges couvrent : secu, retraite, prevoyance, CSG/CRDS + formation.
                  </div>
                </div>

                {/* Right: selected TNS detail */}
                {(() => {
                  const sel = tnsEmployes.find((c) => c.emp.id === selectedTns);
                  if (!sel) return null;
                  const baseContrat = baseCosts.find((c) => c.emp.id === sel.emp.id);
                  const baseNet = baseContrat?.brut ?? 0;
                  const tnsNet = sel.brut; // current (possibly overridden)
                  const heuresMois = sel.heuresSemaine * 52 / 12;
                  const isOverridden = salaryOverrides[sel.emp.id] !== undefined;

                  return (
                    <div>
                      <div style={card}>
                        <h2 style={{
                          margin: "0 0 16px", fontSize: 18, fontWeight: 700,
                          fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                          textTransform: "uppercase", letterSpacing: 0.5,
                        }}>
                          Calcul charges TNS — {sel.emp.prenom}
                        </h2>

                        {/* TNS revenue slider */}
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Remuneration nette :</span>
                            <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", color: isOverridden ? accent : "#1a1a1a" }}>
                              {fmt(tnsNet)} &euro;
                            </span>
                            {isOverridden && (
                              <button type="button" onClick={() => resetOverride(sel.emp.id)} style={{
                                fontSize: 11, color: "#999", background: "none", border: "1px solid #ddd6c8",
                                borderRadius: 12, padding: "2px 10px", cursor: "pointer",
                              }}>
                                Reinitialiser ({fmt(baseNet)} &euro;)
                              </button>
                            )}
                          </div>
                          <input
                            type="range" min={1000} max={15000} step={100}
                            value={tnsNet}
                            onChange={(e) => setSalaryOverride(sel.emp.id, Number(e.target.value))}
                            style={{ width: "100%", accentColor: "#9BA3B5" }}
                          />
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#999", marginTop: 2 }}>
                            <span>1 000 &euro;</span>
                            <span>15 000 &euro;</span>
                          </div>
                        </div>

                        {/* 3 KPIs */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                          <div style={{ ...kpiCard, borderColor: "#8B7EC820" }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "#8B7EC8", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                              {fmt(tnsNet * TAUX_CHARGES_TNS)} &euro;
                            </div>
                            <div style={kpiLabel}>Charges TNS</div>
                            <div style={kpiSub}>{(TAUX_CHARGES_TNS * 100).toFixed(1)} % du net</div>
                          </div>
                          <div style={kpiCard}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                              {fmt(tnsNet * (1 + TAUX_CHARGES_TNS))} &euro;
                            </div>
                            <div style={kpiLabel}>Cout reel mensuel</div>
                            <div style={kpiSub}>net + charges</div>
                          </div>
                          <div style={kpiCard}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: accent, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                              {heuresMois > 0 ? fmtDec(tnsNet * (1 + TAUX_CHARGES_TNS) / heuresMois) : "\u2014"} &euro;
                            </div>
                            <div style={kpiLabel}>Cout / heure</div>
                            <div style={kpiSub}>{sel.heuresSemaine}h/sem</div>
                          </div>
                        </div>

                        {/* Decomposition */}
                        <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: "#1a1a1a" }}>
                          Decomposition des charges TNS
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {TNS_DETAIL.map((d) => {
                            const montant = tnsNet * (d.taux / 100);
                            const maxTaux = 17.75;
                            return (
                              <div key={d.label}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                  <span style={{ fontSize: 13, color: "#4a3f35" }}>{d.label}</span>
                                  <span style={{ fontSize: 13 }}>
                                    <strong>{fmtDec(montant)} &euro;</strong>{" "}
                                    <span style={{ color: "#999" }}>({d.taux.toFixed(1)} %)</span>
                                  </span>
                                </div>
                                <div style={{ height: 5, borderRadius: 3, background: "#f0ebe3", overflow: "hidden" }}>
                                  <div style={{
                                    height: "100%", borderRadius: 3,
                                    width: `${(d.taux / maxTaux) * 100}%`,
                                    background: d.color,
                                    transition: "width 0.3s",
                                  }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Note planning */}
                      <div style={{
                        padding: "14px 18px", borderRadius: 10, marginTop: 12,
                        background: "#faf7f2", border: "1px solid #f0ebe3",
                        fontSize: 13, color: "#4a3f35", lineHeight: 1.6,
                      }}>
                        <strong style={{ color: accent }}>Note planning :</strong> Le TNS apparait dans le planning comme les autres
                        collaborateurs pour la gestion des presences, mais son cout dans la barre
                        ratios est calcule sur la base mensuelle fixe (net + charges TNS), <em>pas</em> a
                        l&apos;heure comme les salaries.
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {/* ═══ TAB 3: SIMULATEUR D'EMBAUCHE ═══ */}
        {tab === "simulateur" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
              {/* ── Left column ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Augmentations individuelles */}
                <div style={card}>
                  <h3 style={{
                    margin: "0 0 12px", fontSize: 14, fontWeight: 700,
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                    textTransform: "uppercase", letterSpacing: 0.5,
                  }}>
                    Augmentations au cas par cas
                  </h3>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>
                    Ajustez les salaires pour simuler l&apos;impact d&apos;augmentations individuelles.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {costs.map((c, i) => {
                      const base = baseCosts.find((b) => b.emp.id === c.emp.id);
                      const baseBrut = base?.brut ?? 0;
                      const isOvr = salaryOverrides[c.emp.id] !== undefined;
                      const diff = c.coutEmployeur - (base?.coutEmployeur ?? 0);
                      return (
                        <div key={c.emp.id} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                          borderRadius: 8, background: isOvr ? `${accent}06` : "#faf7f2",
                          border: isOvr ? `1px solid ${accent}30` : "1px solid #f0ebe3",
                        }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: "50%",
                            background: avatarColor(i), color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, fontWeight: 700, flexShrink: 0,
                          }}>
                            {(c.emp.prenom?.[0] ?? "").toUpperCase()}{(c.emp.nom?.[0] ?? "").toUpperCase()}
                          </div>
                          <div style={{ minWidth: 100, flexShrink: 0 }}>
                            <Link href={`/rh/employe/${c.emp.id}`} style={{ textDecoration: "none", color: "#1a1a1a", fontSize: 12, fontWeight: 600 }}>{c.emp.prenom} {c.emp.nom}</Link>
                            <div style={{ fontSize: 10, color: "#999" }}>
                              {c.isTNS ? "TNS" : c.contratType} {c.heuresSemaine}h
                            </div>
                          </div>
                          <input
                            type="range"
                            min={c.isTNS ? 1000 : 1400}
                            max={c.isTNS ? 15000 : 5000}
                            step={50}
                            value={c.brut}
                            onChange={(e) => setSalaryOverride(c.emp.id, Number(e.target.value))}
                            style={{ flex: 1, accentColor: isOvr ? accent : "#ccc" }}
                          />
                          <div style={{ textAlign: "right", minWidth: 80, flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: isOvr ? accent : "#1a1a1a" }}>
                              {fmt(c.brut)} &euro;
                            </div>
                            {isOvr && diff !== 0 && (
                              <div style={{ fontSize: 10, color: diff > 0 ? "#DC2626" : "#4a6741", fontWeight: 600 }}>
                                {diff > 0 ? "+" : ""}{fmt(diff)} &euro;
                              </div>
                            )}
                          </div>
                          {isOvr && (
                            <button type="button" onClick={() => resetOverride(c.emp.id)} style={{
                              fontSize: 14, color: "#999", background: "none", border: "none",
                              cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0,
                            }} title={`Reinitialiser (${fmt(baseBrut)} \u20AC)`}>&times;</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {hasOverrides && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0ebe3" }}>
                      <span style={{ fontSize: 12, color: "#6f6a61" }}>
                        Impact augmentations : <strong style={{ color: totalMS > baseTotalMS ? "#DC2626" : "#4a6741" }}>
                          {totalMS > baseTotalMS ? "+" : ""}{fmt(totalMS - baseTotalMS)} &euro;/mois
                        </strong>
                      </span>
                      <button type="button" onClick={() => setSalaryOverrides({})} style={{
                        fontSize: 11, color: "#999", background: "none", border: "1px solid #ddd6c8",
                        borderRadius: 12, padding: "3px 12px", cursor: "pointer",
                      }}>
                        Tout reinitialiser
                      </button>
                    </div>
                  )}
                </div>

                {/* Recrutements */}
                <div style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div>
                      <h3 style={{
                        margin: 0, fontSize: 14, fontWeight: 700,
                        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                        textTransform: "uppercase", letterSpacing: 0.5,
                      }}>
                        Simulation de recrutement
                      </h3>
                      {simRows.length > 0 && (
                        <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                          {simRows.length} nouveau{simRows.length > 1 ? "x" : ""} collaborateur{simRows.length > 1 ? "s" : ""} · cout total {fmt(simTotalCost)} &euro;/mois
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={addSimRow} style={{
                      padding: "8px 16px", borderRadius: 8, border: "none",
                      background: accent, color: "#fff",
                      fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}>
                      + Ajouter un collaborateur
                    </button>
                  </div>

                  {simRows.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 20, color: "#999", fontSize: 13 }}>
                      Ajoutez un collaborateur pour simuler un recrutement.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {simCosts.map((s, idx) => {
                        const r = s.row;
                        return (
                          <div key={r.id} style={{ padding: 14, borderRadius: 10, border: "1px solid #f0ebe3", background: "#faf7f2" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{
                                  width: 28, height: 28, borderRadius: "50%",
                                  background: accent, color: "#fff",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 13, fontWeight: 700,
                                }}>
                                  {idx + 1}
                                </div>
                                <input
                                  style={{ border: "none", fontSize: 14, fontWeight: 600, outline: "none", background: "transparent", width: 160 }}
                                  value={r.nom}
                                  onChange={(e) => updateSim(r.id, { nom: e.target.value })}
                                />
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ textAlign: "right" }}>
                                  <div style={{ fontSize: 16, fontWeight: 700, color: accent, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                                    {fmt(s.selected)} &euro;
                                  </div>
                                  <div style={{ fontSize: 10, color: "#999" }}>{fmtDec(s.eurH)} &euro;/h</div>
                                </div>
                                <button type="button" onClick={() => removeSim(r.id)} style={{
                                  width: 24, height: 24, borderRadius: "50%",
                                  border: "1px solid #ddd6c8", background: "#fff",
                                  cursor: "pointer", fontSize: 13, color: "#999",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}>&times;</button>
                              </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                              <div>
                                <div style={miniLabel}>Type de contrat</div>
                                <div style={{ display: "flex", gap: 4 }}>
                                  {(["CDI", "CDD", "extra", "apprenti"] as const).map((t) => (
                                    <button key={t} type="button" onClick={() => updateSim(r.id, { type: t })} style={{
                                      padding: "4px 10px", borderRadius: 14,
                                      border: r.type === t ? `1.5px solid ${accent}` : "1px solid #ddd6c8",
                                      background: r.type === t ? `${accent}12` : "#fff",
                                      color: r.type === t ? accent : "#6f6a61",
                                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                                      textTransform: "capitalize",
                                    }}>
                                      {t === "extra" ? "Extra" : t === "apprenti" ? "Apprenti" : t}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div style={miniLabel}>Remplace</div>
                                <select style={{ ...selectStyle, padding: "5px 8px", fontSize: 12 }} value={r.remplace} onChange={(e) => updateSim(r.id, { remplace: e.target.value })}>
                                  <option value="nouveau">Recrutement additionnel</option>
                                  {costs.map((c) => (
                                    <option key={c.emp.id} value={c.emp.id}>{c.emp.prenom} {c.emp.nom}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                  <span style={miniLabel}>Salaire brut</span>
                                  <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(r.brut)} &euro;</span>
                                </div>
                                <input type="range" min={1400} max={4500} step={50} value={r.brut}
                                  onChange={(e) => updateSim(r.id, { brut: Number(e.target.value) })}
                                  style={{ width: "100%", accentColor: accent }} />
                              </div>
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                  <span style={miniLabel}>Heures / semaine</span>
                                  <span style={{ fontSize: 12, fontWeight: 700 }}>{r.heures}h</span>
                                </div>
                                <input type="range" min={10} max={45} step={1} value={r.heures}
                                  onChange={(e) => updateSim(r.id, { heures: Number(e.target.value) })}
                                  style={{ width: "100%", accentColor: accent }} />
                              </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                              {([
                                { label: "CDI", val: fmt(s.coutCDI) + " \u20AC" },
                                { label: "CDD", val: fmt(s.coutCDD) + " \u20AC" },
                                { label: "Extra", val: fmtDec(s.extraHoraire) + " \u20AC/h" },
                                { label: "Apprenti", val: fmt(s.coutApprenti) + " \u20AC" },
                              ] as const).map((b) => (
                                <div key={b.label} style={{
                                  padding: "6px 8px", borderRadius: 6, textAlign: "center",
                                  border: r.type === b.label.toLowerCase() ? `1.5px solid ${accent}` : "1px solid #e8e2d8",
                                  background: r.type === b.label.toLowerCase() ? `${accent}08` : "#fff",
                                }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: r.type === b.label.toLowerCase() ? accent : "#999", textTransform: "uppercase" }}>
                                    {b.label}
                                  </div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{b.val}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Right column: always visible ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Impact masse salariale */}
                <div style={card}>
                  <h3 style={{
                    margin: "0 0 14px", fontSize: 14, fontWeight: 700,
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                    textTransform: "uppercase", letterSpacing: 0.5,
                  }}>
                    Impact masse salariale
                  </h3>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                    <div style={{ padding: "10px 12px", borderRadius: 8, background: "#faf7f2", border: "1px solid #f0ebe3" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>MS base</div>
                      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmt(baseTotalMS)} &euro;</div>
                      <div style={{ fontSize: 11, color: "#999" }}>{caSimule > 0 ? (baseTotalMS / caSimule * 100).toFixed(1) : "—"}% du CA</div>
                    </div>
                    <div style={{ padding: "10px 12px", borderRadius: 8, background: `${accent}08`, border: `1px solid ${accent}30` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>MS projetee</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: accent, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmt(msProjetee)} &euro;</div>
                      <div style={{ fontSize: 11, color: "#999" }}>{ratioProjecte.toFixed(1)}% du CA</div>
                    </div>
                  </div>

                  {/* Ratio bars */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: "#6f6a61" }}>Ratio base</span>
                      <span style={{ fontWeight: 700, color: (baseTotalMS / caSimule * 100) <= OBJECTIF_MS_CA ? "#4a6741" : "#DC2626" }}>
                        {(baseTotalMS / caSimule * 100).toFixed(1)}% <span style={{ color: "#ccc", fontWeight: 400 }}>/ cible {OBJECTIF_MS_CA}%</span>
                      </span>
                    </div>
                    <div style={barBg}>
                      <div style={{
                        height: "100%", borderRadius: 4, transition: "width 0.3s",
                        width: `${Math.min((baseTotalMS / caSimule * 100 / 50) * 100, 100)}%`,
                        background: (baseTotalMS / caSimule * 100) <= OBJECTIF_MS_CA ? "#4a6741" : "#DC2626",
                      }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: "#6f6a61" }}>Ratio projete</span>
                      <span style={{ fontWeight: 700, color: ratioProjecte <= OBJECTIF_MS_CA ? "#4a6741" : "#DC2626" }}>
                        {ratioProjecte.toFixed(1)}% <span style={{ color: "#ccc", fontWeight: 400 }}>/ cible {OBJECTIF_MS_CA}%</span>
                      </span>
                    </div>
                    <div style={barBg}>
                      <div style={{
                        height: "100%", borderRadius: 4, transition: "width 0.3s",
                        width: `${Math.min((ratioProjecte / 50) * 100, 100)}%`,
                        background: accent,
                      }} />
                    </div>
                  </div>

                  {/* Detail list */}
                  <div style={{ borderTop: "1px solid #f0ebe3", paddingTop: 10 }}>
                    {hasOverrides && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                        <span style={{ fontSize: 12, color: "#4a3f35" }}>Augmentations</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: totalMS > baseTotalMS ? "#DC2626" : "#4a6741" }}>
                          {totalMS > baseTotalMS ? "+" : ""}{fmt(totalMS - baseTotalMS)} &euro;/mois
                        </span>
                      </div>
                    )}
                    {simCosts.map((s, idx) => (
                      <div key={s.row.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: avatarColor(idx) }} />
                          <span style={{ fontSize: 12, color: "#4a3f35" }}>{s.row.nom}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(s.selected)} &euro;/mois</span>
                      </div>
                    ))}
                    {(hasOverrides || simRows.length > 0) && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid #f0ebe3" }}>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>Impact total</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: (msProjetee - baseTotalMS) > 0 ? "#DC2626" : "#4a6741" }}>
                            {(msProjetee - baseTotalMS) > 0 ? "+" : ""}{fmt(msProjetee - baseTotalMS)} &euro;/mois
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "#999" }}>Impact annuel</span>
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{fmt((msProjetee - baseTotalMS) * 12)} &euro;/an</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* CA à atteindre */}
                <div style={card}>
                  <h3 style={{
                    margin: "0 0 14px", fontSize: 14, fontWeight: 700,
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                    textTransform: "uppercase", letterSpacing: 0.5,
                  }}>
                    CA a atteindre
                  </h3>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "#6f6a61" }}>Objectif ratio MS</span>
                    <span style={{ fontWeight: 700 }}>{OBJECTIF_MS_CA}%</span>
                  </div>
                  <div style={{ ...barBg, marginBottom: 12 }}>
                    <div style={{ height: "100%", borderRadius: 4, width: `${OBJECTIF_MS_CA}%`, background: accent, opacity: 0.3 }} />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "#6f6a61" }}>CA actuel mensuel</span>
                    <span style={{ fontWeight: 700 }}>{fmt(caSimule)} &euro;</span>
                  </div>
                  <div style={{ ...barBg, marginBottom: 16 }}>
                    <div style={{
                      height: "100%", borderRadius: 4, transition: "width 0.3s",
                      width: `${Math.min((caSimule / 200000) * 100, 100)}%`,
                      background: "#5B9BD5",
                    }} />
                  </div>

                  <div style={{
                    padding: "14px 16px", borderRadius: 10,
                    background: "#faf7f2", border: "1px solid #f0ebe3",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>CA necessaire / mois</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: accent, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                      {fmt(caNeededProjecte)} &euro;
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6 }}>
                      <span style={{ color: "#6f6a61" }}>Progression</span>
                      <span style={{ fontWeight: 700, color: caNeededProjecte > caSimule ? "#DC2626" : "#4a6741" }}>
                        {caNeededProjecte > caSimule ? "+" : ""}{fmt(caNeededProjecte - caSimule)} &euro;
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "#6f6a61" }}>Annuel</span>
                      <span style={{ fontWeight: 700 }}>{fmt(caNeededProjecte * 12)} &euro;</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "#6f6a61" }}>Productivite cible</span>
                      <span style={{ fontWeight: 700 }}>
                        {(() => {
                          const totalHeures = costs.reduce((a, c) => a + (c.heuresSemaine * 52 / 12), 0)
                            + simRows.reduce((a, r) => a + (r.heures * 52 / 12), 0);
                          return totalHeures > 0 ? fmtDec(caNeededProjecte / totalHeures) : "\u2014";
                        })()} &euro;/h
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </RequireRole>
  );
}

/* ── Styles ────────────────────────────────────────────────────── */

const pageStyle: CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: "16px 16px 60px" };

const card: CSSProperties = {
  background: "#fff", border: "1px solid #ddd6c8",
  borderRadius: 12, padding: "18px 18px", marginBottom: 0,
};

const kpiCard: CSSProperties = {
  background: "#fff", border: "1px solid #ddd6c8",
  borderRadius: 12, padding: "14px 16px", textAlign: "center",
};

const kpiLabel: CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#6f6a61", marginTop: 4,
};

const kpiSub: CSSProperties = {
  fontSize: 11, color: "#999", marginTop: 2,
};

const miniLabel: CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#999", marginBottom: 4,
  textTransform: "uppercase", letterSpacing: 0.5,
};

const tableStyle: CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: 13,
};

const th: CSSProperties = {
  textAlign: "left", padding: "10px 8px",
  fontSize: 10, fontWeight: 700, color: "#999",
  textTransform: "uppercase", letterSpacing: 0.5,
  borderBottom: "1px solid #ddd6c8",
};

const thR: CSSProperties = { ...th, textAlign: "right" };

const td: CSSProperties = {
  padding: "12px 8px", borderBottom: "1px solid #f0ebe3",
  verticalAlign: "middle",
};

const tdR: CSSProperties = { ...td, textAlign: "right", fontSize: 13 };

const trStyle: CSSProperties = {};

const barBg: CSSProperties = {
  height: 8, borderRadius: 4, background: "#f0ebe3", overflow: "hidden",
};

const selectStyle: CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1px solid #ddd6c8", fontSize: 13, background: "#fff",
  outline: "none", boxSizing: "border-box",
  appearance: "auto",
};

"use client";

import { useEffect, useState, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { loadEtabParam, saveEtabParamDebounced, deleteEtabParam } from "@/lib/etabParams";
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

// const SMIC_MENSUEL = 1802; // unused for now
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

// const TNS_TOTAL_TAUX = TNS_DETAIL.reduce((a, d) => a + d.taux, 0); // unused for now

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

/** Exported content for embedding in masse salariale page */
export function SimulationContent({ activeTab }: { activeTab: "tns" | "simulateur" }) {
  const { current: etab } = useEtablissement();
  const accent = etab?.couleur ?? "#D4775A";

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);
  const tab = activeTab;
  const [caSimule, setCaSimule] = useState(85000);
  const [caLoaded, setCaLoaded] = useState(false);
  const [simRows, setSimRows] = useState<SimRow[]>([]);
  const [selectedTns, setSelectedTns] = useState<string | null>(null);
  // Salary overrides for simulation (empId → new brut/net amount)
  const [salaryOverrides, setSalaryOverrides] = useState<Record<string, number>>({});

  /* ── Load ── */
  const loadEmployes = async (etabId: string): Promise<Employe[]> => {
    const empRes = await supabase
      .from("employes").select("*")
      .contains("etablissements_ids", [etabId]).eq("actif", true).order("nom");
    const empIds = (empRes.data ?? []).map((e: Record<string, unknown>) => e.id as string);
    const contratRes = empIds.length > 0
      ? await supabase.from("contrats").select("*").eq("actif", true).in("employe_id", empIds)
      : { data: [] };
    const contrats = (contratRes.data ?? []) as Contrat[];
    return (empRes.data ?? []).map((e: Record<string, unknown>) => ({
      ...e,
      contrats: contrats.filter((c) => c.employe_id === e.id),
    })) as Employe[];
  };

  useEffect(() => {
    if (!etab) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Salaires ajustés mémorisés (table etablissement_params — partagés entre appareils)
      const savedOverrides = await loadEtabParam<Record<string, number>>(etab.id, "ms_salaires_simules");
      if (cancelled) return;
      setSalaryOverrides(savedOverrides && typeof savedOverrides === "object" ? savedOverrides : {});
      const empRes = await supabase
        .from("employes").select("*")
        .contains("etablissements_ids", [etab.id]).eq("actif", true).order("nom");
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

      // Load CA from ventes stats (current month)
      if (!caLoaded) {
        const now = new Date();
        const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
        try {
          const caRes = await fetch(`/api/ventes/stats?etablissement_id=${etab.id}&from=${from}&to=${to}`);
          const caJson = await caRes.json();
          const ca = caJson?.stats?.ca_ttc ?? caJson?.stats?.total_ttc ?? null;
          if (ca && ca > 0 && !cancelled) {
            setCaSimule(Math.round(ca));
            setCaLoaded(true);
          }
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, [etab]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const persistOverrides = (next: Record<string, number>) => {
    if (!etab) return;
    if (Object.keys(next).length === 0) void deleteEtabParam(etab.id, "ms_salaires_simules");
    else saveEtabParamDebounced(etab.id, "ms_salaires_simules", next);
  };
  const setSalaryOverride = (empId: string, value: number) => {
    setSalaryOverrides((prev) => {
      const next = { ...prev, [empId]: value };
      persistOverrides(next);
      return next;
    });
  };
  const resetOverride = (empId: string) => {
    setSalaryOverrides((prev) => {
      const next = { ...prev };
      delete next[empId];
      persistOverrides(next);
      return next;
    });
  };
  const resetAllOverrides = () => {
    setSalaryOverrides({});
    if (etab) void deleteEtabParam(etab.id, "ms_salaires_simules");
  };
  /** Écrit les salaires ajustés dans les contrats (devient le nouveau réel) */
  const saveOverridesToContracts = async () => {
    if (!etab) return;
    for (const [empId, brut] of Object.entries(salaryOverrides)) {
      const emp = employes.find(e => e.id === empId);
      const contrat = emp?.contrats?.find(c => c.actif);
      if (contrat) {
        await supabase.from("contrats").update({ remuneration: brut }).eq("id", contrat.id);
      }
    }
    resetAllOverrides();
    setEmployes(await loadEmployes(etab.id));
  };

  // Auto-select first TNS (derive, no effect needed)
  const effectiveTns = selectedTns ?? (tnsEmployes.length > 0 ? tnsEmployes[0].emp.id : null);

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
    return <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>;
  }

  return (
    <>

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
              <div className="ventes-sim-tns-layout" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
                {/* Left: TNS cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {tnsEmployes.map((c) => {
                    const isSelected = effectiveTns === c.emp.id;
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
                          {fmt(c.brut)} {"\u20AC"} net
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
                  const sel = tnsEmployes.find((c) => c.emp.id === effectiveTns);
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
                              {fmt(tnsNet)} {"\u20AC"}
                            </span>
                            {isOverridden && (
                              <>
                                <button type="button" onClick={() => resetOverride(sel.emp.id)} style={{
                                  fontSize: 11, color: "#999", background: "none", border: "1px solid #ddd6c8",
                                  borderRadius: 12, padding: "2px 10px", cursor: "pointer",
                                }}>
                                  Réinitialiser ({fmt(baseNet)} {"\u20AC"})
                                </button>
                                <button type="button" onClick={saveOverridesToContracts} style={{
                                  fontSize: 11, color: "#fff", background: "#4a6741", border: "none",
                                  borderRadius: 12, padding: "3px 12px", cursor: "pointer", fontWeight: 700,
                                }}>
                                  Sauvegarder dans le contrat
                                </button>
                              </>
                            )}
                          </div>
                          <input
                            type="range" min={1000} max={15000} step={100}
                            value={tnsNet}
                            onChange={(e) => setSalaryOverride(sel.emp.id, Number(e.target.value))}
                            style={{ width: "100%", accentColor: "#9BA3B5" }}
                          />
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#999", marginTop: 2 }}>
                            <span>1 000 {"\u20AC"}</span>
                            <span>montant mémorisé automatiquement</span>
                            <span>15 000 {"\u20AC"}</span>
                          </div>
                        </div>

                        {/* 3 KPIs */}
                        <div className="ventes-sim-tns-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
                          <div style={{ ...kpiCard, borderColor: "#8B7EC820" }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "#8B7EC8", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                              {fmt(tnsNet * TAUX_CHARGES_TNS)} {"\u20AC"}
                            </div>
                            <div style={kpiLabel}>Charges TNS</div>
                            <div style={kpiSub}>{(TAUX_CHARGES_TNS * 100).toFixed(1)} % du net</div>
                          </div>
                          <div style={kpiCard}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                              {fmt(tnsNet * (1 + TAUX_CHARGES_TNS))} {"\u20AC"}
                            </div>
                            <div style={kpiLabel}>Cout reel mensuel</div>
                            <div style={kpiSub}>net + charges</div>
                          </div>
                          <div style={kpiCard}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: accent, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                              {heuresMois > 0 ? fmtDec(tnsNet * (1 + TAUX_CHARGES_TNS) / heuresMois) : "\u2014"} {"\u20AC"}
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
                                    <strong>{fmtDec(montant)} {"\u20AC"}</strong>{" "}
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
            <div className="ventes-sim-layout" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
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
                    Ajustez les salaires pour simuler l&apos;impact d&apos;augmentations individuelles. Les montants ajustés sont mémorisés d&apos;une visite à l&apos;autre : « Réinitialiser » revient aux contrats, « Sauvegarder » les inscrit dans les contrats.
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
                              {fmt(c.brut)} {"\u20AC"}
                            </div>
                            {isOvr && diff !== 0 && (
                              <div style={{ fontSize: 10, color: diff > 0 ? "#DC2626" : "#4a6741", fontWeight: 600 }}>
                                {diff > 0 ? "+" : ""}{fmt(diff)} {"\u20AC"}
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
                          {totalMS > baseTotalMS ? "+" : ""}{fmt(totalMS - baseTotalMS)} {"\u20AC"}/mois
                        </strong>
                      </span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" onClick={resetAllOverrides} style={{
                          fontSize: 11, color: "#999", background: "none", border: "1px solid #ddd6c8",
                          borderRadius: 12, padding: "3px 12px", cursor: "pointer",
                        }}>
                          Réinitialiser
                        </button>
                        <button type="button" onClick={saveOverridesToContracts} style={{
                          fontSize: 11, color: "#fff", background: "#4a6741", border: "none",
                          borderRadius: 12, padding: "3px 12px", cursor: "pointer", fontWeight: 700,
                        }}>
                          Sauvegarder
                        </button>
                      </div>
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
                          {simRows.length} nouveau{simRows.length > 1 ? "x" : ""} collaborateur{simRows.length > 1 ? "s" : ""} · cout total {fmt(simTotalCost)} {"\u20AC"}/mois
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
                                    {fmt(s.selected)} {"\u20AC"}
                                  </div>
                                  <div style={{ fontSize: 10, color: "#999" }}>{fmtDec(s.eurH)} {"\u20AC"}/h</div>
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
                                  <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(r.brut)} {"\u20AC"}</span>
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

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6 }}>
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
                      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmt(baseTotalMS)} {"\u20AC"}</div>
                      <div style={{ fontSize: 11, color: "#999" }}>{caSimule > 0 ? (baseTotalMS / caSimule * 100).toFixed(1) : "—"}% du CA</div>
                    </div>
                    <div style={{ padding: "10px 12px", borderRadius: 8, background: `${accent}08`, border: `1px solid ${accent}30` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>MS projetee</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: accent, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmt(msProjetee)} {"\u20AC"}</div>
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
                          {totalMS > baseTotalMS ? "+" : ""}{fmt(totalMS - baseTotalMS)} {"\u20AC"}/mois
                        </span>
                      </div>
                    )}
                    {simCosts.map((s, idx) => (
                      <div key={s.row.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: avatarColor(idx) }} />
                          <span style={{ fontSize: 12, color: "#4a3f35" }}>{s.row.nom}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(s.selected)} {"\u20AC"}/mois</span>
                      </div>
                    ))}
                    {(hasOverrides || simRows.length > 0) && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid #f0ebe3" }}>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>Impact total</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: (msProjetee - baseTotalMS) > 0 ? "#DC2626" : "#4a6741" }}>
                            {(msProjetee - baseTotalMS) > 0 ? "+" : ""}{fmt(msProjetee - baseTotalMS)} {"\u20AC"}/mois
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "#999" }}>Impact annuel</span>
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{fmt((msProjetee - baseTotalMS) * 12)} {"\u20AC"}/an</span>
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

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "#6f6a61" }}>CA actuel mensuel</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="number"
                        value={caSimule}
                        onChange={e => setCaSimule(Number(e.target.value) || 0)}
                        style={{
                          width: 100, textAlign: "right", fontWeight: 700, fontSize: 13,
                          border: "1px solid #ddd6c8", borderRadius: 8, padding: "4px 8px",
                          background: "#fff", fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        }}
                      />
                      <span style={{ fontWeight: 700 }}>{"\u20AC"}</span>
                    </div>
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
                      {fmt(caNeededProjecte)} {"\u20AC"}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6 }}>
                      <span style={{ color: "#6f6a61" }}>Progression</span>
                      <span style={{ fontWeight: 700, color: caNeededProjecte > caSimule ? "#DC2626" : "#4a6741" }}>
                        {caNeededProjecte > caSimule ? "+" : ""}{fmt(caNeededProjecte - caSimule)} {"\u20AC"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "#6f6a61" }}>Annuel</span>
                      <span style={{ fontWeight: 700 }}>{fmt(caNeededProjecte * 12)} {"\u20AC"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "#6f6a61" }}>Productivite cible</span>
                      <span style={{ fontWeight: 700 }}>
                        {(() => {
                          const totalHeures = costs.reduce((a, c) => a + (c.heuresSemaine * 52 / 12), 0)
                            + simRows.reduce((a, r) => a + (r.heures * 52 / 12), 0);
                          return totalHeures > 0 ? fmtDec(caNeededProjecte / totalHeures) : "\u2014";
                        })()}{" \u20AC"}/h
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
    </>
  );
}

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

const barBg: CSSProperties = {
  height: 8, borderRadius: 4, background: "#f0ebe3", overflow: "hidden",
};

const selectStyle: CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1px solid #ddd6c8", fontSize: 13, background: "#fff",
  outline: "none", boxSizing: "border-box",
  appearance: "auto",
};

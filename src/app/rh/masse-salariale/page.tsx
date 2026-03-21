"use client";

import { useEffect, useState, useMemo } from "react";
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
  remplace: string; // "nouveau" or employee id
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
const TAUX_CHARGES_TNS = 0.45; // sur le net
const OBJECTIF_MS_CA = 37;

const TNS_DETAIL = [
  { label: "Maladie / IJ", taux: 6.50 },
  { label: "Retraite base", taux: 17.75 },
  { label: "Retraite complementaire", taux: 7.0 },
  { label: "Invalidite / Deces", taux: 1.30 },
  { label: "Allocations familiales", taux: 3.10 },
  { label: "CSG / CRDS", taux: 9.70 },
  { label: "Formation professionnelle", taux: 0.25 },
];

const TNS_TOTAL_TAUX = TNS_DETAIL.reduce((a, d) => a + d.taux, 0);

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
      emp, contratType: "TNS", heuresSemaine: 0,
      brut: 0, net: 0, chargesPatronales: 0, fillon: 0,
      coutEmployeur: 0, tauxReel: 0, coutHoraire: 0, isTNS: true,
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

function fmt(n: number): string {
  return Math.round(n).toLocaleString("fr-FR");
}

/* ── Component ─────────────────────────────────────────────────── */

export default function MasseSalarialePage() {
  const { current: etab } = useEtablissement();

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("reel");

  // Sliders
  const [caSimule, setCaSimule] = useState(80000);
  const [tnsRevenu, setTnsRevenu] = useState(3000);

  // Simulateur
  const [simRows, setSimRows] = useState<SimRow[]>([]);

  /* ── Load ── */
  useEffect(() => {
    if (!etab) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const empRes = await supabase
        .from("employes")
        .select("*")
        .eq("etablissement_id", etab.id)
        .eq("actif", true)
        .order("nom");

      if (cancelled) return;

      const empIds = (empRes.data ?? []).map((e: Record<string, unknown>) => e.id as string);
      const contratRes = empIds.length > 0
        ? await supabase
            .from("contrats")
            .select("*")
            .eq("actif", true)
            .in("employe_id", empIds)
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

  /* ── Costs ── */
  const costs = useMemo(() => {
    return employes
      .filter((e) => e.contrats?.some((c) => c.actif))
      .map((e) => calcCostLine(e));
  }, [employes]);

  const salaries = costs.filter((c) => !c.isTNS);
  const tnsEmployes = costs.filter((c) => c.isTNS);

  const totalBrut = salaries.reduce((acc, c) => acc + c.brut, 0);
  const totalChargesPatronales = salaries.reduce((acc, c) => acc + c.chargesPatronales, 0);
  const totalFillon = salaries.reduce((acc, c) => acc + c.fillon, 0);

  const tnsCoutParPersonne = tnsRevenu * (1 + TAUX_CHARGES_TNS);
  const totalTNS = tnsEmployes.length * tnsCoutParPersonne;

  const totalMSSalaries = salaries.reduce((acc, c) => acc + c.coutEmployeur, 0);
  const totalMS = totalMSSalaries + totalTNS;
  const totalCharges = totalChargesPatronales - totalFillon + (tnsEmployes.length * tnsRevenu * TAUX_CHARGES_TNS);

  const ratioMS = caSimule > 0 ? (totalMS / caSimule) * 100 : 0;
  const caNeeded = totalMS / (OBJECTIF_MS_CA / 100);

  /* ── Simulateur: projected costs ── */
  const simCost = useMemo(() => {
    return simRows.reduce((acc, r) => {
      const heuresMois = r.heures * 52 / 12;
      const charges = r.brut * TAUX_CHARGES_PATRONALES;
      const fillon = calcFillon(r.brut, heuresMois);
      return acc + r.brut + charges - fillon;
    }, 0);
  }, [simRows]);

  // Cost of employees being replaced
  const replacedCost = useMemo(() => {
    const replacedIds = simRows.map((r) => r.remplace).filter((r) => r !== "nouveau");
    const uniqueIds = [...new Set(replacedIds)];
    return uniqueIds.reduce((acc, id) => {
      const c = costs.find((c) => c.emp.id === id);
      if (!c) return acc;
      return acc + (c.isTNS ? tnsCoutParPersonne : c.coutEmployeur);
    }, 0);
  }, [simRows, costs, tnsCoutParPersonne]);

  const msProjetee = totalMS - replacedCost + simCost;
  const ratioProjecte = caSimule > 0 ? (msProjetee / caSimule) * 100 : 0;

  const addSimRow = () => {
    setSimRows((prev) => [...prev, {
      id: crypto.randomUUID(),
      nom: `Collaborateur ${prev.length + 1}`,
      type: "CDI",
      remplace: "nouveau",
      brut: SMIC_MENSUEL,
      heures: 35,
    }]);
  };

  const updateSim = (id: string, patch: Partial<SimRow>) => {
    setSimRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  };

  const removeSim = (id: string) => {
    setSimRows((prev) => prev.filter((r) => r.id !== id));
  };

  if (loading) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <div style={pageStyle}><div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div></div>
      </RequireRole>
    );
  }

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={pageStyle}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={titleStyle}>Masse salariale</h1>
          <div style={{ fontSize: 13, color: "#999" }}>{etab?.nom}</div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {([
            { key: "reel" as Tab, label: "Masse salariale" },
            { key: "tns" as Tab, label: "Statuts TNS" },
            { key: "simulateur" as Tab, label: "Simulateur" },
          ]).map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} style={pillBtn(tab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══ TAB 1: MASSE SALARIALE REELLE ═══ */}
        {tab === "reel" && (
          <>
            {/* CA slider */}
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={labelStyle}>CA HT mensuel simule</span>
                <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                  {caSimule.toLocaleString("fr-FR")} EUR
                </span>
              </div>
              <input
                type="range"
                min={30000} max={150000} step={1000}
                value={caSimule}
                onChange={(e) => setCaSimule(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#e27f57" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#999", marginTop: 2 }}>
                <span>30 000</span>
                <span>150 000</span>
              </div>
            </div>

            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
              <KpiCard label="Masse salariale" value={`${fmt(totalMS)} EUR`} />
              <KpiCard label="Charges totales" value={`${fmt(totalCharges)} EUR`} />
              <KpiCard
                label="Ratio MS / CA"
                value={`${ratioMS.toFixed(1)}%`}
                color={ratioMS <= OBJECTIF_MS_CA ? "#4a6741" : "#DC2626"}
              />
              <KpiCard
                label={`CA pour ${OBJECTIF_MS_CA}%`}
                value={`${fmt(caNeeded)} EUR`}
              />
            </div>

            {/* Progress bar */}
            <div style={{ ...card, padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: "#6f6a61" }}>Ratio MS/CA vs objectif {OBJECTIF_MS_CA}%</span>
                <span style={{ fontWeight: 700, color: ratioMS <= OBJECTIF_MS_CA ? "#4a6741" : "#DC2626" }}>
                  {ratioMS.toFixed(1)}%
                </span>
              </div>
              <div style={barBg}>
                <div style={{
                  ...barFill,
                  width: `${Math.min((ratioMS / 50) * 100, 100)}%`,
                  background: ratioMS <= OBJECTIF_MS_CA ? "#4a6741" : "#DC2626",
                }} />
              </div>
              <div style={{ position: "relative", height: 14, marginTop: 2 }}>
                <div style={{
                  position: "absolute",
                  left: `${(OBJECTIF_MS_CA / 50) * 100}%`,
                  transform: "translateX(-50%)",
                  fontSize: 9,
                  color: "#999",
                  fontWeight: 700,
                }}>
                  {OBJECTIF_MS_CA}%
                </div>
              </div>
            </div>

            {/* Table */}
            <div style={card}>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={th}>Nom</th>
                      <th style={thR}>Brut</th>
                      <th style={thR}>Net</th>
                      <th style={thR}>Charges</th>
                      <th style={thR}>Red. Fillon</th>
                      <th style={thR}>Cout empl.</th>
                      <th style={thR}>Taux reel</th>
                      <th style={thR}>EUR/h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaries.map((c) => (
                      <tr key={c.emp.id} style={trStyle}>
                        <td style={td}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.emp.prenom} {c.emp.nom}</div>
                          <div style={{ fontSize: 10, color: "#999" }}>
                            {c.contratType} {c.heuresSemaine}h
                            {c.emp.matricule && <span> · #{c.emp.matricule}</span>}
                          </div>
                        </td>
                        <td style={tdR}>{fmt(c.brut)}</td>
                        <td style={tdR}>{fmt(c.net)}</td>
                        <td style={tdR}>{fmt(c.chargesPatronales)}</td>
                        <td style={{ ...tdR, color: c.fillon > 0 ? "#4a6741" : "#ccc" }}>
                          {c.fillon > 0 ? `-${fmt(c.fillon)}` : "—"}
                        </td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{fmt(c.coutEmployeur)}</td>
                        <td style={tdR}>{c.tauxReel.toFixed(1)}%</td>
                        <td style={tdR}>{c.coutHoraire.toFixed(2)}</td>
                      </tr>
                    ))}
                    {tnsEmployes.map((c) => (
                      <tr key={c.emp.id} style={{ ...trStyle, background: "rgba(160,132,92,0.04)" }}>
                        <td style={td}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.emp.prenom} {c.emp.nom}</div>
                          <div style={{ fontSize: 10, color: "#999" }}>TNS — cout fixe mensuel</div>
                        </td>
                        <td style={tdR} colSpan={6}>
                          <span style={{ fontSize: 12, color: "#A0845C" }}>
                            {fmt(tnsRevenu)} net + {fmt(tnsRevenu * TAUX_CHARGES_TNS)} charges
                          </span>
                        </td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{fmt(tnsCoutParPersonne)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={totalRow}>
                      <td style={td}><strong>TOTAL</strong></td>
                      <td style={tdR}><strong>{fmt(totalBrut)}</strong></td>
                      <td style={tdR}><strong>{fmt(totalBrut * (1 - TAUX_CHARGES_SALARIALES))}</strong></td>
                      <td style={tdR}><strong>{fmt(totalChargesPatronales)}</strong></td>
                      <td style={tdR}><strong>-{fmt(totalFillon)}</strong></td>
                      <td style={{ ...tdR, fontWeight: 800 }}>{fmt(totalMS)}</td>
                      <td style={tdR} colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ═══ TAB 2: STATUTS TNS ═══ */}
        {tab === "tns" && (
          <>
            {tnsEmployes.length === 0 ? (
              <div style={card}>
                <div style={{ textAlign: "center", padding: 20, color: "#999" }}>
                  Aucun TNS actif dans cet etablissement.
                  <div style={{ fontSize: 12, marginTop: 6, color: "#bbb" }}>
                    Les TNS doivent avoir un contrat actif de type &quot;TNS&quot;.
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* TNS cards */}
                <div style={{ display: "grid", gridTemplateColumns: tnsEmployes.length > 1 ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 14 }}>
                  {tnsEmployes.map((c) => (
                    <div key={c.emp.id} style={{
                      ...card,
                      marginBottom: 0,
                      background: "#faf7f2",
                      textAlign: "center",
                      padding: "16px 14px",
                    }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: "50%",
                        background: "#A0845C", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, fontWeight: 700,
                        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                        margin: "0 auto 8px",
                      }}>
                        {(c.emp.prenom?.[0] ?? "").toUpperCase()}{(c.emp.nom?.[0] ?? "").toUpperCase()}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>
                        {c.emp.prenom} {c.emp.nom}
                      </div>
                      <div style={badgeStyle("#A0845C")}>TNS</div>
                    </div>
                  ))}
                </div>

                {/* Revenu slider */}
                <div style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={labelStyle}>Remuneration nette mensuelle</span>
                    <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                      {tnsRevenu.toLocaleString("fr-FR")} EUR
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1000} max={10000} step={100}
                    value={tnsRevenu}
                    onChange={(e) => setTnsRevenu(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "#A0845C" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#999", marginTop: 2 }}>
                    <span>1 000</span>
                    <span>10 000</span>
                  </div>
                </div>

                {/* KPI */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                  <KpiCard label="Charges TNS" value={`${fmt(tnsRevenu * TAUX_CHARGES_TNS)} EUR`} color="#A0845C" />
                  <KpiCard label="Cout total" value={`${fmt(tnsCoutParPersonne)} EUR`} />
                  <KpiCard label="Taux charges" value={`${TNS_TOTAL_TAUX.toFixed(1)}%`} />
                </div>

                {/* Decomposition */}
                <div style={card}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: "#1a1a1a" }}>
                    Decomposition des cotisations TNS
                  </div>
                  <table style={{ ...tableStyle, fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: "left" }}>Cotisation</th>
                        <th style={thR}>Taux</th>
                        <th style={thR}>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TNS_DETAIL.map((d) => {
                        const montant = tnsRevenu * (d.taux / 100);
                        return (
                          <tr key={d.label} style={trStyle}>
                            <td style={td}>{d.label}</td>
                            <td style={tdR}>{d.taux.toFixed(2)}%</td>
                            <td style={{ ...tdR, fontWeight: 600 }}>{fmt(montant)} EUR</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={totalRow}>
                        <td style={td}><strong>Total charges</strong></td>
                        <td style={tdR}><strong>{TNS_TOTAL_TAUX.toFixed(2)}%</strong></td>
                        <td style={tdR}><strong>{fmt(tnsRevenu * TNS_TOTAL_TAUX / 100)} EUR</strong></td>
                      </tr>
                    </tfoot>
                  </table>

                  <div style={{
                    marginTop: 14, padding: "10px 14px", borderRadius: 8,
                    background: "rgba(160,132,92,0.06)", border: "1px solid rgba(160,132,92,0.15)",
                    fontSize: 12, color: "#6f6a61", fontStyle: "italic",
                  }}>
                    TNS comptabilise en mensuel fixe, pas a l&apos;heure.
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ TAB 3: SIMULATEUR ═══ */}
        {tab === "simulateur" && (
          <>
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Simulateur d&apos;embauche</div>
                <button type="button" onClick={addSimRow} style={addBtnStyle}>+ Ajouter un collaborateur</button>
              </div>

              {simRows.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: "#999", fontSize: 13 }}>
                  Ajoutez un collaborateur pour simuler l&apos;impact sur la masse salariale.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {simRows.map((r) => {
                    const heuresMois = r.heures * 52 / 12;
                    const charges = r.brut * TAUX_CHARGES_PATRONALES;
                    const fillon = calcFillon(r.brut, heuresMois);
                    const cout = r.brut + charges - fillon;
                    const eurH = heuresMois > 0 ? cout / heuresMois : 0;

                    return (
                      <div key={r.id} style={simCard}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <input
                            style={{ ...inputStyle, maxWidth: 180, fontWeight: 600 }}
                            value={r.nom}
                            onChange={(e) => updateSim(r.id, { nom: e.target.value })}
                          />
                          <button type="button" onClick={() => removeSim(r.id)} style={removeBtnStyle}>Retirer</button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                          <div>
                            <div style={miniLabel}>Type</div>
                            <select style={inputStyle} value={r.type} onChange={(e) => updateSim(r.id, { type: e.target.value })}>
                              <option value="CDI">CDI</option>
                              <option value="CDD">CDD</option>
                              <option value="extra">Extra</option>
                              <option value="apprenti">Apprenti</option>
                            </select>
                          </div>
                          <div>
                            <div style={miniLabel}>Remplace</div>
                            <select style={inputStyle} value={r.remplace} onChange={(e) => updateSim(r.id, { remplace: e.target.value })}>
                              <option value="nouveau">Nouveau poste</option>
                              {costs.map((c) => (
                                <option key={c.emp.id} value={c.emp.id}>
                                  {c.emp.prenom} {c.emp.nom}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                          <div>
                            <div style={miniLabel}>Salaire brut mensuel</div>
                            <input
                              type="range" min={1400} max={4000} step={50}
                              value={r.brut}
                              onChange={(e) => updateSim(r.id, { brut: Number(e.target.value) })}
                              style={{ width: "100%", accentColor: "#e27f57" }}
                            />
                            <div style={{ fontSize: 13, fontWeight: 700, textAlign: "center" }}>{fmt(r.brut)} EUR</div>
                          </div>
                          <div>
                            <div style={miniLabel}>Heures / semaine</div>
                            <input
                              type="range" min={10} max={45} step={1}
                              value={r.heures}
                              onChange={(e) => updateSim(r.id, { heures: Number(e.target.value) })}
                              style={{ width: "100%", accentColor: "#e27f57" }}
                            />
                            <div style={{ fontSize: 13, fontWeight: 700, textAlign: "center" }}>{r.heures}h</div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#6f6a61", flexWrap: "wrap" }}>
                          <span>Charges : <strong>{fmt(charges)} EUR</strong></span>
                          {fillon > 0 && <span>Fillon : <strong style={{ color: "#4a6741" }}>-{fmt(fillon)} EUR</strong></span>}
                          <span>Cout : <strong style={{ color: "#1a1a1a" }}>{fmt(cout)} EUR</strong></span>
                          <span>EUR/h : <strong>{eurH.toFixed(2)}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Impact panel */}
            {simRows.length > 0 && (
              <div style={card}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: "#1a1a1a" }}>Impact</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={miniLabel}>MS actuelle</div>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                      {fmt(totalMS)} EUR
                    </div>
                  </div>
                  <div>
                    <div style={miniLabel}>MS projetee</div>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", color: "#e27f57" }}>
                      {fmt(msProjetee)} EUR
                    </div>
                  </div>
                </div>

                {/* Ratio actuel */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "#6f6a61" }}>Ratio MS/CA actuel</span>
                    <span style={{ fontWeight: 700, color: ratioMS <= OBJECTIF_MS_CA ? "#4a6741" : "#DC2626" }}>
                      {ratioMS.toFixed(1)}%
                    </span>
                  </div>
                  <div style={barBg}>
                    <div style={{ ...barFill, width: `${Math.min((ratioMS / 50) * 100, 100)}%`, background: ratioMS <= OBJECTIF_MS_CA ? "#4a6741" : "#DC2626" }} />
                  </div>
                </div>

                {/* Ratio projete */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "#6f6a61" }}>Nouveau ratio MS/CA</span>
                    <span style={{ fontWeight: 700, color: ratioProjecte <= OBJECTIF_MS_CA ? "#4a6741" : "#DC2626" }}>
                      {ratioProjecte.toFixed(1)}%
                    </span>
                  </div>
                  <div style={barBg}>
                    <div style={{ ...barFill, width: `${Math.min((ratioProjecte / 50) * 100, 100)}%`, background: "#e27f57" }} />
                  </div>
                </div>

                {/* Impact annuel */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{
                    padding: "10px 14px", borderRadius: 8,
                    background: "rgba(226,127,87,0.04)", border: "1px solid rgba(226,127,87,0.2)",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>Impact annuel</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: msProjetee > totalMS ? "#DC2626" : "#4a6741", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                      {msProjetee > totalMS ? "+" : ""}{fmt((msProjetee - totalMS) * 12)} EUR
                    </div>
                  </div>
                  <div style={{
                    padding: "10px 14px", borderRadius: 8,
                    background: "rgba(226,127,87,0.04)", border: "1px solid rgba(226,127,87,0.2)",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      CA pour {OBJECTIF_MS_CA}%
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                      {fmt(msProjetee / (OBJECTIF_MS_CA / 100))} EUR/mois
                    </div>
                    <div style={{ fontSize: 11, color: "#999" }}>
                      soit {fmt(msProjetee / (OBJECTIF_MS_CA / 100) * 12)} EUR/an
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </RequireRole>
  );
}

/* ── Sub-components ── */

function KpiCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={kpiStyle}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: color ?? "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#999" }}>{sub}</div>}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────── */

const pageStyle: React.CSSProperties = { maxWidth: 900, margin: "0 auto", padding: "16px 16px 60px" };

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22, fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 1, color: "#1a1a1a",
};

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #ddd6c8",
  borderRadius: 10, padding: "16px 16px", marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "#6f6a61", letterSpacing: 0.3,
};

const miniLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#999", marginBottom: 4,
  textTransform: "uppercase", letterSpacing: 0.5,
};

const pillBtn = (active: boolean): React.CSSProperties => ({
  padding: "6px 14px", borderRadius: 20,
  border: active ? "1px solid #e27f57" : "1px solid #ddd6c8",
  background: active ? "#e27f57" : "#fff",
  color: active ? "#fff" : "#1a1a1a",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
});

const kpiStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #ddd6c8",
  borderRadius: 10, padding: "10px 12px", textAlign: "center",
};

const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: 13,
};

const th: React.CSSProperties = {
  textAlign: "left", padding: "8px 8px",
  fontSize: 10, fontWeight: 700, color: "#999",
  textTransform: "uppercase", letterSpacing: 0.5,
  borderBottom: "1px solid #ddd6c8",
};

const thR: React.CSSProperties = { ...th, textAlign: "right" };

const td: React.CSSProperties = {
  padding: "8px 8px", borderBottom: "1px solid #f0ebe3",
};

const tdR: React.CSSProperties = { ...td, textAlign: "right", fontSize: 13 };

const trStyle: React.CSSProperties = {};

const totalRow: React.CSSProperties = {
  background: "#1a1a1a", color: "#fff",
};

const badgeStyle = (color: string): React.CSSProperties => ({
  display: "inline-block", padding: "2px 8px", borderRadius: 6,
  background: `${color}18`, color, fontSize: 11, fontWeight: 700,
  marginTop: 6,
});

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", borderRadius: 8,
  border: "1px solid #ddd6c8", fontSize: 13, background: "#fff",
  outline: "none", boxSizing: "border-box",
};

const barBg: React.CSSProperties = {
  height: 6, borderRadius: 3, background: "#f0ebe3", overflow: "hidden",
};

const barFill: React.CSSProperties = {
  height: "100%", borderRadius: 3, transition: "width 0.3s",
};

const simCard: React.CSSProperties = {
  padding: 14, borderRadius: 10, border: "1px solid #f0ebe3",
  background: "#faf7f2",
};

const addBtnStyle: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 6, border: "none",
  background: "#e27f57", color: "#fff",
  fontSize: 12, fontWeight: 700, cursor: "pointer",
};

const removeBtnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6,
  border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)",
  color: "#DC2626", fontSize: 11, fontWeight: 700, cursor: "pointer",
};

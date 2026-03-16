"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

/* ── Types ─────────────────────────────────────────────────────── */

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  matricule: string | null;
  actif: boolean;
  contrats: {
    type: string;
    heures_semaine: number;
    salaire_brut: number | null;
    actif: boolean;
  }[];
};

type EtabSettings = {
  cotisations_patronales: number;
  taux_accident_travail: number;
  taux_horaire_moyen: number;
  valeur_avantage_nature: number;
  objectif_cout_ventes: number;
};

type EmpCost = {
  emp: Employe;
  contratType: string;
  heuresSemaine: number;
  brut: number;
  net: number;
  charges: number;
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
  brut: number;
  heures: number;
};

type Tab = "reel" | "tns" | "simulateur";

/* ── Constants ─────────────────────────────────────────────────── */

const SMIC_MENSUEL = 1766.92; // SMIC brut mensuel 2026
const SMIC_HORAIRE = 11.65;
const TAUX_FILLON_MAX = 0.3194; // HCR max
const FORFAIT_SOCIAL_TNS = 0.43; // ~43% charges TNS

const TNS_DETAIL = [
  { label: "Maladie-maternite", taux: 6.5 },
  { label: "Indemnites journalieres", taux: 0.85 },
  { label: "Retraite de base", taux: 17.75 },
  { label: "Retraite complementaire", taux: 7.0 },
  { label: "Invalidite-deces", taux: 1.3 },
  { label: "Alloc. familiales", taux: 3.1 },
  { label: "CSG / CRDS", taux: 9.7 },
  { label: "Formation pro.", taux: 0.25 },
];

/* ── Helpers ───────────────────────────────────────────────────── */

function calcFillon(brut: number, heuresMois: number): number {
  const smicMois = SMIC_HORAIRE * heuresMois;
  if (brut > smicMois * 1.6) return 0;
  const ratio = smicMois / brut;
  const coeff = Math.min(TAUX_FILLON_MAX, TAUX_FILLON_MAX / 0.6 * (1.6 * ratio - 1));
  return Math.max(0, coeff * brut);
}

function calcCharges(brut: number, tauxCharges: number): number {
  return brut * (tauxCharges / 100);
}

function calcNet(brut: number): number {
  return brut * 0.78; // ~22% cotisations salariales
}

function calcCostLine(emp: Employe, tauxCharges: number): EmpCost {
  const contrat = emp.contrats?.find((c) => c.actif);
  const isTNS = contrat?.type === "TNS";
  const heures = contrat?.heures_semaine ?? 0;
  const brut = contrat?.salaire_brut ?? 0;
  const heuresMois = heures * 52 / 12;

  if (isTNS) {
    return {
      emp, contratType: "TNS", heuresSemaine: 0,
      brut: 0, net: 0, charges: 0, fillon: 0,
      coutEmployeur: 0, tauxReel: 0, coutHoraire: 0, isTNS: true,
    };
  }

  const net = calcNet(brut);
  const charges = calcCharges(brut, tauxCharges);
  const fillon = calcFillon(brut, heuresMois);
  const coutEmployeur = brut + charges - fillon;
  const tauxReel = brut > 0 ? (charges - fillon) / brut * 100 : 0;
  const coutHoraire = heuresMois > 0 ? coutEmployeur / heuresMois : 0;

  return {
    emp, contratType: contrat?.type ?? "CDI", heuresSemaine: heures,
    brut, net, charges, fillon, coutEmployeur, tauxReel, coutHoraire, isTNS: false,
  };
}

/* ── Component ─────────────────────────────────────────────────── */

export default function MasseSalarialePage() {
  const { current: etab } = useEtablissement();
  const gestionHref = etab?.slug === "piccola_mia" ? "/piccola-mia/gestion" : "/bello-mio/gestion";

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [settings, setSettings] = useState<EtabSettings>({
    cotisations_patronales: 35,
    taux_accident_travail: 2.5,
    taux_horaire_moyen: 12.5,
    valeur_avantage_nature: 3.57,
    objectif_cout_ventes: 37,
  });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("reel");

  // Sliders
  const [caSimule, setCaSimule] = useState(80000);
  const [selectedTNS, setSelectedTNS] = useState<string | null>(null);
  const [tnsRevenu, setTnsRevenu] = useState(3000);

  // Simulateur
  const [simRows, setSimRows] = useState<SimRow[]>([]);

  /* ── Load ── */
  useEffect(() => {
    if (!etab) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [empRes, etabRes] = await Promise.all([
        supabase
          .from("employes")
          .select("id, prenom, nom, matricule, actif, contrats(type, heures_semaine, salaire_brut, actif)")
          .eq("etablissement_id", etab.id)
          .eq("actif", true)
          .order("nom"),
        supabase
          .from("etablissements")
          .select("cotisations_patronales, taux_accident_travail, taux_horaire_moyen, valeur_avantage_nature, objectif_cout_ventes")
          .eq("id", etab.id)
          .single(),
      ]);

      if (cancelled) return;
      setEmployes((empRes.data ?? []) as Employe[]);
      if (etabRes.data) {
        setSettings({
          cotisations_patronales: etabRes.data.cotisations_patronales ?? 35,
          taux_accident_travail: etabRes.data.taux_accident_travail ?? 2.5,
          taux_horaire_moyen: etabRes.data.taux_horaire_moyen ?? 12.5,
          valeur_avantage_nature: etabRes.data.valeur_avantage_nature ?? 3.57,
          objectif_cout_ventes: etabRes.data.objectif_cout_ventes ?? 37,
        });
      }

      // Auto-select first TNS
      const tns = (empRes.data ?? []).find((e: Employe) =>
        e.contrats?.some((c) => c.actif && c.type === "TNS"),
      );
      if (tns) setSelectedTNS(tns.id);

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [etab]);

  /* ── Costs ── */
  const costs = useMemo(() => {
    return employes
      .filter((e) => e.contrats?.some((c) => c.actif))
      .map((e) => calcCostLine(e, settings.cotisations_patronales));
  }, [employes, settings.cotisations_patronales]);

  const salaries = costs.filter((c) => !c.isTNS);
  const tnsEmployes = costs.filter((c) => c.isTNS);

  const totalMS = useMemo(() => {
    const salTotal = salaries.reduce((acc, c) => acc + c.coutEmployeur, 0);
    const tnsTotal = tnsEmployes.length * tnsRevenu * (1 + FORFAIT_SOCIAL_TNS);
    return salTotal + tnsTotal;
  }, [salaries, tnsEmployes.length, tnsRevenu]);

  const ratioMS = caSimule > 0 ? (totalMS / caSimule) * 100 : 0;
  const caNeeded = settings.objectif_cout_ventes > 0 ? totalMS / (settings.objectif_cout_ventes / 100) : 0;

  /* ── Simulateur: projected costs ── */
  const simCost = useMemo(() => {
    return simRows.reduce((acc, r) => {
      const heuresMois = r.heures * 52 / 12;
      const charges = calcCharges(r.brut, settings.cotisations_patronales);
      const fillon = calcFillon(r.brut, heuresMois);
      return acc + r.brut + charges - fillon;
    }, 0);
  }, [simRows, settings.cotisations_patronales]);

  const addSimRow = () => {
    setSimRows((prev) => [...prev, {
      id: crypto.randomUUID(),
      nom: `Collaborateur ${prev.length + 1}`,
      type: "CDI",
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

  /* ── Selected TNS details ── */
  const selectedTnsEmp = employes.find((e) => e.id === selectedTNS);
  const tnsCharges = tnsRevenu * FORFAIT_SOCIAL_TNS;
  const tnsCoutTotal = tnsRevenu + tnsCharges;

  if (loading) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <NavBar backHref={gestionHref} backLabel="Gestion" />
        <div style={pageStyle}><div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div></div>
      </RequireRole>
    );
  }

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <NavBar backHref={gestionHref} backLabel="Gestion" />

      <div style={pageStyle}>
        <div style={{ marginBottom: 16 }}>
          <div style={titleStyle}>Masse salariale</div>
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
                min={20000} max={200000} step={1000}
                value={caSimule}
                onChange={(e) => setCaSimule(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#D4775A" }}
              />
            </div>

            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
              <KpiCard label="Masse salariale" value={`${Math.round(totalMS).toLocaleString("fr-FR")} EUR`} />
              <KpiCard
                label="Ratio MS / CA"
                value={`${ratioMS.toFixed(1)}%`}
                color={ratioMS <= settings.objectif_cout_ventes ? "#4a6741" : "#DC2626"}
              />
              <KpiCard label="CA pour objectif" value={`${Math.round(caNeeded).toLocaleString("fr-FR")} EUR`} sub={`obj. ${settings.objectif_cout_ventes}%`} />
            </div>

            {/* Table */}
            <div style={card}>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={th}>Collaborateur</th>
                      <th style={th}>Statut</th>
                      <th style={thR}>Brut</th>
                      <th style={thR}>Charges</th>
                      <th style={thR}>Fillon</th>
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
                          {c.emp.matricule && <div style={{ fontSize: 10, color: "#999" }}>#{c.emp.matricule}</div>}
                        </td>
                        <td style={td}>
                          <span style={badgeStyle(c.contratType === "CDI" ? "#4a6741" : "#D4775A")}>
                            {c.contratType} {c.heuresSemaine}h
                          </span>
                        </td>
                        <td style={tdR}>{c.brut.toFixed(0)}</td>
                        <td style={tdR}>{c.charges.toFixed(0)}</td>
                        <td style={{ ...tdR, color: c.fillon > 0 ? "#4a6741" : "#ccc" }}>
                          {c.fillon > 0 ? `-${c.fillon.toFixed(0)}` : "—"}
                        </td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{c.coutEmployeur.toFixed(0)}</td>
                        <td style={tdR}>{c.tauxReel.toFixed(1)}%</td>
                        <td style={tdR}>{c.coutHoraire.toFixed(2)}</td>
                      </tr>
                    ))}
                    {tnsEmployes.map((c) => (
                      <tr key={c.emp.id} style={{ ...trStyle, opacity: 0.6 }}>
                        <td style={td}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.emp.prenom} {c.emp.nom}</div>
                        </td>
                        <td style={td}><span style={badgeStyle("#A0845C")}>TNS</span></td>
                        <td style={tdR} colSpan={5}>Cout fixe mensuel</td>
                        <td style={tdR}>{tnsCoutTotal.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={totalRow}>
                      <td style={td} colSpan={2}><strong>TOTAL</strong></td>
                      <td style={tdR}><strong>{salaries.reduce((a, c) => a + c.brut, 0).toFixed(0)}</strong></td>
                      <td style={tdR}><strong>{salaries.reduce((a, c) => a + c.charges, 0).toFixed(0)}</strong></td>
                      <td style={tdR}><strong>-{salaries.reduce((a, c) => a + c.fillon, 0).toFixed(0)}</strong></td>
                      <td style={{ ...tdR, fontWeight: 800 }}>{Math.round(totalMS).toLocaleString("fr-FR")}</td>
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
              <div style={card}><div style={{ textAlign: "center", padding: 20, color: "#999" }}>Aucun TNS actif</div></div>
            ) : (
              <>
                {/* TNS selector */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {tnsEmployes.map((c) => (
                    <button
                      key={c.emp.id}
                      type="button"
                      onClick={() => setSelectedTNS(c.emp.id)}
                      style={pillBtn(selectedTNS === c.emp.id)}
                    >
                      {c.emp.prenom} {c.emp.nom}
                    </button>
                  ))}
                </div>

                {selectedTnsEmp && (
                  <>
                    {/* Revenu slider */}
                    <div style={card}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={labelStyle}>Revenu net mensuel</span>
                        <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                          {tnsRevenu.toLocaleString("fr-FR")} EUR
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1000} max={8000} step={100}
                        value={tnsRevenu}
                        onChange={(e) => setTnsRevenu(Number(e.target.value))}
                        style={{ width: "100%", accentColor: "#A0845C" }}
                      />
                    </div>

                    {/* KPI */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                      <KpiCard label="Charges TNS" value={`${Math.round(tnsCharges)} EUR`} color="#A0845C" />
                      <KpiCard label="Cout reel" value={`${Math.round(tnsCoutTotal)} EUR`} />
                      <KpiCard label="Taux charges" value={`${(FORFAIT_SOCIAL_TNS * 100).toFixed(0)}%`} />
                    </div>

                    {/* Decomposition */}
                    <div style={card}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>
                        Decomposition cotisations — {selectedTnsEmp.prenom} {selectedTnsEmp.nom}
                      </div>
                      {TNS_DETAIL.map((d) => {
                        const montant = tnsRevenu * (d.taux / 100);
                        const pct = d.taux / (FORFAIT_SOCIAL_TNS * 100);
                        return (
                          <div key={d.label} style={{ marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                              <span style={{ color: "#6f6a61" }}>{d.label} ({d.taux}%)</span>
                              <span style={{ fontWeight: 600 }}>{montant.toFixed(0)} EUR</span>
                            </div>
                            <div style={barBg}>
                              <div style={{ ...barFill, width: `${pct * 100}%`, background: "#A0845C" }} />
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ marginTop: 12, fontSize: 12, color: "#6f6a61", fontStyle: "italic" }}>
                        TNS integre dans le planning mais cout mensuel fixe, pas horaire.
                      </div>
                    </div>
                  </>
                )}
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
                <button type="button" onClick={addSimRow} style={addBtnStyle}>+ Ajouter</button>
              </div>

              {simRows.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: "#999", fontSize: 13 }}>
                  Ajoutez un collaborateur pour simuler l&apos;impact sur la masse salariale.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {simRows.map((r) => {
                    const heuresMois = r.heures * 52 / 12;
                    const charges = calcCharges(r.brut, settings.cotisations_patronales);
                    const fillon = calcFillon(r.brut, heuresMois);
                    const cout = r.brut + charges - fillon;

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

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 8 }}>
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
                            <div style={miniLabel}>Brut mensuel</div>
                            <input
                              type="range" min={SMIC_MENSUEL} max={4000} step={50}
                              value={r.brut}
                              onChange={(e) => updateSim(r.id, { brut: Number(e.target.value) })}
                              style={{ width: "100%", accentColor: "#D4775A" }}
                            />
                            <div style={{ fontSize: 12, fontWeight: 700, textAlign: "center" }}>{r.brut.toFixed(0)} EUR</div>
                          </div>
                          <div>
                            <div style={miniLabel}>Heures/sem</div>
                            <input
                              type="range" min={10} max={43} step={1}
                              value={r.heures}
                              onChange={(e) => updateSim(r.id, { heures: Number(e.target.value) })}
                              style={{ width: "100%", accentColor: "#D4775A" }}
                            />
                            <div style={{ fontSize: 12, fontWeight: 700, textAlign: "center" }}>{r.heures}h</div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#6f6a61" }}>
                          <span>Charges : <strong>{charges.toFixed(0)} EUR</strong></span>
                          {fillon > 0 && <span>Fillon : <strong style={{ color: "#4a6741" }}>-{fillon.toFixed(0)} EUR</strong></span>}
                          <span>Cout : <strong style={{ color: "#1a1a1a" }}>{cout.toFixed(0)} EUR</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Comparison */}
            {simRows.length > 0 && (
              <div style={card}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: "#1a1a1a" }}>Impact</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={miniLabel}>MS actuelle</div>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                      {Math.round(totalMS).toLocaleString("fr-FR")} EUR
                    </div>
                  </div>
                  <div>
                    <div style={miniLabel}>MS projetee</div>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", color: "#D4775A" }}>
                      {Math.round(totalMS + simCost).toLocaleString("fr-FR")} EUR
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "#6f6a61" }}>Ratio MS/CA actuel</span>
                    <span style={{ fontWeight: 700, color: ratioMS <= settings.objectif_cout_ventes ? "#4a6741" : "#DC2626" }}>
                      {ratioMS.toFixed(1)}%
                    </span>
                  </div>
                  <div style={barBg}>
                    <div style={{ ...barFill, width: `${Math.min(ratioMS, 100)}%`, background: ratioMS <= settings.objectif_cout_ventes ? "#4a6741" : "#DC2626" }} />
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "#6f6a61" }}>Ratio projete</span>
                    <span style={{ fontWeight: 700, color: (totalMS + simCost) / caSimule * 100 <= settings.objectif_cout_ventes ? "#4a6741" : "#DC2626" }}>
                      {caSimule > 0 ? ((totalMS + simCost) / caSimule * 100).toFixed(1) : "—"}%
                    </span>
                  </div>
                  <div style={barBg}>
                    <div style={{ ...barFill, width: `${Math.min(caSimule > 0 ? (totalMS + simCost) / caSimule * 100 : 0, 100)}%`, background: "#D4775A" }} />
                  </div>
                </div>

                <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(212,119,90,0.04)", border: "1px solid rgba(212,119,90,0.2)" }}>
                  <div style={{ fontSize: 12, color: "#6f6a61" }}>CA necessaire pour objectif {settings.objectif_cout_ventes}%</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                    {Math.round((totalMS + simCost) / (settings.objectif_cout_ventes / 100)).toLocaleString("fr-FR")} EUR/mois
                  </div>
                  <div style={{ fontSize: 12, color: "#6f6a61" }}>
                    soit {Math.round((totalMS + simCost) / (settings.objectif_cout_ventes / 100) * 12).toLocaleString("fr-FR")} EUR/an
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
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#999" }}>{sub}</div>}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────── */

const pageStyle: React.CSSProperties = { maxWidth: 900, margin: "0 auto", padding: "16px 16px 60px" };

const titleStyle: React.CSSProperties = {
  fontSize: 26, fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 1.5, textTransform: "uppercase", color: "#1a1a1a",
};

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #ddd6c8",
  borderRadius: 12, padding: "16px 16px", marginBottom: 12,
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
  border: active ? "1px solid #D4775A" : "1px solid #ddd6c8",
  background: active ? "#D4775A" : "#fff",
  color: active ? "#fff" : "#1a1a1a",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
});

const kpiStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #ddd6c8",
  borderRadius: 12, padding: "10px 14px", textAlign: "center",
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
  padding: "6px 14px", borderRadius: 20, border: "none",
  background: "#D4775A", color: "#fff",
  fontSize: 12, fontWeight: 700, cursor: "pointer",
};

const removeBtnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6,
  border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)",
  color: "#DC2626", fontSize: 11, fontWeight: 700, cursor: "pointer",
};

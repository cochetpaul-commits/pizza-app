"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { fetchApi } from "@/lib/fetchApi";

const eurFmt = (n: number) => Math.round(n).toLocaleString("fr-FR") + " \u20ac";
const pctFmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
const dec2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TAUX_CHARGES_PATRONALES = 0.45;
const TAUX_CHARGES_TNS = 0.465;

const C = {
  accent: "#3f7d8c", sal: "#3f7d8c", ger: "#e0a458", rest: "#e7e1d9",
  ok: "#4f8a5b", warn: "#d98b2b", bad: "#c0472e",
};

type SvcData = { svc: string; sp_ht: number; sp_cov: number; emp_ht: number; tm_sp_ht: number };

export function SimulateurRentabiliteMS() {
  const { current: etab } = useEtablissement();
  const etabId = etab?.id ?? null;
  const etabNom = etab?.nom ?? "";

  const [realLoading, setRealLoading] = useState(false);
  const [realLoaded, setRealLoaded] = useState(false);
  const [sourcePeriod, setSourcePeriod] = useState("");

  // Ticket moyens par service
  const [tmMidiSP, setTmMidiSP] = useState(0);
  const [tmSoirSP, setTmSoirSP] = useState(0);
  const [tmEmporter, setTmEmporter] = useState(0);
  const [cvMidiJour, setCvMidiJour] = useState(0);
  const [cvSoirJour, setCvSoirJour] = useState(0);
  const [cvEmpJour, setCvEmpJour] = useState(0);

  // MS
  const [msSal, setMsSal] = useState(0);
  const [msGer, setMsGer] = useState(0);
  const [gerants, setGerants] = useState<{ nom: string; cout: number }[]>([]);
  const [jours, setJours] = useState(26);
  const [obj, setObj] = useState(35);

  // Sliders
  const [cvSlider, setCvSlider] = useState(150);
  const [tmSlider, setTmSlider] = useState(20);
  const tmMoyen = useMemo(() => {
    const totalCov = cvMidiJour + cvSoirJour + cvEmpJour;
    if (totalCov <= 0) return 0;
    return (tmMidiSP * cvMidiJour + tmSoirSP * cvSoirJour + tmEmporter * cvEmpJour) / totalCov;
  }, [tmMidiSP, tmSoirSP, tmEmporter, cvMidiJour, cvSoirJour, cvEmpJour]);
  const cvTotal = cvMidiJour + cvSoirJour + cvEmpJour;

  // Load real data
  useEffect(() => {
    if (!etabId) return;
    let cancelled = false;

    (async () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRealLoading(true);

      // Previous full month
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevLastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      const from = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-01`;
      const to = `${prevLastDay.getFullYear()}-${String(prevLastDay.getMonth() + 1).padStart(2, "0")}-${String(prevLastDay.getDate()).padStart(2, "0")}`;
      const periodLabel = prevMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

      const [statsRes, contratsRes] = await Promise.all([
        fetchApi(`/api/ventes/stats?etablissement_id=${etabId}&from=${from}&to=${to}`).then(r => r.json()).catch(() => null),
        supabase.from("contrats")
          .select("type, salaire_brut, remuneration, heures_semaine, employes!inner(prenom, nom, actif, etablissement_id)")
          .eq("actif", true).eq("employes.actif", true).eq("employes.etablissement_id", etabId),
      ]);

      if (cancelled) return;

      // Parse ventes
      const stats = statsRes?.stats;
      const nbDays = stats?.dates?.length ?? 0;
      const svcs = (stats?.services ?? []) as SvcData[];

      let midiSPHt = 0, midiSPCov = 0, soirSPHt = 0, soirSPCov = 0;
      let empHtTotal = 0, empTickets = 0;

      for (const s of svcs) {
        if (s.svc === "midi") { midiSPHt += s.sp_ht; midiSPCov += s.sp_cov; }
        else if (s.svc === "soir") { soirSPHt += s.sp_ht; soirSPCov += s.sp_cov; }
        empHtTotal += s.emp_ht ?? 0;
      }
      // Emporter tickets: use cov_emp from stats
      const covEmp = stats?.cov_emp ?? 0;
      const empHt = stats?.place_emp_ht ?? 0;
      empTickets = covEmp;

      const tmMidi = midiSPCov > 0 ? midiSPHt / midiSPCov : 0;
      const tmSoir = soirSPCov > 0 ? soirSPHt / soirSPCov : 0;
      const tmEmp = empTickets > 0 ? empHt / empTickets : 0;

      if (nbDays > 0) {
        setTmMidiSP(Math.round(tmMidi * 100) / 100);
        setTmSoirSP(Math.round(tmSoir * 100) / 100);
        setTmEmporter(Math.round(tmEmp * 100) / 100);
        setCvMidiJour(Math.round(midiSPCov / nbDays));
        setCvSoirJour(Math.round(soirSPCov / nbDays));
        setCvEmpJour(Math.round(empTickets / nbDays));
        setJours(nbDays);
      }

      // Parse contrats
      let totalSal = 0;
      let totalGer = 0;
      const gerantsList: { nom: string; cout: number }[] = [];
      for (const c of (contratsRes.data ?? []) as unknown as { type: string; salaire_brut: number | null; remuneration: number | null; heures_semaine: number; employes: { prenom: string; nom: string } }[]) {
        const brut = Number(c.salaire_brut ?? c.remuneration) || 0;
        const t = (c.type ?? "").toLowerCase().trim();
        if (t === "tns") {
          const cout = brut * (1 + TAUX_CHARGES_TNS);
          totalGer += cout;
          gerantsList.push({ nom: `${c.employes.prenom} ${c.employes.nom}`, cout: Math.round(cout) });
        } else {
          totalSal += brut * (1 + TAUX_CHARGES_PATRONALES);
        }
      }

      setMsSal(Math.round(totalSal));
      setMsGer(Math.round(totalGer));
      setGerants(gerantsList);
      setSourcePeriod(periodLabel);

      // Init sliders with real values
      const totalCovJ = (nbDays > 0 ? Math.round((midiSPCov + soirSPCov + empTickets) / nbDays) : 150);
      const totalCovAll = midiSPCov + soirSPCov + empTickets;
      const tmGlobal = totalCovAll > 0 ? (midiSPHt + soirSPHt + empHt) / totalCovAll : 20;
      setCvSlider(totalCovJ);
      setTmSlider(Math.round(tmGlobal * 100) / 100);

      setRealLoaded(true);
      setRealLoading(false);
    })();

    return () => { cancelled = true; };
  }, [etabId]);

  const msTot = msSal + msGer;
  const denom = tmSlider * jours;

  const calc = useMemo(() => {
    const caMois = cvSlider * tmSlider * jours;
    const pTot = caMois > 0 ? (msTot / caMois) * 100 : 0;
    const cvX3 = denom > 0 ? Math.round((msSal * 3) / denom) : 0;
    const cvObjN = denom > 0 ? Math.round((msTot / (obj / 100)) / denom) : 0;
    const caMoisObj = msTot / (obj / 100);
    const pSalObj = caMoisObj > 0 ? (msSal / caMoisObj) * 100 : 0;
    const pGerObj = caMoisObj > 0 ? (msGer / caMoisObj) * 100 : 0;
    return { caMois, pTot, cvX3, cvObjN, caMoisObj, pSalObj, pGerObj };
  }, [tmSlider, cvSlider, msSal, msGer, msTot, jours, obj, denom]);

  const liveStatus = calc.pTot <= obj ? "ok" : calc.pTot <= obj + 5 ? "warn" : "bad";

  const inputStyle = {
    width: "100%", padding: "9px 11px", border: "1px solid #e7e1d9", borderRadius: 9,
    fontSize: 15, fontWeight: 600 as const, textAlign: "right" as const, paddingRight: 34,
    color: "#25211d", background: "#fbfaf8", outline: "none",
  };
  const unitStyle = { position: "absolute" as const, right: 11, color: "#8a8079", fontSize: 13, pointerEvents: "none" as const };
  const fieldStyle = { display: "flex" as const, flexDirection: "column" as const };
  const labelStyle = { fontSize: 12.5, fontWeight: 600 as const, marginBottom: 5 };
  const tagStyle = { fontSize: 11, color: "#8a8079", fontWeight: 500 as const };

  return (
    <div>
      {realLoading && (
        <div style={{ fontSize: 12, color: "#8a8079", marginBottom: 12, fontStyle: "italic" }}>
          Chargement des donnees {etabNom}...
        </div>
      )}
      {realLoaded && (
        <div style={{ background: "#eef4f5", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "#3a5157", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>&#9432;</span>
          <span>
            Donnees <b>{etabNom}</b> — <b>{sourcePeriod}</b>. Ajustez les valeurs si besoin.
          </span>
        </div>
      )}

      {/* Tickets moyens par service */}
      <div style={{ background: "#fff", border: "1px solid #e7e1d9", borderRadius: 16, padding: "16px 18px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8079", marginBottom: 12, fontWeight: 600 }}>
          Tickets moyens et couverts par service
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {/* Midi */}
          <div style={{ background: "#fbfaf8", borderRadius: 12, padding: 14, border: "1px solid #e7e1d9" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#8a8079", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Midi sur place</div>
            <div style={fieldStyle}>
              <label style={labelStyle}>TM HT</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input type="number" value={tmMidiSP} step={0.1} onChange={e => setTmMidiSP(parseFloat(e.target.value) || 0)} style={inputStyle} />
                <span style={unitStyle}>€</span>
              </div>
            </div>
            <div style={{ ...fieldStyle, marginTop: 8 }}>
              <label style={labelStyle}>Couverts/jour</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input type="number" value={cvMidiJour} step={1} onChange={e => setCvMidiJour(parseInt(e.target.value) || 0)} style={inputStyle} />
              </div>
            </div>
          </div>
          {/* Soir */}
          <div style={{ background: "#fbfaf8", borderRadius: 12, padding: 14, border: "1px solid #e7e1d9" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#8a8079", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Soir sur place</div>
            <div style={fieldStyle}>
              <label style={labelStyle}>TM HT</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input type="number" value={tmSoirSP} step={0.1} onChange={e => setTmSoirSP(parseFloat(e.target.value) || 0)} style={inputStyle} />
                <span style={unitStyle}>€</span>
              </div>
            </div>
            <div style={{ ...fieldStyle, marginTop: 8 }}>
              <label style={labelStyle}>Couverts/jour</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input type="number" value={cvSoirJour} step={1} onChange={e => setCvSoirJour(parseInt(e.target.value) || 0)} style={inputStyle} />
              </div>
            </div>
          </div>
          {/* Emporter */}
          <div style={{ background: "#fbfaf8", borderRadius: 12, padding: 14, border: "1px solid #e7e1d9" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#8a8079", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Emporter</div>
            <div style={fieldStyle}>
              <label style={labelStyle}>TM HT</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input type="number" value={tmEmporter} step={0.1} onChange={e => setTmEmporter(parseFloat(e.target.value) || 0)} style={inputStyle} />
                <span style={unitStyle}>€</span>
              </div>
            </div>
            <div style={{ ...fieldStyle, marginTop: 8 }}>
              <label style={labelStyle}>Tickets/jour</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input type="number" value={cvEmpJour} step={1} onChange={e => setCvEmpJour(parseInt(e.target.value) || 0)} style={inputStyle} />
              </div>
            </div>
          </div>
        </div>
        {/* Resume */}
        <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 13, fontWeight: 600, color: "#25211d", flexWrap: "wrap" }}>
          <span>TM global : <b style={{ color: C.accent }}>{dec2(tmMoyen)} €</b></span>
          <span>Couverts/jour total : <b style={{ color: C.accent }}>{cvTotal}</b></span>
          <span>Jours ouverts : <input type="number" value={jours} onChange={e => setJours(parseInt(e.target.value) || 1)} style={{ width: 50, textAlign: "center", border: "1px solid #e7e1d9", borderRadius: 6, fontSize: 13, fontWeight: 700, padding: "2px 4px" }} /> j/mois</span>
        </div>
      </div>

      {/* Masse salariale */}
      <div style={{ background: "#fff", border: "1px solid #e7e1d9", borderRadius: 16, padding: "16px 18px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8079", marginBottom: 12, fontWeight: 600 }}>
          Masse salariale
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Salaries <span style={tagStyle}>(cout charge /mois)</span></label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input type="number" value={msSal} step={100} onChange={e => setMsSal(parseFloat(e.target.value) || 0)} style={inputStyle} />
              <span style={unitStyle}>€</span>
            </div>
            <div style={{ fontSize: 11, color: "#8a8079", marginTop: 4 }}>Brut + charges patronales ~{Math.round(TAUX_CHARGES_PATRONALES * 100)}%</div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Gerant(s) / TNS <span style={tagStyle}>(cout charge /mois)</span></label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input type="number" value={msGer} step={100} onChange={e => setMsGer(parseFloat(e.target.value) || 0)} style={inputStyle} />
              <span style={unitStyle}>€</span>
            </div>
            {gerants.length > 0 ? (
              <div style={{ fontSize: 11, color: "#8a8079", marginTop: 4 }}>
                {gerants.map((g, i) => <span key={i}>{i > 0 ? " + " : ""}{g.nom} ({eurFmt(g.cout)})</span>)}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: C.bad, marginTop: 4, fontWeight: 600 }}>
                Aucun gerant TNS enregistre. Ajoutez un contrat TNS dans Personnel &gt; Employes.
              </div>
            )}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Objectif MS totale <span style={tagStyle}>(% du CA HT)</span></label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input type="number" value={obj} step={0.5} min={20} max={60} onChange={e => setObj(parseFloat(e.target.value) || 35)} style={inputStyle} />
              <span style={unitStyle}>%</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", padding: "12px 0" }}>
            <div>
              <div style={{ fontSize: 12, color: "#8a8079", fontWeight: 600 }}>MS totale chargee</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#25211d" }}>{eurFmt(msTot)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Curseurs */}
      <div style={{ background: "#fff", border: "1px solid #e7e1d9", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8079", marginBottom: 6, fontWeight: 600 }}>
          Fais varier ton activite
        </h2>

        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Ticket moyen HT <span style={{ fontSize: 20, color: C.accent, fontWeight: 700 }}>{dec2(tmSlider)} €</span>
          </label>
          <input type="range" min={5} max={100} step={0.05} value={tmSlider} onChange={e => setTmSlider(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: C.accent }} />
          <div style={{ fontSize: 12, color: "#8a8079", marginTop: 7 }}>Base reelle : {dec2(tmMoyen)} € HT (pondere midi/soir/emporter)</div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Couverts / jour <span style={{ fontSize: 20, color: C.accent, fontWeight: 700 }}>{Math.round(cvSlider)}</span>
          </label>
          <input type="range" min={10} max={600} step={1} value={cvSlider} onChange={e => setCvSlider(parseInt(e.target.value))}
            style={{ width: "100%", accentColor: C.accent }} />
          <div style={{ fontSize: 12, color: "#8a8079", marginTop: 7 }}>Base reelle : {cvTotal} couverts/jour (midi {cvMidiJour} + soir {cvSoirJour} + emporter {cvEmpJour})</div>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12,
          fontSize: 14, fontWeight: 600, marginTop: 14,
          background: liveStatus === "ok" ? "#eaf4ec" : liveStatus === "warn" ? "#fbf1e0" : "#f8e8e3",
          color: liveStatus === "ok" ? C.ok : liveStatus === "warn" ? C.warn : C.bad,
        }}>
          <span>{liveStatus === "ok" ? "\u2713" : liveStatus === "warn" ? "!" : "\u2715"}</span>
          <span>
            CA HT <b>{eurFmt(calc.caMois)}</b>/mois → MS = <b>{pctFmt(calc.pTot)}</b> du CA
            {calc.pTot <= obj ? ` (objectif ${obj} % atteint)` : ` (au-dessus de ${obj} %)`}
          </span>
        </div>
      </div>

      {/* Escalier */}
      <div style={{ background: "#fff", border: "1px solid #e7e1d9", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8079", marginBottom: 6, fontWeight: 600 }}>
          Combien tu dois faire au minimum
        </h2>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ border: "1px solid #e7e1d9", borderRadius: 14, padding: 18, background: "#fbfaf8" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#8a8079", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Plancher</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Ton equipe se paie</div>
            <div style={{ fontSize: 12.5, color: "#8a8079", marginBottom: 14 }}>CA minimum pour financer les salaries (cout x3). Montants HT.</div>
            <div style={{ fontSize: 11, color: "#8a8079", textTransform: "uppercase", letterSpacing: ".04em" }}>couverts / jour</div>
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, marginTop: 2 }}>{denom > 0 ? calc.cvX3 : "\u2014"}</div>
            <div style={{ marginTop: 14 }}>
              <Row label="CA HT / jour" value={eurFmt(calc.cvX3 * tmSlider)} first />
              <Row label="CA HT / mois" value={eurFmt(calc.cvX3 * tmSlider * jours)} />
            </div>
          </div>

          <div style={{ textAlign: "center", fontSize: 12.5, color: "#8a8079", fontWeight: 600, padding: "9px 0" }}>
            {calc.cvObjN >= calc.cvX3
              ? "\u2193 pour te payer toi aussi, il faut monter a \u2193"
              : "\u2713 a cet objectif, ta remu est deja couverte"}
          </div>

          <div style={{ border: "2px solid " + C.accent, borderRadius: 14, padding: 18, background: "#eef4f5" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
              Objectif de masse salariale : {obj} %
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Tout le monde se paie, toi compris</div>
            <div style={{ fontSize: 12.5, color: "#8a8079", marginBottom: 14 }}>CA pour que salaries + gerant = objectif MS. Montants HT.</div>
            <div style={{ fontSize: 11, color: "#8a8079", textTransform: "uppercase", letterSpacing: ".04em" }}>couverts / jour</div>
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, marginTop: 2, color: C.accent }}>{denom > 0 ? calc.cvObjN : "\u2014"}</div>
            <div style={{ marginTop: 14 }}>
              <Row label="CA HT / jour" value={eurFmt(calc.cvObjN * tmSlider)} first />
              <Row label="CA HT / mois" value={eurFmt(calc.cvObjN * tmSlider * jours)} />
            </div>
          </div>
        </div>
      </div>

      {/* Repartition */}
      <div style={{ background: "#fff", border: "1px solid #e7e1d9", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8079", marginBottom: 6, fontWeight: 600 }}>
          Repartition du CA a l&apos;objectif
        </h2>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, marginBottom: 8 }}>
          <span><span style={{ ...dot, background: C.sal }} /> Salaries</span>
          <span><span style={{ ...dot, background: C.ger }} /> Gerant(s)</span>
          <span><span style={{ ...dot, background: C.rest }} /> Reste du CA</span>
        </div>
        <div style={{ height: 44, borderRadius: 10, overflow: "hidden", display: "flex", background: C.rest, margin: "6px 0 14px" }}>
          <span style={{ width: `${Math.min(calc.pSalObj, 100)}%`, background: C.sal, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, transition: "width .18s ease", whiteSpace: "nowrap", overflow: "hidden" }}>
            {calc.pSalObj > 12 ? pctFmt(calc.pSalObj) : ""}
          </span>
          <span style={{ width: `${Math.min(calc.pGerObj, 100 - calc.pSalObj)}%`, background: C.ger, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, transition: "width .18s ease", whiteSpace: "nowrap", overflow: "hidden" }}>
            {calc.pGerObj > 9 ? pctFmt(calc.pGerObj) : ""}
          </span>
        </div>
        <Row label="Salaries" value={`${eurFmt(msSal)} (${pctFmt(calc.pSalObj)})`} dotColor={C.sal} first />
        <Row label="Gerant(s)" value={`${eurFmt(msGer)} (${pctFmt(calc.pGerObj)})`} dotColor={C.ger} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderTop: "1px solid #e7e1d9", fontSize: 16 }}>
          <span style={{ fontWeight: 700 }}>Masse salariale totale</span>
          <span style={{ fontWeight: 700 }}>{eurFmt(msTot)} ({pctFmt(calc.pSalObj + calc.pGerObj)})</span>
        </div>
      </div>

      {/* Explications */}
      <div style={{ background: "#fff", border: "1px solid #e7e1d9", borderRadius: 16, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <details>
          <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: C.accent }}>Comment lire les deux paliers ?</summary>
          <div style={{ fontSize: 13, color: "#4a433d", marginTop: 10 }}>
            <p style={{ marginBottom: 9 }}>
              <b>Le plancher (regle du x3) :</b> chaque euro de salaire (charges comprises) doit generer ~3 € de CA HT.
              Applique a tes salaries, c&apos;est le minimum : en dessous, tu ne couvres meme pas les salaires.
            </p>
            <p style={{ marginBottom: 9 }}>
              <b>L&apos;objectif :</b> il verifie que ton activite paie tout le monde, toi compris.
              C&apos;est le vrai repere de rentabilite (souvent 30-45 % du CA HT en restauration).
              Un objectif de 33 % revient exactement a appliquer le x3 sur la MS totale.
            </p>
            <p>Le x3 reste un repere : ton vrai seuil depend aussi de ton cout matiere et de tes charges fixes.</p>
          </div>
        </details>
      </div>
    </div>
  );
}

const dot = { display: "inline-block", width: 11, height: 11, borderRadius: 3, marginRight: 6, verticalAlign: "middle" as const };

function Row({ label, value, dotColor, first }: { label: string; value: string; dotColor?: string; first?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderTop: first ? "none" : "1px solid #e7e1d9", fontSize: 14 }}>
      <span>{dotColor && <span style={{ ...dot, background: dotColor }} />}{label}</span>
      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

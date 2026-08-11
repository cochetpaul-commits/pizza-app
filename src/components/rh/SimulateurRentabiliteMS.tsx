"use client";

import { useState, useMemo } from "react";

const eur = (n: number) => Math.round(n).toLocaleString("fr-FR") + " \u20AC";
const pct = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
const dec2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const C = {
  accent: "#3f7d8c", sal: "#3f7d8c", ger: "#e0a458", rest: "#e7e1d9",
  ok: "#4f8a5b", warn: "#d98b2b", bad: "#c0472e",
};

export function SimulateurRentabiliteMS() {
  // Hypotheses
  const [tmBase, setTmBase] = useState(15);
  const [cvBase, setCvBase] = useState(150);
  const [msSal, setMsSal] = useState(12000);
  const [msGer, setMsGer] = useState(3000);
  const [jours, setJours] = useState(26);
  const [obj, setObj] = useState(35);

  // Sliders (initialized from base)
  const [tm, setTm] = useState(15);
  const [cv, setCv] = useState(150);

  const msTot = msSal + msGer;
  const denom = tm * jours;

  const calc = useMemo(() => {
    const caMois = cv * tm * jours;
    const pTot = caMois > 0 ? (msTot / caMois) * 100 : 0;

    // Escalier
    const cvX3 = denom > 0 ? Math.round((msSal * 3) / denom) : 0;
    const cvObjN = denom > 0 ? Math.round((msTot / (obj / 100)) / denom) : 0;

    // Repartition a l&apos;objectif
    const caMoisObj = msTot / (obj / 100);
    const pSalObj = caMoisObj > 0 ? (msSal / caMoisObj) * 100 : 0;
    const pGerObj = caMoisObj > 0 ? (msGer / caMoisObj) * 100 : 0;

    return { caMois, pTot, cvX3, cvObjN, caMoisObj, pSalObj, pGerObj };
  }, [tm, cv, msSal, msGer, msTot, jours, obj, denom]);

  const liveStatus = calc.pTot <= obj ? "ok" : calc.pTot <= obj + 5 ? "warn" : "bad";

  const inputStyle = {
    width: "100%", padding: "9px 11px", border: "1px solid #e7e1d9", borderRadius: 9,
    fontSize: 15, fontWeight: 600 as const, textAlign: "right" as const, paddingRight: 34,
    color: "#25211d", background: "#fbfaf8", outline: "none",
  };
  const unitStyle = { position: "absolute" as const, right: 11, color: "#8a8079", fontSize: 13, pointerEvents: "none" as const };

  return (
    <div>
      {/* Hypotheses */}
      <details open style={{ background: "#fff", border: "1px solid #e7e1d9", borderRadius: 16, padding: "16px 18px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <summary style={{ cursor: "pointer", fontSize: 15, fontWeight: 700, listStyle: "none" }}>
          Hypotheses de base
          <span style={{ fontSize: 12.5, color: "#8a8079", fontWeight: 500, marginLeft: 8 }}>
            MS {eur(msTot)} / {jours} j / objectif {obj} %
          </span>
        </summary>
        <div style={{ paddingTop: 16 }}>
          <div style={{ background: "#eef4f5", borderRadius: 10, padding: "11px 13px", fontSize: 12.5, color: "#3a5157", marginBottom: 14 }}>
            <b style={{ color: C.accent }}>Charges comprises :</b> indique ce que chaque personne coute reellement (brut + charges patronales), pas le net.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {([
              { label: "Ticket moyen HT", tag: "depense moyenne par client", value: tmBase, set: (v: number) => { setTmBase(v); setTm(v); }, unit: "\u20AC", step: 0.1 },
              { label: "Couverts / jour", tag: "clients servis par jour", value: cvBase, set: (v: number) => { setCvBase(v); setCv(v); }, unit: "", step: 1 },
              { label: "Masse salariale salaries", tag: "charges comprises, /mois", value: msSal, set: setMsSal, unit: "\u20AC", step: 100 },
              { label: "Remuneration gerant(e)", tag: "charges comprises, /mois", value: msGer, set: setMsGer, unit: "\u20AC", step: 100 },
              { label: "Jours ouverts", tag: "par mois", value: jours, set: setJours, unit: "j", step: 1 },
              { label: "Objectif MS totale", tag: "% du CA HT, souvent 30-45", value: obj, set: setObj, unit: "%", step: 0.5 },
            ] as const).map(f => (
              <div key={f.label} style={{ display: "flex", flexDirection: "column" }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>
                  {f.label} <span style={{ fontSize: 11, color: "#8a8079", fontWeight: 500 }}>({f.tag})</span>
                </label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input type="number" value={f.value} step={f.step}
                    onChange={e => f.set(parseFloat(e.target.value) || 0)}
                    style={inputStyle} />
                  {f.unit && <span style={unitStyle}>{f.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>

      {/* Curseurs */}
      <div style={{ background: "#fff", border: "1px solid #e7e1d9", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8079", marginBottom: 6, fontWeight: 600 }}>
          Fais varier ton activite
        </h2>

        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Ticket moyen HT <span style={{ fontSize: 20, color: C.accent, fontWeight: 700 }}>{dec2(tm)} \u20AC</span>
          </label>
          <input type="range" min={5} max={100} step={0.05} value={tm} onChange={e => setTm(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: C.accent }} />
          <div style={{ fontSize: 12, color: "#8a8079", marginTop: 7 }}>Base : {dec2(tmBase)} \u20AC HT</div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Couverts / jour <span style={{ fontSize: 20, color: C.accent, fontWeight: 700 }}>{Math.round(cv)}</span>
          </label>
          <input type="range" min={10} max={600} step={1} value={cv} onChange={e => setCv(parseInt(e.target.value))}
            style={{ width: "100%", accentColor: C.accent }} />
          <div style={{ fontSize: 12, color: "#8a8079", marginTop: 7 }}>Base : {cvBase} couverts/jour</div>
        </div>

        {/* Live indicator */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12,
          fontSize: 14, fontWeight: 600, marginTop: 14,
          background: liveStatus === "ok" ? "#eaf4ec" : liveStatus === "warn" ? "#fbf1e0" : "#f8e8e3",
          color: liveStatus === "ok" ? C.ok : liveStatus === "warn" ? C.warn : C.bad,
        }}>
          <span>{liveStatus === "ok" ? "\u2713" : liveStatus === "warn" ? "!" : "\u2715"}</span>
          <span>
            A cette activite : CA HT <b>{eur(calc.caMois)}</b>/mois → MS = <b>{pct(calc.pTot)}</b> du CA
            {calc.pTot <= obj
              ? ` (sous l&apos;objectif de ${obj} %)`
              : ` (au-dessus de l&apos;objectif de ${obj} %)`}
          </span>
        </div>
      </div>

      {/* Escalier */}
      <div style={{ background: "#fff", border: "1px solid #e7e1d9", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8079", marginBottom: 6, fontWeight: 600 }}>
          Combien tu dois faire au minimum
        </h2>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Plancher */}
          <div style={{ border: "1px solid #e7e1d9", borderRadius: 14, padding: 18, background: "#fbfaf8" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#8a8079", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Plancher</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Ton equipe se paie</div>
            <div style={{ fontSize: 12.5, color: "#8a8079", marginBottom: 14 }}>CA minimum pour financer les salaries (cout x3). Montants HT.</div>
            <div style={{ fontSize: 11, color: "#8a8079", textTransform: "uppercase", letterSpacing: ".04em" }}>couverts / jour</div>
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, marginTop: 2 }}>{denom > 0 ? calc.cvX3 : "\u2014"}</div>
            <div style={{ marginTop: 14 }}>
              <Row label="CA HT / jour" value={eur(calc.cvX3 * tm)} first />
              <Row label="CA HT / mois" value={eur(calc.cvX3 * tm * jours)} />
            </div>
          </div>

          <div style={{ textAlign: "center", fontSize: 12.5, color: "#8a8079", fontWeight: 600, padding: "9px 0" }}>
            {calc.cvObjN >= calc.cvX3
              ? "\u2193 pour te payer toi aussi, il faut monter a \u2193"
              : "\u2713 a cet objectif, ta remu est deja couverte"}
          </div>

          {/* Objectif */}
          <div style={{ border: "2px solid " + C.accent, borderRadius: 14, padding: 18, background: "#eef4f5" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
              Objectif de masse salariale : {obj} %
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Tout le monde se paie, toi compris</div>
            <div style={{ fontSize: 12.5, color: "#8a8079", marginBottom: 14 }}>CA pour que salaries + gerant = objectif MS. Montants HT.</div>
            <div style={{ fontSize: 11, color: "#8a8079", textTransform: "uppercase", letterSpacing: ".04em" }}>couverts / jour</div>
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, marginTop: 2, color: C.accent }}>{denom > 0 ? calc.cvObjN : "\u2014"}</div>
            <div style={{ marginTop: 14 }}>
              <Row label="CA HT / jour" value={eur(calc.cvObjN * tm)} first />
              <Row label="CA HT / mois" value={eur(calc.cvObjN * tm * jours)} />
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
          <span><span style={{ ...dot, background: C.ger }} /> Gerant(e)</span>
          <span><span style={{ ...dot, background: C.rest }} /> Reste du CA</span>
        </div>
        {/* Bar */}
        <div style={{ height: 44, borderRadius: 10, overflow: "hidden", display: "flex", background: C.rest, margin: "6px 0 14px" }}>
          <span style={{ width: `${Math.min(calc.pSalObj, 100)}%`, background: C.sal, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, transition: "width .18s ease", whiteSpace: "nowrap", overflow: "hidden" }}>
            {calc.pSalObj > 12 ? pct(calc.pSalObj) : ""}
          </span>
          <span style={{ width: `${Math.min(calc.pGerObj, 100 - calc.pSalObj)}%`, background: C.ger, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, transition: "width .18s ease", whiteSpace: "nowrap", overflow: "hidden" }}>
            {calc.pGerObj > 9 ? pct(calc.pGerObj) : ""}
          </span>
        </div>
        <Row label="Salaries" value={pct(calc.pSalObj)} dotColor={C.sal} first />
        <Row label="Gerant(e)" value={pct(calc.pGerObj)} dotColor={C.ger} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderTop: "1px solid #e7e1d9", fontSize: 16 }}>
          <span style={{ fontWeight: 700 }}>Masse salariale totale</span>
          <span style={{ fontWeight: 700 }}>{pct(calc.pSalObj + calc.pGerObj)}</span>
        </div>
      </div>

      {/* Explications */}
      <div style={{ background: "#fff", border: "1px solid #e7e1d9", borderRadius: 16, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <details>
          <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: C.accent }}>Comment lire les deux paliers ?</summary>
          <div style={{ fontSize: 13, color: "#4a433d", marginTop: 10 }}>
            <p style={{ marginBottom: 9 }}>
              <b>Le plancher (regle du x3) :</b> chaque euro de salaire (charges comprises) doit generer ~3 \u20AC de CA HT.
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

"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Régime de croisière — remplace « Rentabilité MS ».
 *  1. Le réel : ticket moyen et couverts midi / soir / emporter (Popina)
 *  2. Le seuil : couverts à réaliser par jour pour couvrir les charges
 *     réelles (Pennylane, dernier mois complet) avec le food cost réel
 *  3. Le simulateur : CA, couverts, ticket moyen, capacité, équipe →
 *     combien de couverts, à quel ticket, avec combien de serveurs.
 */

type Svc = {
  date: string; jour: string; svc: "midi" | "soir"; ttc: number; ht: number; cov: number;
  sp_ttc: number; sp_ht: number; emp_ttc: number; emp_ht: number; sp_cov: number; emp_tickets: number;
};
type Stats = { dates: string[]; ca_ttc: number; ca_ht: number; services: Svc[] };
type Renta = {
  ca: { ht: number; ttc: number };
  lignes: { poste: string; montant: number | null; statut: string }[];
  margeBrute: { foodCostPct: number } | null;
  exploitationDetail: { libelle: string; montant: number }[];
};

const OSWALD = "var(--font-oswald), Oswald, sans-serif";
const CARD: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: "16px 18px", border: "1px solid #ddd6c8", marginBottom: 12 };
const SEC: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 };
const LAB: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.4 };
const eur0 = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
const eur2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const n1 = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDate = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

type Sim = {
  tmMidi: number; tmSoir: number; tmEmp: number;
  covMidi: number; covSoir: number; empJour: number;
  capMidi: number; capSoir: number; joursMois: number;
  foodCost: number; chargesFixes: number; gerants: number;
  salleMidi: number; salleSoir: number; cuisineMidi: number; cuisineSoir: number;
  hMidi: number; hSoir: number; coutHoraire: number; covParServeur: number;
  caCible: number;
};

function Num({ label, value, onChange, step = 1, suffix, min = 0 }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string; min?: number }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={LAB}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input type="number" value={Number.isFinite(value) ? value : ""} step={step} min={min}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, fontWeight: 600, color: "#1a1a1a", background: "#fff" }} />
        {suffix && <span style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap" }}>{suffix}</span>}
      </span>
    </label>
  );
}

function Col({ titre, couleur, lignes }: { titre: string; couleur: string; lignes: [string, string][] }) {
  return (
    <div style={{ flex: "1 1 150px", minWidth: 140, padding: "12px 14px", borderRadius: 12, background: "#faf7f2", borderTop: `3px solid ${couleur}` }}>
      <div style={{ ...LAB, color: couleur, marginBottom: 6 }}>{titre}</div>
      {lignes.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: "#8a8378" }}>{k}</span>
          <span style={{ fontFamily: OSWALD, fontSize: 17, fontWeight: 700, color: "#1a1a1a", whiteSpace: "nowrap" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function SliderNum({ label, value, onChange, min, max, step, suffix, couleur }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; suffix?: string; couleur: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
        <span style={LAB}>{label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <input type="number" value={Number.isFinite(value) ? value : ""} step={step} min={0}
            onChange={e => onChange(Number(e.target.value))}
            style={{ width: 74, padding: "4px 6px", borderRadius: 7, border: "1px solid #ddd6c8", fontSize: 15, fontWeight: 700, fontFamily: OSWALD, color: "#1a1a1a", textAlign: "right", background: "#fff" }} />
          {suffix && <span style={{ fontSize: 11, color: "#999" }}>{suffix}</span>}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: couleur }} />
    </div>
  );
}

function ServiceCard({ titre, couleur, tm, onTm, cov, onCov, cap, onCap, ca, libelleCov = "Couverts / service", libelleTm = "Ticket moyen TTC" }: {
  titre: string; couleur: string; tm: number; onTm: (v: number) => void; cov: number; onCov: (v: number) => void;
  cap?: number; onCap?: (v: number) => void; ca: number; libelleCov?: string; libelleTm?: string;
}) {
  const taux = cap && cap > 0 ? cov / cap : null;
  const depasse = taux != null && taux > 1;
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${depasse ? "#DC2626" : "#ddd6c8"}`, borderTop: `3px solid ${couleur}`, padding: "12px 14px", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontFamily: OSWALD, fontSize: 15, fontWeight: 700, color: couleur, textTransform: "uppercase", letterSpacing: 0.5 }}>{titre}</span>
        <span style={{ fontFamily: OSWALD, fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>{eur0(ca)} <span style={{ fontSize: 10, color: "#999", fontFamily: "inherit", fontWeight: 600 }}>/ jour</span></span>
      </div>
      <SliderNum label={libelleTm} value={tm} onChange={onTm} min={10} max={80} step={0.5} suffix="€" couleur={couleur} />
      <SliderNum label={libelleCov} value={cov} onChange={onCov} min={0} max={cap ? Math.max(cap * 1.3, 10) : 120} step={1} couleur={couleur} />
      {cap != null && onCap && taux != null && (
        <div>
          <div style={{ height: 8, borderRadius: 4, background: "#f0ebe3", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, taux * 100)}%`, background: depasse ? "#DC2626" : taux > 0.9 ? "#b45309" : couleur, borderRadius: 4, transition: "width .15s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, fontSize: 10.5, color: depasse ? "#DC2626" : "#999", fontWeight: depasse ? 700 : 500 }}>
            <span>{depasse ? `Dépasse la capacité de ${cov - cap}` : `${Math.round(taux * 100)} % de la capacité`}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>capacité
              <input type="number" value={cap} min={1} onChange={e => onCap(Number(e.target.value))}
                style={{ width: 48, padding: "2px 4px", borderRadius: 5, border: "1px solid #ddd6c8", fontSize: 11, fontWeight: 700, textAlign: "right", color: "#1a1a1a", background: "#fff" }} />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ label, value, onChange, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string }) {
  const btn: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", cursor: "pointer", fontSize: 15, fontWeight: 700, color: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
  const r = (v: number) => Math.round(v * 100) / 100;
  return (
    <div>
      <div style={LAB}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
        <button type="button" onClick={() => onChange(Math.max(0, r(value - step)))} style={btn}>−</button>
        <span style={{ fontFamily: OSWALD, fontSize: 18, fontWeight: 700, color: "#1a1a1a", minWidth: 36, textAlign: "center" }}>{value}{suffix ?? ""}</span>
        <button type="button" onClick={() => onChange(r(value + step))} style={btn}>+</button>
      </div>
    </div>
  );
}

function Pill({ label, value, ok, warn }: { label: string; value: string; ok?: boolean; warn?: boolean }) {
  const bg = ok ? "rgba(165,214,167,0.28)" : warn ? "rgba(255,200,120,0.28)" : "rgba(255,255,255,0.16)";
  return (
    <div style={{ padding: "8px 12px", borderRadius: 10, background: bg, minWidth: 110 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontFamily: OSWALD, fontSize: 20, fontWeight: 700, color: "#fff", lineHeight: 1.15 }}>{value}</div>
    </div>
  );
}

function Objectif({ label, value, couleur, depasse }: { label: string; value: string; couleur: string; depasse?: boolean }) {
  return (
    <div style={{ padding: "8px 12px", borderRadius: 10, background: "#faf7f2", borderLeft: `3px solid ${depasse ? "#DC2626" : couleur}`, minWidth: 96 }}>
      <div style={LAB}>{label}</div>
      <div style={{ fontFamily: OSWALD, fontSize: 20, fontWeight: 700, color: depasse ? "#DC2626" : "#1a1a1a" }}>{value}</div>
    </div>
  );
}

export function CroisiereSimulateur({ etabId, etabColor }: { etabId: string; etabColor: string }) {
  const [semaines, setSemaines] = useState<4 | 8 | 12>(4);
  const [stats, setStats] = useState<Stats | null>(null);
  const [renta, setRenta] = useState<Renta | null>(null);
  const [loading, setLoading] = useState(true);
  const [sim, setSim] = useState<Sim | null>(null);

  // ── Chargement réel (ventes) + charges (Pennylane, dernier mois complet) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const to = new Date(); to.setDate(to.getDate() - 1);
      const from = new Date(to); from.setDate(from.getDate() - semaines * 7 + 1);
      const m0 = new Date(); m0.setDate(1); m0.setMonth(m0.getMonth() - 1);
      const m1 = new Date(); m1.setDate(0);
      const [s, r] = await Promise.all([
        fetch(`/api/ventes/stats?etablissement_id=${etabId}&from=${iso(from)}&to=${iso(to)}`).then(x => x.json()).catch(() => null),
        fetch(`/api/rentabilite?etablissement_id=${etabId}&from=${iso(m0)}&to=${iso(m1)}`).then(x => x.json()).catch(() => null),
      ]);
      if (cancelled) return;
      setStats(s?.stats ?? null);
      setRenta(r && !r.error ? r : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [etabId, semaines]);

  // ── Le réel, agrégé par service ──
  const reel = useMemo(() => {
    if (!stats) return null;
    const agg = (svc: "midi" | "soir") => {
      const rows = stats.services.filter(x => x.svc === svc && x.cov > 0);
      const jours = rows.length || 1;
      const cov = rows.reduce((a, x) => a + x.sp_cov, 0);
      const ttc = rows.reduce((a, x) => a + x.sp_ttc, 0);
      const record = rows.reduce((best, x) => (x.sp_cov > (best?.sp_cov ?? 0) ? x : best), rows[0]);
      return { jours: rows.length, covJour: cov / jours, tm: cov > 0 ? ttc / cov : 0, ttcJour: ttc / jours, record };
    };
    const midi = agg("midi"), soir = agg("soir");
    const empRows = stats.services;
    const empTickets = empRows.reduce((a, x) => a + x.emp_tickets, 0);
    const empTtc = empRows.reduce((a, x) => a + x.emp_ttc, 0);
    const joursOuverts = stats.dates.length || 1;
    const ttcTotal = stats.ca_ttc, htTotal = stats.ca_ht;
    return {
      midi, soir,
      emp: { parJour: empTickets / joursOuverts, tm: empTickets > 0 ? empTtc / empTickets : 0, ttcJour: empTtc / joursOuverts },
      joursOuverts, caJour: ttcTotal / joursOuverts, ratioHt: ttcTotal > 0 ? htTotal / ttcTotal : 1 / 1.1,
      partMidi: ttcTotal > 0 ? midi.ttcJour * joursOuverts / ttcTotal : 0.33,
      partSoir: ttcTotal > 0 ? soir.ttcJour * joursOuverts / ttcTotal : 0.55,
    };
  }, [stats]);

  // ── Les charges réelles ──
  const charges = useMemo(() => {
    if (!renta) return null;
    const l = (p: string) => renta.lignes.find(x => x.poste.startsWith(p))?.montant ?? 0;
    const ms = l("Masse salariale");
    const expl = l("Charges d'exploitation");
    const gerants = renta.exploitationDetail.find(d => /gérant/i.test(d.libelle))?.montant ?? 0;
    const foodCost = renta.margeBrute?.foodCostPct ?? 28;
    const ratioHt = renta.ca.ttc > 0 ? renta.ca.ht / renta.ca.ttc : 1 / 1.1;
    return { ms, fixesHorsMs: expl - gerants, gerants, foodCost, caHt: renta.ca.ht, ratioHt };
  }, [renta]);

  // ── Pré-remplissage du simulateur depuis le réel (1 fois, puis mémoire locale) ──
  useEffect(() => {
    if (!reel || !charges || sim) return;
    const saved = localStorage.getItem(`croisiere:${etabId}`);
    const base: Sim = {
      tmMidi: +reel.midi.tm.toFixed(2), tmSoir: +reel.soir.tm.toFixed(2), tmEmp: +reel.emp.tm.toFixed(2),
      covMidi: Math.round(reel.midi.covJour), covSoir: Math.round(reel.soir.covJour), empJour: Math.round(reel.emp.parJour),
      capMidi: 85, capSoir: 126, joursMois: Math.min(31, Math.round(reel.joursOuverts / (semaines * 7) * 30.4)),
      foodCost: +charges.foodCost.toFixed(1), chargesFixes: Math.round(charges.fixesHorsMs), gerants: Math.round(charges.gerants),
      salleMidi: 3, salleSoir: 5, cuisineMidi: 3, cuisineSoir: 4, hMidi: 5, hSoir: 6, coutHoraire: 18, covParServeur: 25,
      caCible: 0,
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSim(saved ? { ...base, ...JSON.parse(saved) } : base);
  }, [reel, charges, sim, etabId, semaines]);
  const up = (patch: Partial<Sim>) => setSim(s => {
    const n = { ...(s as Sim), ...patch };
    localStorage.setItem(`croisiere:${etabId}`, JSON.stringify(n));
    return n;
  });

  // ── Seuil de rentabilité réel ──
  const seuil = useMemo(() => {
    if (!reel || !charges) return null;
    const structure = charges.ms + charges.fixesHorsMs + charges.gerants; // € HT / mois
    const marge = 1 - charges.foodCost / 100;
    const caHtMois = marge > 0 ? structure / marge : 0;
    const caTtcMois = caHtMois / charges.ratioHt;
    const joursMois = Math.max(1, Math.round(reel.joursOuverts / (semaines * 7) * 30.4));
    const caTtcJour = caTtcMois / joursMois;
    const partEmp = Math.max(0, 1 - reel.partMidi - reel.partSoir);
    return {
      structure, caHtMois, caTtcMois, caTtcJour, joursMois,
      covMidi: reel.midi.tm > 0 ? caTtcJour * reel.partMidi / reel.midi.tm : 0,
      covSoir: reel.soir.tm > 0 ? caTtcJour * reel.partSoir / reel.soir.tm : 0,
      emp: reel.emp.tm > 0 ? caTtcJour * partEmp / reel.emp.tm : 0,
      caReelTtcJour: reel.caJour,
    };
  }, [reel, charges, semaines]);

  // ── Résultats du simulateur ──
  const res = useMemo(() => {
    if (!sim || !reel) return null;
    const caJour = sim.covMidi * sim.tmMidi + sim.covSoir * sim.tmSoir + sim.empJour * sim.tmEmp;
    const caMois = caJour * sim.joursMois;
    const caHtMois = caMois * reel.ratioHt;
    const msVariable = (sim.salleMidi + sim.cuisineMidi) * sim.hMidi * sim.coutHoraire * sim.joursMois
                     + (sim.salleSoir + sim.cuisineSoir) * sim.hSoir * sim.coutHoraire * sim.joursMois;
    const ms = msVariable + sim.gerants;
    const matieres = caHtMois * sim.foodCost / 100;
    const ebe = caHtMois - matieres - ms - sim.chargesFixes;
    const serveursMidi = Math.ceil(sim.covMidi / Math.max(1, sim.covParServeur));
    const serveursSoir = Math.ceil(sim.covSoir / Math.max(1, sim.covParServeur));
    // Pour atteindre le CA cible mensuel avec ces tickets moyens et cette répartition
    const partMidi = caJour > 0 ? sim.covMidi * sim.tmMidi / caJour : reel.partMidi;
    const partSoir = caJour > 0 ? sim.covSoir * sim.tmSoir / caJour : reel.partSoir;
    const cibleJour = sim.caCible > 0 ? sim.caCible / sim.joursMois : 0;
    const cible = cibleJour > 0 ? {
      covMidi: cibleJour * partMidi / Math.max(0.01, sim.tmMidi),
      covSoir: cibleJour * partSoir / Math.max(0.01, sim.tmSoir),
      emp: cibleJour * Math.max(0, 1 - partMidi - partSoir) / Math.max(0.01, sim.tmEmp),
    } : null;
    return { caJour, caMois, caHtMois, ms, msVariable, matieres, ebe, ratioMs: caHtMois > 0 ? ms / caHtMois * 100 : 0,
             serveursMidi, serveursSoir, cible, cibleJour };
  }, [sim, reel]);

  if (loading || !reel) return <div style={{ ...CARD, textAlign: "center", color: "#999", padding: 40 }}>Calcul en cours…</div>;

  return (
    <>
      {/* ═══ 1. LE RÉEL ═══ */}
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={SEC}>Le réel · ticket moyen & couverts</div>
          <div style={{ display: "inline-flex", gap: 2, padding: 3, background: "#f0ebe3", borderRadius: 9 }}>
            {([4, 8, 12] as const).map(w => (
              <button key={w} type="button" onClick={() => { setSemaines(w); setSim(null); }} style={{
                padding: "4px 10px", borderRadius: 7, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: semaines === w ? "#fff" : "transparent", color: semaines === w ? "#1a1a1a" : "#999",
              }}>{w} sem.</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <Col titre="Midi" couleur="#D4775A" lignes={[
            ["Ticket moyen TTC", eur2(reel.midi.tm)], ["Couverts / service", n1(reel.midi.covJour)], ["CA / service", eur0(reel.midi.ttcJour)], ["Services", String(reel.midi.jours)],
          ]} />
          <Col titre="Soir" couleur="#7c5c3a" lignes={[
            ["Ticket moyen TTC", eur2(reel.soir.tm)], ["Couverts / service", n1(reel.soir.covJour)], ["CA / service", eur0(reel.soir.ttcJour)], ["Services", String(reel.soir.jours)],
          ]} />
          <Col titre="Emporter" couleur="#5e7a8a" lignes={[
            ["Panier moyen TTC", eur2(reel.emp.tm)], ["Commandes / jour", n1(reel.emp.parJour)], ["CA / jour", eur0(reel.emp.ttcJour)],
          ]} />
        </div>
        <div style={{ fontSize: 11, color: "#8a8378", marginTop: 10 }}>
          {reel.joursOuverts} jours d&apos;ouverture · {eur0(reel.caJour)} TTC par jour en moyenne
          {reel.soir.record && <> · record soir : <strong>{reel.soir.record.sp_cov} couverts</strong> le {fmtDate(reel.soir.record.date)}</>}
          {reel.midi.record && <> · record midi : <strong>{reel.midi.record.sp_cov}</strong> le {fmtDate(reel.midi.record.date)}</>}
        </div>
      </div>

      {/* ═══ 2. LE SEUIL ═══ */}
      <div style={CARD}>
        <div style={SEC}>Le seuil · couverts à réaliser pour être rentable</div>
        {!seuil || !charges ? (
          <div style={{ fontSize: 12.5, color: "#999" }}>Charges Pennylane indisponibles pour le mois dernier — lance une synchronisation dans Rentabilité.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Col titre="Structure mensuelle (réel)" couleur="#1a1a1a" lignes={[
                ["Masse salariale", eur0(charges.ms)], ["Gérants", eur0(charges.gerants)], ["Autres charges", eur0(charges.fixesHorsMs)], ["Food cost", n1(charges.foodCost) + " %"],
              ]} />
              <Col titre="CA nécessaire" couleur={etabColor} lignes={[
                ["HT / mois", eur0(seuil.caHtMois)], ["TTC / jour", eur0(seuil.caTtcJour)], ["Ton réel / jour", eur0(seuil.caReelTtcJour)],
              ]} />
              <Col titre="Couverts / jour au seuil" couleur="#2D6A4F" lignes={[
                ["Midi", n1(seuil.covMidi)], ["Soir", n1(seuil.covSoir)], ["Emporter", n1(seuil.emp)],
              ]} />
            </div>
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
              background: seuil.caReelTtcJour >= seuil.caTtcJour ? "rgba(45,106,79,0.08)" : "rgba(220,38,38,0.07)",
              color: seuil.caReelTtcJour >= seuil.caTtcJour ? "#2D6A4F" : "#b3261e", fontWeight: 600 }}>
              {seuil.caReelTtcJour >= seuil.caTtcJour
                ? <>Au rythme actuel tu es <strong>{n1((seuil.caReelTtcJour / seuil.caTtcJour - 1) * 100)} % au-dessus</strong> du seuil : tu peux perdre jusqu&apos;à {n1(reel.midi.covJour - seuil.covMidi)} couverts le midi et {n1(reel.soir.covJour - seuil.covSoir)} le soir par jour en restant rentable — ou garder les couverts et monter le ticket.</>
                : <>Il manque <strong>{eur0(seuil.caTtcJour - seuil.caReelTtcJour)} TTC par jour</strong> pour couvrir la structure du mois dernier.</>}
            </div>
            <div style={{ fontSize: 10.5, color: "#999", marginTop: 6 }}>
              Seuil = (masse salariale + gérants + autres charges) ÷ (1 − food cost), réparti midi / soir / emporter selon ta répartition réelle du CA, sur {seuil.joursMois} jours d&apos;ouverture par mois.
            </div>
          </>
        )}
      </div>

      {/* ═══ 3. LE SIMULATEUR ═══ */}
      {sim && res && (
        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 18px 4px" }}>
            <div style={SEC}>Le simulateur · mon régime de croisière</div>
          </div>

          {/* Services : 3 cartes avec curseurs + jauge de capacité */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, padding: "6px 18px 16px" }}>
            <ServiceCard titre="Midi" couleur="#D4775A"
              tm={sim.tmMidi} onTm={v => up({ tmMidi: v })}
              cov={sim.covMidi} onCov={v => up({ covMidi: v })} cap={sim.capMidi} onCap={v => up({ capMidi: v })}
              ca={sim.covMidi * sim.tmMidi} />
            <ServiceCard titre="Soir" couleur="#7c5c3a"
              tm={sim.tmSoir} onTm={v => up({ tmSoir: v })}
              cov={sim.covSoir} onCov={v => up({ covSoir: v })} cap={sim.capSoir} onCap={v => up({ capSoir: v })}
              ca={sim.covSoir * sim.tmSoir} />
            <ServiceCard titre="Emporter" couleur="#5e7a8a" libelleCov="Commandes / jour" libelleTm="Panier moyen"
              tm={sim.tmEmp} onTm={v => up({ tmEmp: v })}
              cov={sim.empJour} onCov={v => up({ empJour: v })}
              ca={sim.empJour * sim.tmEmp} />
          </div>

          {/* Résultats */}
          <div style={{ margin: "0 18px 16px", borderRadius: 14, padding: "18px 20px", color: "#fff",
            background: `linear-gradient(135deg, ${etabColor} 0%, ${etabColor}cc 100%)` }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <div style={{ ...LAB, color: "rgba(255,255,255,0.75)" }}>CA TTC par jour</div>
                <div style={{ fontFamily: OSWALD, fontSize: 40, fontWeight: 700, lineHeight: 1 }}>{eur0(res.caJour)}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>{eur0(res.caMois)} TTC / mois · {eur0(res.caHtMois)} HT</div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Pill label="EBE / mois" value={eur0(res.ebe)} ok={res.ebe >= 0} />
                <Pill label="MS / CA" value={n1(res.ratioMs) + " %"} ok={res.ratioMs <= 38} warn={res.ratioMs > 38 && res.ratioMs <= 45} />
                <Pill label="Masse salariale" value={eur0(res.ms)} />
                <Pill label="Serveurs midi · soir" value={`${res.serveursMidi} · ${res.serveursSoir}`}
                  ok={sim.salleMidi >= res.serveursMidi && sim.salleSoir >= res.serveursSoir} warn={sim.salleMidi < res.serveursMidi || sim.salleSoir < res.serveursSoir} />
              </div>
            </div>
            {(sim.salleMidi < res.serveursMidi || sim.salleSoir < res.serveursSoir) && (
              <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.9)", background: "rgba(0,0,0,0.14)", borderRadius: 8, padding: "7px 10px" }}>
                À {sim.covParServeur} couverts par serveur il faut <strong>{res.serveursMidi}</strong> en salle le midi et <strong>{res.serveursSoir}</strong> le soir.
              </div>
            )}
          </div>

          {/* Équipe + coûts */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, padding: "0 18px 16px" }}>
            <div style={{ background: "#faf7f2", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ ...SEC, marginBottom: 12 }}>Mon équipe par service</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Stepper label="Salle midi" value={sim.salleMidi} onChange={v => up({ salleMidi: v })} />
                <Stepper label="Salle soir" value={sim.salleSoir} onChange={v => up({ salleSoir: v })} />
                <Stepper label="Cuisine midi" value={sim.cuisineMidi} onChange={v => up({ cuisineMidi: v })} />
                <Stepper label="Cuisine soir" value={sim.cuisineSoir} onChange={v => up({ cuisineSoir: v })} />
                <Stepper label="Heures midi" value={sim.hMidi} onChange={v => up({ hMidi: v })} step={0.5} suffix="h" />
                <Stepper label="Heures soir" value={sim.hSoir} onChange={v => up({ hSoir: v })} step={0.5} suffix="h" />
                <Stepper label="Couverts / serveur" value={sim.covParServeur} onChange={v => up({ covParServeur: v })} />
                <Stepper label="Jours / mois" value={sim.joursMois} onChange={v => up({ joursMois: v })} />
              </div>
            </div>
            <div style={{ background: "#faf7f2", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ ...SEC, marginBottom: 12 }}>Mes coûts</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Num label="Coût horaire chargé" value={sim.coutHoraire} onChange={v => up({ coutHoraire: v })} step={0.5} suffix="€/h" />
                <Num label="Food cost" value={sim.foodCost} onChange={v => up({ foodCost: v })} step={0.5} suffix="%" />
                <Num label="Autres charges / mois" value={sim.chargesFixes} onChange={v => up({ chargesFixes: v })} step={100} suffix="€" />
                <Num label="Gérants / mois" value={sim.gerants} onChange={v => up({ gerants: v })} step={100} suffix="€" />
              </div>
              <div style={{ fontSize: 10.5, color: "#999", marginTop: 10, lineHeight: 1.5 }}>
                Masse salariale = (salle + cuisine) × heures × coût horaire × jours + gérants. EBE = CA HT − matières − masse salariale − autres charges.
              </div>
            </div>
          </div>

          {/* Objectif */}
          <div style={{ margin: "0 18px 18px", borderRadius: 12, border: `2px solid ${etabColor}33`, padding: "14px 16px", background: "#fff" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 220px) 1fr", gap: 16, alignItems: "center" }}>
              <div>
                <div style={LAB}>Je vise un CA TTC / mois</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <input type="number" step={1000} min={0} value={sim.caCible || ""} placeholder="ex. 180 000"
                    onChange={e => up({ caCible: Number(e.target.value) })}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${etabColor}66`, fontSize: 18, fontWeight: 700, fontFamily: OSWALD, color: "#1a1a1a", background: "#fff" }} />
                  <span style={{ color: "#999", fontSize: 13 }}>€</span>
                </div>
              </div>
              {res.cible ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Objectif label="Midi" value={n1(res.cible.covMidi) + " cvts"} couleur="#D4775A" depasse={res.cible.covMidi > sim.capMidi} />
                  <Objectif label="Soir" value={n1(res.cible.covSoir) + " cvts"} couleur="#7c5c3a" depasse={res.cible.covSoir > sim.capSoir} />
                  <Objectif label="Emporter" value={n1(res.cible.emp) + " cmd"} couleur="#5e7a8a" />
                  <Objectif label="Serveurs" value={`${Math.ceil(res.cible.covMidi / Math.max(1, sim.covParServeur))} · ${Math.ceil(res.cible.covSoir / Math.max(1, sim.covParServeur))}`} couleur="#1a1a1a" />
                  <div style={{ flexBasis: "100%", fontSize: 12, color: (res.cible.covMidi > sim.capMidi || res.cible.covSoir > sim.capSoir) ? "#b3261e" : "#2D6A4F", fontWeight: 600 }}>
                    {eur0(res.cibleJour)} TTC par jour, à tes tickets moyens et ta répartition actuelle.
                    {(res.cible.covMidi > sim.capMidi || res.cible.covSoir > sim.capSoir) ? " Ça dépasse ta capacité : monte le ticket moyen plutôt que les couverts." : " C'est dans ta capacité."}
                  </div>
                </div>
              ) : <div style={{ fontSize: 12.5, color: "#999" }}>Saisis un objectif : tu obtiens les couverts midi / soir / emporter et l&apos;équipe nécessaires à tes tickets moyens.</div>}
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: "#999", padding: "0 18px 16px", lineHeight: 1.5 }}>
            Pré-rempli avec ton réel des {semaines} dernières semaines et les charges Pennylane du mois dernier. Tes réglages sont mémorisés sur cet appareil.
          </div>
        </div>
      )}
    </>
  );
}

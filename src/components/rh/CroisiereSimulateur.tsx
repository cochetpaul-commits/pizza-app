"use client";

import { useEffect, useMemo, useState } from "react";
import { loadEtabParam, saveEtabParamDebounced, deleteEtabParam } from "@/lib/etabParams";
import { fetchApi } from "@/lib/fetchApi";

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

/** Corrections du réel Pennylane (ex. virements gérants groupés sur un mois) — mémorisées en base */
type Structure = { gerants?: number | null; ms?: number | null; fixes?: number | null; foodCost?: number | null };

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

function ColEdit({ titre, couleur, lignes }: { titre: string; couleur: string; lignes: { k: string; v: number; suffix: string; step: number; base: number; onChange: (v: number | null) => void }[] }) {
  return (
    <div style={{ flex: "1 1 170px", minWidth: 160, padding: "12px 14px", borderRadius: 12, background: "#faf7f2", borderTop: `3px solid ${couleur}` }}>
      <div style={{ ...LAB, color: couleur, marginBottom: 6 }}>{titre}</div>
      {lignes.map(l => {
        const modif = Math.abs(l.v - l.base) >= (l.suffix === "%" ? 0.05 : 0.5);
        return (
          <div key={l.k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#8a8378", flex: 1 }}>{l.k}</span>
            {modif && (
              <button type="button" onClick={() => l.onChange(null)} title={`Revenir à Pennylane (${l.suffix === "%" ? n1(l.base) + " %" : eur0(l.base)})`}
                style={{ border: "none", background: "none", color: "#b45309", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 2px" }}>↺</button>
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
              <input type="number" value={Number.isFinite(l.v) ? l.v : ""} step={l.step} min={0}
                onChange={e => l.onChange(e.target.value === "" ? null : Number(e.target.value))}
                style={{ width: 74, padding: "2px 4px", borderRadius: 6, border: `1px solid ${modif ? "#b45309" : "#ddd6c8"}`, fontFamily: OSWALD, fontSize: 16, fontWeight: 700, color: modif ? "#b45309" : "#1a1a1a", textAlign: "right", background: "#fff" }} />
              <span style={{ fontSize: 10, color: "#999" }}>{l.suffix}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Zone rentable d'un service : ticket moyen × couverts.
 * La courbe est le seuil (TM × couverts = CA à réaliser sur ce service) ;
 * tout ce qui est au-dessus est rentable. Un point plein = le réel,
 * un point creux = le simulateur. Une seule teinte (celle du service),
 * l'identité réel / simulé passe par la forme et l'étiquette.
 */
function ZoneRentable({ titre, couleur, caSeuil, cap, reelCov, reelTm, simCov, simTm }: {
  titre: string; couleur: string; caSeuil: number; cap: number;
  reelCov: number; reelTm: number; simCov: number; simTm: number;
}) {
  const [hover, setHover] = useState<number | null>(null); // couverts survolés
  const W = 360, H = 220, ML = 40, MR = 14, MT = 16, MB = 30;
  const pw = W - ML - MR, ph = H - MT - MB;
  // Pas « ronds » (10 / 20 / 25 / 50…) pour ~4-5 graduations
  const niceStep = (span: number, n: number) => {
    const raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= raw) ?? 10 * mag;
  };
  const xStep = niceStep(Math.max(cap * 1.25, reelCov * 1.15, simCov * 1.15, 20), 5);
  const xMax = Math.ceil(Math.max(cap * 1.25, reelCov * 1.15, simCov * 1.15, 20) / xStep) * xStep;
  const yStep = niceStep(Math.max(reelTm, simTm, 20) * 1.5, 4);
  const yMax = Math.ceil(Math.max(reelTm, simTm, 20) * 1.5 / yStep) * yStep;
  const yMin = 0;
  const X = (c: number) => ML + (c / xMax) * pw;
  const Y = (t: number) => MT + ph - ((t - yMin) / (yMax - yMin)) * ph;
  const tmSeuil = (c: number) => (c > 0 ? caSeuil / c : Infinity);

  // Courbe du seuil (hyperbole), tronquée au cadre
  const pts: [number, number][] = [];
  for (let i = 0; i <= 120; i++) {
    const c = (xMax * i) / 120;
    const t = tmSeuil(c);
    if (!Number.isFinite(t) || t > yMax) continue;
    pts.push([X(c), Y(t)]);
  }
  const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  // Zone rentable = au-dessus de la courbe
  const zone = pts.length
    ? `${path} L${(ML + pw).toFixed(1)},${MT} L${pts[0][0].toFixed(1)},${MT} Z`
    : "";

  const xTicks = Array.from({ length: Math.round(xMax / xStep) + 1 }, (_, i) => i * xStep);
  const yTicks = Array.from({ length: Math.round(yMax / yStep) + 1 }, (_, i) => i * yStep);
  const rentable = (c: number, t: number) => c * t >= caSeuil;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const c = ((e.clientX - r.left) / r.width * W - ML) / pw * xMax;
    setHover(c >= 0 && c <= xMax ? Math.round(c) : null);
  };
  const hv = hover != null && hover > 0 ? { c: hover, t: tmSeuil(hover) } : null;
  const simAffiche = simCov > 0 && (Math.abs(simCov - reelCov) > 0.5 || Math.abs(simTm - reelTm) > 0.05);
  const tipLeft = hv ? X(hv.c) > ML + pw * 0.6 : false;

  const point = (c: number, t: number, plein: boolean, label: string, autreC: number | null) => {
    const cx = X(Math.min(c, xMax)), cy = Y(Math.min(t, yMax));
    const autreCx = autreC != null ? X(Math.min(autreC, xMax)) : null;
    // côté de l'étiquette : à l'opposé de l'autre point s'il est proche, sinon vers l'intérieur du cadre
    let right = autreCx != null && Math.abs(cx - autreCx) < 90 ? cx >= autreCx : cx < ML + pw * 0.65;
    if (right && cx + 95 > ML + pw) right = false;
    if (!right && cx - 85 < ML) right = true;
    const tx = right ? cx + 9 : cx - 9;
    // réel : étiquette sous le point · simulé : au-dessus → pas de collision quand ils se touchent
    const y1 = plein ? cy + 13 : cy - 14, y2 = plein ? cy + 24 : cy - 3;
    return (
      <g key={label}>
        <circle cx={cx} cy={cy} r={7} fill="#fff" />
        <circle cx={cx} cy={cy} r={5} fill={plein ? couleur : "#fff"} stroke={couleur} strokeWidth={2} />
        <text x={tx} y={y1} textAnchor={right ? "start" : "end"} fontSize={10} fontWeight={700} fill="#1a1a1a">{label}</text>
        <text x={tx} y={y2} textAnchor={right ? "start" : "end"} fontSize={9.5} fill="#8a8378">{Math.round(c)} cvts × {n1(t)} €</text>
      </g>
    );
  };

  return (
    <div style={{ flex: "1 1 300px", minWidth: 260 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
        <span style={{ fontFamily: OSWALD, fontSize: 14, fontWeight: 700, color: couleur, textTransform: "uppercase", letterSpacing: 0.5 }}>{titre}</span>
        <span style={{ fontSize: 10.5, color: "#8a8378" }}>seuil {eur0(caSeuil)} TTC / service</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", touchAction: "none" }}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
        aria-label={`${titre} : ticket moyen minimum selon le nombre de couverts, seuil ${eur0(caSeuil)} par service`}>
        {/* grille */}
        {yTicks.map(t => (
          <g key={t}>
            <line x1={ML} x2={ML + pw} y1={Y(t)} y2={Y(t)} stroke="#ece6dc" strokeWidth={1} />
            <text x={ML - 6} y={Y(t) + 3.5} textAnchor="end" fontSize={9.5} fill="#8a8378">{t} €</text>
          </g>
        ))}
        {xTicks.map(c => (
          <text key={c} x={X(c)} y={H - MB + 14} textAnchor="middle" fontSize={9.5} fill="#8a8378">{c}</text>
        ))}
        <text x={ML + pw} y={H - 4} textAnchor="end" fontSize={9} fill="#8a8378">couverts / service</text>
        {/* zone rentable */}
        {zone && <path d={zone} fill={couleur} opacity={0.1} />}
        {zone && <text x={ML + pw - 6} y={MT + 14} textAnchor="end" fontSize={10} fontWeight={700} fill="#1a1a1a">zone rentable</text>}
        {/* capacité */}
        {cap > 0 && cap <= xMax && (
          <g>
            <line x1={X(cap)} x2={X(cap)} y1={MT} y2={MT + ph} stroke="#c9c1b3" strokeWidth={1} />
            <text x={X(cap) + 4} y={MT + ph - 6} fontSize={9.5} fill="#8a8378">capacité {cap}</text>
          </g>
        )}
        {/* seuil */}
        {path && <path d={path} fill="none" stroke={couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {/* points */}
        {reelCov > 0 && point(reelCov, reelTm, true, "Réel", simAffiche ? simCov : null)}
        {simAffiche && point(simCov, simTm, false, "Simulé", reelCov > 0 ? reelCov : null)}
        {/* survol */}
        {hv && Number.isFinite(hv.t) && (
          <g>
            <line x1={X(hv.c)} x2={X(hv.c)} y1={MT} y2={MT + ph} stroke="#1a1a1a" strokeWidth={1} opacity={0.35} />
            {hv.t <= yMax && <circle cx={X(hv.c)} cy={Y(hv.t)} r={4} fill="#fff" stroke={couleur} strokeWidth={2} />}
            <g transform={`translate(${tipLeft ? X(hv.c) - 146 : X(hv.c) + 8}, ${MT + 24})`}>
              <rect width={138} height={hv.t <= yMax ? 44 : 30} rx={6} fill="#1a1a1a" opacity={0.92} />
              <text x={8} y={15} fontSize={10.5} fontWeight={700} fill="#fff">{hv.c} couverts</text>
              {hv.t <= yMax
                ? <>
                    <text x={8} y={29} fontSize={10} fill="#e6e0d6">ticket mini {n1(hv.t)} €</text>
                    <text x={8} y={40} fontSize={9.5} fill="#e6e0d6">{rentable(hv.c, reelTm) ? `rentable à ton ticket réel (${n1(reelTm)} €)` : `il manque ${n1(hv.t - reelTm)} € / couvert`}</text>
                  </>
                : <text x={8} y={25} fontSize={10} fill="#e6e0d6">ticket mini &gt; {yMax} € : trop peu de couverts</text>}
            </g>
          </g>
        )}
      </svg>
      <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#8a8378", marginTop: 2, flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: couleur, verticalAlign: -1, marginRight: 4 }} />Réel</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, border: `2px solid ${couleur}`, boxSizing: "border-box", verticalAlign: -1, marginRight: 4 }} />Simulé</span>
        <span><span style={{ display: "inline-block", width: 14, height: 2, background: couleur, verticalAlign: 3, marginRight: 4 }} />Seuil</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, background: couleur, opacity: 0.15, verticalAlign: -1, marginRight: 4 }} />Zone rentable</span>
      </div>
      <details style={{ marginTop: 4 }}>
        <summary style={{ fontSize: 10, color: "#8a8378", cursor: "pointer" }}>Voir les chiffres</summary>
        <table style={{ fontSize: 10.5, borderCollapse: "collapse", marginTop: 4 }}>
          <thead><tr><th style={{ textAlign: "left", color: "#8a8378", fontWeight: 600, paddingRight: 12 }}>Couverts</th><th style={{ textAlign: "right", color: "#8a8378", fontWeight: 600 }}>Ticket mini</th></tr></thead>
          <tbody>
            {[0.4, 0.6, 0.8, 1].map(f => Math.round(cap * f)).filter(c => c > 0).map(c => (
              <tr key={c}><td style={{ paddingRight: 12, color: "#1a1a1a" }}>{c}{c === cap ? " (capacité)" : ""}</td><td style={{ textAlign: "right", fontWeight: 700, color: "#1a1a1a" }}>{n1(tmSeuil(c))} €</td></tr>
            ))}
          </tbody>
        </table>
      </details>
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
  const [structure, setStructure] = useState<Structure | null>(null); // null = pas encore chargé
  const [simSaved, setSimSaved] = useState<Partial<Sim> | null | undefined>(undefined); // undefined = pas encore chargé

  // ── Chargement réel (ventes) + charges (Pennylane, dernier mois complet) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const to = new Date(); to.setDate(to.getDate() - 1);
      const from = new Date(to); from.setDate(from.getDate() - semaines * 7 + 1);
      const m0 = new Date(); m0.setDate(1); m0.setMonth(m0.getMonth() - 1);
      const m1 = new Date(); m1.setDate(0);
      const [s, r, st, sv] = await Promise.all([
        fetchApi(`/api/ventes/stats?etablissement_id=${etabId}&from=${iso(from)}&to=${iso(to)}`).then(x => x.json()).catch(() => null),
        fetchApi(`/api/rentabilite?etablissement_id=${etabId}&from=${iso(m0)}&to=${iso(m1)}`).then(x => x.json()).catch(() => null),
        loadEtabParam<Structure>(etabId, "croisiere_structure"),
        loadEtabParam<Partial<Sim>>(etabId, "croisiere_sim"),
      ]);
      if (cancelled) return;
      setStats(s?.stats ?? null);
      setRenta(r && !r.error ? r : null);
      setStructure(st ?? {});
      // Ancienne mémoire locale (avant la table etablissement_params) : reprise une fois
      const legacy = sv == null ? localStorage.getItem(`croisiere:${etabId}`) : null;
      setSimSaved(sv ?? (legacy ? JSON.parse(legacy) as Partial<Sim> : null));
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
    const base = { ms, fixesHorsMs: expl - gerants, gerants, foodCost };
    const o = structure ?? {};
    return {
      ms: o.ms ?? base.ms, fixesHorsMs: o.fixes ?? base.fixesHorsMs, gerants: o.gerants ?? base.gerants, foodCost: o.foodCost ?? base.foodCost,
      base, corrige: o.ms != null || o.fixes != null || o.gerants != null || o.foodCost != null,
      caHt: renta.ca.ht, ratioHt,
    };
  }, [renta, structure]);
  const setStruct = (patch: Structure) => {
    const next: Structure = { ...(structure ?? {}) };
    for (const [k, v] of Object.entries(patch) as [keyof Structure, number | null | undefined][]) {
      if (v == null || !Number.isFinite(v)) delete next[k]; else next[k] = v;
    }
    setStructure(next);
    if (Object.keys(next).length === 0) void deleteEtabParam(etabId, "croisiere_structure");
    else saveEtabParamDebounced(etabId, "croisiere_structure", next);
  };

  // ── Pré-remplissage du simulateur depuis le réel (1 fois, puis mémoire locale) ──
  useEffect(() => {
    if (!reel || !charges || sim || simSaved === undefined) return;
    const saved = simSaved;
    const base: Sim = {
      tmMidi: +reel.midi.tm.toFixed(2), tmSoir: +reel.soir.tm.toFixed(2), tmEmp: +reel.emp.tm.toFixed(2),
      covMidi: Math.round(reel.midi.covJour), covSoir: Math.round(reel.soir.covJour), empJour: Math.round(reel.emp.parJour),
      capMidi: 85, capSoir: 126, joursMois: Math.min(31, Math.round(reel.joursOuverts / (semaines * 7) * 30.4)),
      foodCost: +charges.foodCost.toFixed(1), chargesFixes: Math.round(charges.fixesHorsMs), gerants: Math.round(charges.gerants),
      salleMidi: 3, salleSoir: 5, cuisineMidi: 3, cuisineSoir: 4, hMidi: 5, hSoir: 6, coutHoraire: 18, covParServeur: 25,
      caCible: 0,
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSim(saved ? { ...base, ...saved } : base);
  }, [reel, charges, sim, simSaved, etabId, semaines]);
  const up = (patch: Partial<Sim>) => setSim(s => {
    const n = { ...(s as Sim), ...patch };
    saveEtabParamDebounced(etabId, "croisiere_sim", n);
    return n;
  });
  const resetSim = () => { void deleteEtabParam(etabId, "croisiere_sim"); localStorage.removeItem(`croisiere:${etabId}`); setSimSaved(null); setSim(null); };

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
              <ColEdit titre={charges.corrige ? "Structure mensuelle (corrigée)" : "Structure mensuelle (réel)"} couleur={charges.corrige ? "#b45309" : "#1a1a1a"} lignes={[
                { k: "Masse salariale", v: Math.round(charges.ms), base: Math.round(charges.base.ms), suffix: "€", step: 100, onChange: v => setStruct({ ms: v }) },
                { k: "Gérants", v: Math.round(charges.gerants), base: Math.round(charges.base.gerants), suffix: "€", step: 100, onChange: v => setStruct({ gerants: v }) },
                { k: "Autres charges", v: Math.round(charges.fixesHorsMs), base: Math.round(charges.base.fixesHorsMs), suffix: "€", step: 100, onChange: v => setStruct({ fixes: v }) },
                { k: "Food cost", v: +charges.foodCost.toFixed(1), base: +charges.base.foodCost.toFixed(1), suffix: "%", step: 0.5, onChange: v => setStruct({ foodCost: v }) },
              ]} />
              <Col titre="CA nécessaire" couleur={etabColor} lignes={[
                ["HT / mois", eur0(seuil.caHtMois)], ["TTC / jour", eur0(seuil.caTtcJour)], ["Ton réel / jour", eur0(seuil.caReelTtcJour)],
              ]} />
              <Col titre="Couverts / jour au seuil" couleur="#2D6A4F" lignes={[
                ["Midi", n1(seuil.covMidi)], ["Soir", n1(seuil.covSoir)], ["Emporter", n1(seuil.emp)],
              ]} />
            </div>
            <div style={{ fontSize: 10.5, color: charges.corrige ? "#b45309" : "#999", marginTop: 8, lineHeight: 1.5 }}>
              {charges.corrige
                ? <>Structure corrigée à la main (↺ pour revenir au chiffre Pennylane). Utile quand un mois n&apos;est pas représentatif — ex. plusieurs virements gérants passés le même mois.</>
                : <>Chiffres Pennylane du mois dernier — tu peux corriger chaque montant si le mois n&apos;est pas représentatif (ex. virements gérants groupés).</>}
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

            {/* Courbes ticket moyen × couverts */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #f0ebe3" }}>
              <div style={SEC}>Zone rentable · ticket moyen × couverts</div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                <ZoneRentable titre="Midi" couleur="#D4775A" caSeuil={seuil.caTtcJour * reel.partMidi} cap={sim?.capMidi ?? 85}
                  reelCov={reel.midi.covJour} reelTm={reel.midi.tm} simCov={sim?.covMidi ?? 0} simTm={sim?.tmMidi ?? 0} />
                <ZoneRentable titre="Soir" couleur="#7c5c3a" caSeuil={seuil.caTtcJour * reel.partSoir} cap={sim?.capSoir ?? 126}
                  reelCov={reel.soir.covJour} reelTm={reel.soir.tm} simCov={sim?.covSoir ?? 0} simTm={sim?.tmSoir ?? 0} />
              </div>
              <div style={{ fontSize: 10.5, color: "#999", marginTop: 8, lineHeight: 1.5 }}>
                La courbe est le seuil de ce service (à répartition midi / soir / emporter constante) : au-dessus tu gagnes, en dessous tu perds. Survole pour lire le ticket minimum à un nombre de couverts donné ; le point creux suit le simulateur ci-dessous.
              </div>
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 10.5, color: "#999", padding: "0 18px 16px", lineHeight: 1.5 }}>
            <span>Pré-rempli avec ton réel des {semaines} dernières semaines et les charges du mois dernier (corrigées si besoin ci-dessus). Tes réglages sont mémorisés pour tous tes appareils.</span>
            <button type="button" onClick={resetSim} style={{ fontSize: 11, color: "#999", background: "none", border: "1px solid #ddd6c8", borderRadius: 12, padding: "3px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
              ↺ Réinitialiser le simulateur
            </button>
          </div>
        </div>
      )}
    </>
  );
}

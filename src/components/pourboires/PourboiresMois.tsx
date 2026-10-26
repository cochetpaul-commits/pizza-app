"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";

/**
 * Pourboires du mois (26/10/2026) : le pot (carte + espèces), les jours comptés d'après Combo et la part
 * de chacun. En mode « direction », le tableau complet avec les ajustements ; sinon la carte « Mes
 * pourboires » de l'équipier (sa ligne, le pot, la valeur du jour), à J-1.
 */
export type LignePourboires = {
  employe_id: string; prenom: string; nom: string; poste: string | null; equipe: string | null; contrat: string | null;
  jours: number; jours_absents: number; detail: Record<string, number>; part: number; net: number; moi: boolean;
  exclu: { id: string | null; jours_planning: number } | null;
  ajustements: { id: string; montant: number; motif: string }[];
};
export type DonneesPourboires = {
  mois: string; a_jour: string; direction: boolean;
  pot: { carte: number; especes: number; total: number }; jours_ouverture: number; total_jours: number; valeur_jour: number;
  nb_clotures: number; soirs_cagnotte: string[]; lignes: LignePourboires[]; nb_personnes: number; inconnus: string[]; avertissement: string | null;
};

const ACCENT = "#D4775A", MUTED = "#999", BORD = "#ddd6c8", VERT = "#2f7d4f", ROUGE = "#b3261e";
const OSWALD = "var(--font-oswald), Oswald, sans-serif";
export const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const eur0 = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const jours = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
export const moisLong = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
export const moisCourant = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()).slice(0, 7);
export const decalerMois = (m: string, n: number) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const dateCourte = (j: string) => new Date(`${j}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

export function usePourboires(mois: string) {
  const [data, setData] = useState<DonneesPourboires | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let annule = false;
    (async () => {
      let d: DonneesPourboires | null = null, err: string | null = null;
      try {
        const r = await fetchApi(`/api/pourboires?mois=${mois}`);
        const j = await r.json().catch(() => null);
        if (!r.ok) err = j?.error ?? "Chargement impossible"; else d = j as DonneesPourboires;
      } catch (e) { err = e instanceof Error ? e.message : "Chargement impossible"; }
      if (annule) return;
      setData(d); setErreur(err); setChargement(false);
    })();
    return () => { annule = true; };
  }, [mois, version]);
  const recharger = useCallback(() => { setChargement(true); setVersion((v) => v + 1); }, []);
  return { data, erreur, chargement, recharger };
}

/** Carte « Mes pourboires » (Mon tableau) : la part estimée à J-1 */
export function MesPourboires() {
  const mois = moisCourant();
  const { data, erreur, chargement } = usePourboires(mois);
  if (chargement || erreur || !data) return null;
  const moi = data.lignes.find((l) => l.moi);
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: MUTED }}>Pourboires de {moisLong(mois)}</div>
        <div style={{ fontSize: 11, color: MUTED }}>à jour au {dateCourte(data.a_jour)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginTop: 8 }}>
        <div><div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 24 }}>{eur0(data.pot.total)}</div><div style={{ fontSize: 12, color: MUTED }}>le pot de l&apos;équipe<br />carte {eur0(data.pot.carte)} · espèces {eur0(data.pot.especes)}</div></div>
        {moi ? (<>
          <div><div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 24, color: ACCENT }}>{eur0(moi.net)}</div><div style={{ fontSize: 12, color: MUTED }}>ma part estimée{moi.ajustements.length ? ` (${moi.ajustements.map((a) => `${a.motif} ${a.montant > 0 ? "+" : ""}${eur0(a.montant)}`).join(", ")})` : ""}</div></div>
          <div><div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 24 }}>{jours(moi.jours)}<span style={{ fontSize: 14, color: MUTED }}> / {jours(data.total_jours)}</span></div><div style={{ fontSize: 12, color: MUTED }}>mes jours comptés / l&apos;équipe · {eur(data.valeur_jour)} le jour</div></div>
        </>) : <div style={{ fontSize: 13, color: MUTED, alignSelf: "center" }}>Pas encore de jour compté pour toi ce mois-ci.</div>}
      </div>
      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8, lineHeight: 1.4 }}>Part = pot ÷ jours de l&apos;équipe × tes jours. Un seul service dans la journée compte 0,5. Le montant final est celui de la fin du mois, versé avec la paie.</div>
    </div>
  );
}

/** Tableau complet de la direction, avec les ajustements */
export function TableauPourboires({ mois, onMois }: { mois: string; onMois: (m: string) => void }) {
  const { data, erreur, chargement, recharger } = usePourboires(mois);
  const [nouveau, setNouveau] = useState<{ employe: string; montant: string; motif: string }>({ employe: "", montant: "", motif: "" });
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const ajouter = async () => {
    const montant = Number(nouveau.montant.replace(",", "."));
    if (!nouveau.employe || !Number.isFinite(montant) || !nouveau.motif.trim()) { setEnvoi("Choisis la personne, le montant (négatif pour une déduction) et le motif."); return; }
    setEnvoi("Enregistrement…");
    const r = await fetchApi("/api/pourboires", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employe_id: nouveau.employe, mois, montant, motif: nouveau.motif }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { setEnvoi(j?.error ?? "Enregistrement impossible"); return; }
    setEnvoi(null); setNouveau({ employe: "", montant: "", motif: "" }); void recharger();
  };
  const retirer = async (id: string) => {
    const r = await fetchApi(`/api/pourboires?id=${id}`, { method: "DELETE" });
    if (r.ok) void recharger();
  };
  const exclure = async (employe_id: string) => {
    const r = await fetchApi("/api/pourboires", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employe_id, mois, exclu: true }) });
    if (r.ok) void recharger();
  };
  const copier = () => {
    if (!data) return;
    const l = [`Pourboires Bello Mio — ${moisLong(mois)} (à jour au ${dateCourte(data.a_jour)})`, `Pot : ${eur(data.pot.total)} (carte ${eur(data.pot.carte)}, espèces ${eur(data.pot.especes)}) · ${jours(data.total_jours)} jours · ${eur(data.valeur_jour)} le jour`,
      "Nom\tPoste\tJours\tPart\tAjustements\tNet", ...data.lignes.map((x) => `${x.nom} ${x.prenom}\t${x.poste ?? ""}\t${jours(x.jours)}\t${eur(x.part)}\t${x.ajustements.map((a) => `${a.motif} ${eur(a.montant)}`).join(" ; ")}\t${eur(x.net)}`)];
    void navigator.clipboard?.writeText(l.join("\n")).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1600); });
  };
  const cellule = { padding: "8px 6px", borderBottom: "1px solid #f0ebe2", fontVariantNumeric: "tabular-nums" as const };
  const entete = { ...cellule, fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase" as const, letterSpacing: ".06em", borderBottom: `2px solid ${BORD}` };
  const btn = { border: `1px solid ${BORD}`, borderRadius: 8, background: "#fff", padding: "6px 12px", fontSize: 13, cursor: "pointer", color: "#1a1a1a", fontWeight: 600 } as const;
  const input = { font: "inherit", fontSize: 14, padding: "7px 10px", border: `1.5px solid ${BORD}`, borderRadius: 9, background: "#faf8f4" } as const;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f5f3f0", borderRadius: 12, padding: "10px 16px" }}>
        <button type="button" onClick={() => onMois(decalerMois(mois, -1))} style={btn}>←</button>
        <strong style={{ fontFamily: OSWALD, fontSize: 18, textTransform: "capitalize" }}>{moisLong(mois)}</strong>
        <button type="button" onClick={() => onMois(decalerMois(mois, 1))} disabled={mois >= moisCourant()} style={{ ...btn, opacity: mois >= moisCourant() ? 0.4 : 1 }}>→</button>
      </div>
      {chargement && <p style={{ color: MUTED, textAlign: "center", padding: 24 }}>Chargement…</p>}
      {erreur && <p style={{ color: ROUGE }}>{erreur}</p>}
      {data && (<>
        {data.avertissement && <div style={{ background: "#F8E5E2", color: ROUGE, borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>{data.avertissement}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {[["Pot du mois", eur(data.pot.total), `carte ${eur(data.pot.carte)} · espèces ${eur(data.pot.especes)}`],
            ["Jours d'ouverture", String(data.jours_ouverture), `${data.nb_clotures} clôture${data.nb_clotures > 1 ? "s" : ""} · à jour au ${dateCourte(data.a_jour)}`],
            ["Jours comptés", jours(data.total_jours), `${data.nb_personnes} personne${data.nb_personnes > 1 ? "s" : ""}`],
            ["Valeur d'un jour", eur(data.valeur_jour), "pot ÷ jours comptés"]].map(([l, v, s]) => (
            <div key={l} style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: MUTED }}>{l}</div>
              <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 24, marginTop: 2 }}>{v}</div>
              <div style={{ fontSize: 12, color: MUTED }}>{s}</div>
            </div>
          ))}
        </div>
        {data.soirs_cagnotte.length > 0 && <div style={{ fontSize: 12.5, color: MUTED }}>Cagnotte vidée le : {data.soirs_cagnotte.map(dateCourte).join(", ")}.</div>}
        {data.inconnus.length > 0 && <div style={{ fontSize: 12.5, color: ROUGE }}>Dans le planning Combo mais sans fiche employé ici (jours non comptés) : {data.inconnus.join(", ")}.</div>}
        <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, padding: "4px 12px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
            <thead><tr>
              <th style={{ ...entete, textAlign: "left" }}>Nom</th><th style={{ ...entete, textAlign: "left" }}>Poste</th>
              <th style={{ ...entete, textAlign: "right" }}>Jours présents</th><th style={{ ...entete, textAlign: "right" }}>Absents</th>
              <th style={{ ...entete, textAlign: "right" }}>Part</th><th style={{ ...entete, textAlign: "left" }}>Ajustements</th><th style={{ ...entete, textAlign: "right" }}>Net</th>
            </tr></thead>
            <tbody>
              {data.lignes.map((x) => (
                <tr key={x.employe_id}>
                  <td style={{ ...cellule, fontWeight: 600, color: x.exclu ? MUTED : "#1a1a1a" }}>{x.nom} {x.prenom}{x.contrat === "extra" ? <span style={{ color: MUTED, fontWeight: 400 }}> · extra</span> : ""}
                    {x.exclu
                      ? <span style={{ fontWeight: 400, fontSize: 12 }}> · pas compté ce mois ({jours(x.exclu.jours_planning)} j au planning) {x.exclu.id && <button type="button" onClick={() => void retirer(x.exclu!.id!)} style={{ border: 0, background: "none", color: ACCENT, cursor: "pointer", padding: 0, font: "inherit", textDecoration: "underline" }}>recompter</button>}</span>
                      : <button type="button" onClick={() => void exclure(x.employe_id)} title="Ne pas compter ce mois" style={{ border: 0, background: "none", color: MUTED, cursor: "pointer", padding: "0 4px", fontSize: 11 }}>ne pas compter</button>}
                  </td>
                  <td style={{ ...cellule, color: MUTED }}>{x.poste ?? "—"}</td>
                  <td style={{ ...cellule, textAlign: "right" }} title={Object.entries(x.detail).map(([j, v]) => `${dateCourte(j)} : ${v}`).join("\n")}>{jours(x.jours)}</td>
                  <td style={{ ...cellule, textAlign: "right", color: MUTED }}>{jours(x.jours_absents)}</td>
                  <td style={{ ...cellule, textAlign: "right" }}>{eur(x.part)}</td>
                  <td style={{ ...cellule, fontSize: 12 }}>{x.ajustements.map((a) => (
                    <span key={a.id} style={{ display: "inline-flex", gap: 4, alignItems: "center", marginRight: 8 }}>{a.motif} <b style={{ color: a.montant < 0 ? ROUGE : VERT }}>{a.montant > 0 ? "+" : ""}{eur(a.montant)}</b>
                      <button type="button" onClick={() => void retirer(a.id)} aria-label="Retirer" style={{ border: 0, background: "none", color: MUTED, cursor: "pointer", padding: 0 }}>×</button></span>
                  ))}</td>
                  <td style={{ ...cellule, textAlign: "right", fontWeight: 700 }}>{eur(x.net)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...cellule, fontWeight: 700, borderTop: `1.5px solid ${BORD}` }} colSpan={2}>Total</td>
                <td style={{ ...cellule, textAlign: "right", fontWeight: 700, borderTop: `1.5px solid ${BORD}` }}>{jours(data.total_jours)}</td>
                <td style={{ ...cellule, borderTop: `1.5px solid ${BORD}` }} />
                <td style={{ ...cellule, textAlign: "right", fontWeight: 700, borderTop: `1.5px solid ${BORD}` }}>{eur(data.lignes.reduce((t, x) => t + x.part, 0))}</td>
                <td style={{ ...cellule, borderTop: `1.5px solid ${BORD}` }} />
                <td style={{ ...cellule, textAlign: "right", fontWeight: 700, borderTop: `1.5px solid ${BORD}` }}>{eur(data.lignes.reduce((t, x) => t + x.net, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, padding: "12px 14px", display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Ajouter un ajustement</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <select value={nouveau.employe} onChange={(e) => setNouveau((n) => ({ ...n, employe: e.target.value }))} style={{ ...input, minWidth: 160 }}>
              <option value="">Personne…</option>
              {data.lignes.map((x) => <option key={x.employe_id} value={x.employe_id}>{x.nom} {x.prenom}</option>)}
            </select>
            <input inputMode="decimal" placeholder="Montant (−400 = déduction)" value={nouveau.montant} onChange={(e) => setNouveau((n) => ({ ...n, montant: e.target.value }))} style={{ ...input, width: 200 }} />
            <input placeholder="Motif : acompte, report de juillet…" value={nouveau.motif} onChange={(e) => setNouveau((n) => ({ ...n, motif: e.target.value }))} style={{ ...input, flex: "1 1 200px" }} />
            <button type="button" onClick={() => void ajouter()} style={{ ...btn, background: ACCENT, borderColor: ACCENT, color: "#fff" }}>Ajouter</button>
          </div>
          {envoi && <div style={{ fontSize: 12.5, color: envoi.startsWith("Enregistrement") ? MUTED : ROUGE }}>{envoi}</div>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={copier} style={btn}>{copie ? "Copié" : "Copier le tableau pour la paie"}</button>
          <span style={{ fontSize: 12, color: MUTED }}>Collable dans Excel ou dans un mail.</span>
        </div>
        <details style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, maxWidth: "70ch" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "#1a1a1a" }}>Les règles</summary>
          <p>Pot = pourboires carte (ticket Z du TPE, Conecs compris, chaque clôture) + pourboires espèces (cagnotte vidée et comptée le vendredi à la clôture), du 1er au dernier jour du mois.</p>
          <p>Part = pot ÷ jours comptés de l&apos;équipe × jours comptés de la personne. Les jours viennent du planning Combo, jusqu&apos;à la veille. Un jour travaillé compte 1 ; un seul service dans la journée compte 0,5 (deux services, ou un service de 7 h et plus, font la journée). Congés payés, maladie et absence injustifiée ne comptent pas ; formation, visite médicale, RTT et récupération comptent. Les jours d&apos;absence ne créent pas de reliquat : la valeur du jour monte pour les présents.</p>
          <p>Les ajustements (acompte à déduire, report du mois précédent) s&apos;ajoutent à la part. « Ne pas compter » sort la personne du mois : ni ses jours, ni de part. Versement mensuel avec la paie.</p>
        </details>
      </>)}
    </div>
  );
}

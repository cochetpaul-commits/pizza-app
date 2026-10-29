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
  jours_combo: number; jours_force: { id: string; jours: number; motif: string } | null;
  ajustements: { id: string; montant: number; motif: string }[];
};
export type DonneesPourboires = {
  mois: string; a_jour: string; direction: boolean;
  pot: { carte: number; especes: number; total: number; complements: { id: string; montant: number; motif: string }[] }; jours_ouverture: number; jours_sans_cloture: string[]; total_jours: number; valeur_jour: number;
  nb_clotures: number; soirs_cagnotte: string[]; lignes: LignePourboires[]; nb_personnes: number; inconnus: string[]; avertissement: string | null;
};

import { Tuile } from "@/components/ui/Tuile";
import { ACCENT, BON, BORD, BTN, CADRE, CHAMP, MAUVAIS, MUTED, OSWALD, TD, TH, liseret, pastille } from "@/components/ui/charte";
const VERT = BON, ROUGE = MAUVAIS;
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
      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8, lineHeight: 1.4 }}>Part = pot ÷ jours de l&apos;équipe × tes jours. Un seul service dans la journée compte 0,5. Le montant final est celui de la fin du mois, versé avec la paie.
        {data.direction && <> <a href="/rh/pourboires" style={{ color: ACCENT, fontWeight: 700 }}>Voir la répartition de toute l&apos;équipe →</a></>}</div>
    </div>
  );
}

/** Tableau complet de la direction, avec les ajustements */
export function TableauPourboires({ mois, onMois }: { mois: string; onMois: (m: string) => void }) {
  const { data, erreur, chargement, recharger } = usePourboires(mois);
  const [nouveau, setNouveau] = useState<{ employe: string; montant: string; motif: string }>({ employe: "", montant: "", motif: "" });
  const [complement, setComplement] = useState<{ montant: string; motif: string }>({ montant: "", motif: "" });
  const ajouterComplement = async () => {
    const montant = Number(complement.montant.replace(",", "."));
    if (!Number.isFinite(montant) || !complement.motif.trim()) { setEnvoi("Montant et motif du complément requis."); return; }
    setEnvoi("Enregistrement…");
    const r = await fetchApi("/api/pourboires", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pot: true, mois, montant, motif: complement.motif }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { setEnvoi(j?.error ?? "Enregistrement impossible"); return; }
    setEnvoi(null); setComplement({ montant: "", motif: "" }); void recharger();
  };
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
  const [edition, setEdition] = useState<{ employe: string; valeur: string } | null>(null);
  const forcerJours = async (employe_id: string, valeur: string | null) => {
    const jours = valeur == null ? null : Number(valeur.replace(",", "."));
    if (jours != null && (!Number.isFinite(jours) || jours < 0)) { setEnvoi("Nombre de jours invalide."); return; }
    const r = await fetchApi("/api/pourboires", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employe_id, mois, jours }) });
    setEdition(null);
    if (r.ok) void recharger(); else setEnvoi("Correction non enregistrée");
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
  const cellule = { ...TD, fontVariantNumeric: "tabular-nums" as const };
  const entete = TH;
  const btn = BTN;
  const input = { ...CHAMP, height: undefined, padding: "7px 10px" } as const;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <style>{`.pb-ligne:hover td{background:#f7f3ec}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={() => onMois(decalerMois(mois, -1))} aria-label="Mois précédent" style={{ ...btn, width: 36, padding: 0 }}>‹</button>
        <strong style={{ fontFamily: OSWALD, fontSize: 18, textTransform: "capitalize", minWidth: 150, textAlign: "center" }}>{moisLong(mois)}</strong>
        <button type="button" onClick={() => onMois(decalerMois(mois, 1))} disabled={mois >= moisCourant()} aria-label="Mois suivant" style={{ ...btn, width: 36, padding: 0, opacity: mois >= moisCourant() ? 0.4 : 1 }}>›</button>
      </div>
      {chargement && <p style={{ color: MUTED, textAlign: "center", padding: 24 }}>Chargement…</p>}
      {erreur && <p style={{ color: ROUGE }}>{erreur}</p>}
      {data && (<>
        {data.avertissement && <div style={{ background: "#f7f3ec", color: ROUGE, borderRadius: 12, padding: "10px 12px", fontSize: 13 }}>{data.avertissement}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
          <Tuile icone="euro" libelle="Pot du mois" valeur={eur(data.pot.total)} couleur={ACCENT} sous={`carte ${eur(data.pot.carte)} · espèces ${eur(data.pot.especes)}`} />
          <Tuile icone="attente" libelle="Jours d'ouverture" valeur={String(data.jours_ouverture)} couleur="#1a1a1a" sous={`${data.nb_clotures} clôture${data.nb_clotures > 1 ? "s" : ""} · à jour au ${dateCourte(data.a_jour)}`} />
          <Tuile icone="couverts" libelle="Jours comptés" valeur={jours(data.total_jours)} couleur="#1a1a1a" sous={`${data.nb_personnes} personne${data.nb_personnes > 1 ? "s" : ""}`} />
          <Tuile icone="ticket" libelle="Valeur d'un jour" valeur={eur(data.valeur_jour)} couleur={BON} sous="pot ÷ jours comptés" />
        </div>
        {data.soirs_cagnotte.length > 0 && <div style={{ fontSize: 12.5, color: MUTED }}>Cagnotte vidée le : {data.soirs_cagnotte.map(dateCourte).join(", ")}.</div>}
        {data.jours_sans_cloture.length > 0 && <div style={{ fontSize: 12.5, color: ROUGE }}>Jours au planning sans clôture dans l&apos;app (leurs pourboires carte manquent au pot) : {data.jours_sans_cloture.map(dateCourte).join(", ")}. Complète le pot avec le rapport du TPE, ci-dessous.</div>}
        {data.pot.complements.length > 0 && <div style={{ fontSize: 12.5, color: MUTED }}>Compléments du pot : {data.pot.complements.map((c) => <span key={c.id} style={{ marginRight: 8 }}>{c.motif} <b>{eur(c.montant)}</b> <button type="button" onClick={() => void retirer(c.id)} aria-label="Retirer" style={{ border: 0, background: "none", color: MUTED, cursor: "pointer", padding: 0 }}>×</button></span>)}</div>}
        {data.inconnus.length > 0 && <div style={{ fontSize: 12.5, color: ROUGE }}>Dans le planning Combo mais sans fiche employé ici (jours non comptés) : {data.inconnus.join(", ")}.</div>}
        <div style={{ ...CADRE, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
            <thead><tr>
              <th style={{ ...entete, padding: 0, width: 6 }} /><th style={{ ...entete, textAlign: "left" }}>Nom</th><th style={{ ...entete, textAlign: "left" }}>Poste</th>
              <th style={{ ...entete, textAlign: "right" }}>Jours présents</th><th style={{ ...entete, textAlign: "right" }}>Absents</th>
              <th style={{ ...entete, textAlign: "right" }}>Part</th><th style={{ ...entete, textAlign: "left" }}>Ajustements</th><th style={{ ...entete, textAlign: "right" }}>Net</th>
            </tr></thead>
            <tbody>
              {data.lignes.map((x) => (
                <tr key={x.employe_id} className="pb-ligne">
                  <td style={liseret(x.exclu ? "#d6d0c4" : x.contrat === "extra" ? "#b7791f" : BON)} />
                  <td style={{ ...cellule, fontWeight: 600, color: x.exclu ? MUTED : "#1a1a1a" }}>{x.nom} {x.prenom}{x.contrat === "extra" ? <span style={{ ...pastille("#b7791f"), marginLeft: 6 }}>extra</span> : ""}
                    {x.exclu
                      ? <span style={{ fontWeight: 400, fontSize: 12 }}> · pas compté ce mois ({jours(x.exclu.jours_planning)} j au planning) {x.exclu.id && <button type="button" onClick={() => void retirer(x.exclu!.id!)} style={{ border: 0, background: "none", color: ACCENT, cursor: "pointer", padding: 0, font: "inherit", textDecoration: "underline" }}>recompter</button>}</span>
                      : <button type="button" onClick={() => void exclure(x.employe_id)} title="Ne pas compter ce mois" style={{ border: 0, background: "none", color: MUTED, cursor: "pointer", padding: "0 4px", fontSize: 11 }}>ne pas compter</button>}
                  </td>
                  <td style={{ ...cellule, color: MUTED }}>{x.poste ?? "—"}</td>
                  <td style={{ ...cellule, textAlign: "right", whiteSpace: "nowrap" }} title={x.jours_force ? `Corrigé par la direction (planning Combo : ${jours(x.jours_combo)})` : Object.entries(x.detail).map(([j, v]) => `${dateCourte(j)} : ${v}`).join("\n")}>
                    {edition?.employe === x.employe_id ? (
                      <input autoFocus inputMode="decimal" value={edition.valeur} onChange={(e) => setEdition({ employe: x.employe_id, valeur: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") void forcerJours(x.employe_id, edition.valeur); if (e.key === "Escape") setEdition(null); }}
                        onBlur={() => void forcerJours(x.employe_id, edition.valeur)} style={{ ...input, width: 64, textAlign: "right", padding: "4px 6px" }} />
                    ) : x.exclu ? jours(x.jours) : (
                      <button type="button" onClick={() => setEdition({ employe: x.employe_id, valeur: String(x.jours).replace(".", ",") })} title="Corriger le compteur" style={{ border: 0, background: "none", font: "inherit", cursor: "pointer", color: x.jours_force ? ACCENT : "#1a1a1a", fontWeight: x.jours_force ? 700 : 400, padding: 0, textDecoration: "underline dotted" }}>{jours(x.jours)}</button>
                    )}
                    {x.jours_force && !edition && <button type="button" onClick={() => void forcerJours(x.employe_id, null)} title={`Revenir au planning Combo (${jours(x.jours_combo)})`} style={{ border: 0, background: "none", color: MUTED, cursor: "pointer", padding: "0 0 0 4px", fontSize: 11 }}>↺</button>}
                  </td>
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
                <td style={{ ...cellule, padding: 0, borderTop: `1.5px solid ${BORD}` }} />
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
        <div style={{ ...CADRE, padding: "14px 16px", display: "grid", gap: 8 }}>
          <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em" }}>Ajouter un ajustement</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <select value={nouveau.employe} onChange={(e) => setNouveau((n) => ({ ...n, employe: e.target.value }))} style={{ ...input, minWidth: 160 }}>
              <option value="">Personne…</option>
              {data.lignes.map((x) => <option key={x.employe_id} value={x.employe_id}>{x.nom} {x.prenom}</option>)}
            </select>
            <input inputMode="decimal" placeholder="Montant (−400 = déduction)" value={nouveau.montant} onChange={(e) => setNouveau((n) => ({ ...n, montant: e.target.value }))} style={{ ...input, width: 200 }} />
            <input placeholder="Motif : acompte, report de juillet…" value={nouveau.motif} onChange={(e) => setNouveau((n) => ({ ...n, motif: e.target.value }))} style={{ ...input, flex: "1 1 200px" }} />
            <button type="button" onClick={() => void ajouter()} style={{ ...btn, background: ACCENT, borderColor: ACCENT, color: "#fff" }}>Ajouter</button>
          </div>
          <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em", marginTop: 6 }}>Compléter le pot carte</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: -6 }}>Pour les jours sans clôture dans l&apos;app : le rapport du personnel du TPE donne le total des pourboires du mois, tu ajoutes la différence.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <input inputMode="decimal" placeholder="Montant" value={complement.montant} onChange={(e) => setComplement((n) => ({ ...n, montant: e.target.value }))} style={{ ...input, width: 140 }} />
            <input placeholder="Motif : rapport TPE du 1er au 11…" value={complement.motif} onChange={(e) => setComplement((n) => ({ ...n, motif: e.target.value }))} style={{ ...input, flex: "1 1 200px" }} />
            <button type="button" onClick={() => void ajouterComplement()} style={btn}>Ajouter au pot</button>
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
          <p>Le compteur « Jours présents » se corrige en cliquant dessus (la direction) : le nombre saisi remplace le planning Combo pour le mois, ↺ y revient. Les ajustements (acompte à déduire, report du mois précédent) s&apos;ajoutent à la part. « Ne pas compter » sort la personne du mois : ni ses jours, ni de part. Versement mensuel avec la paie.</p>
        </details>
      </>)}
    </div>
  );
}

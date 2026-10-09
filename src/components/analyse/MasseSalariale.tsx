"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DateRange } from "@/components/ui/DateRangePicker";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { usePilotageRange } from "@/lib/pilotageRange";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { supabase } from "@/lib/supabaseClient";
import { EnteteAnalyse, TuileVariation, Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { GraphBarres } from "@/components/analyse/GraphBarres";
import { useStatsVentes } from "@/components/analyse/useStatsVentes";
import { AMBRE, BLEU, FAIBLE, MUTED, ROUGE, VERT, euros, nombre, pct, libelleMoisLong } from "@/components/analyse/gabarit";
import type { MoisMarge } from "@/app/api/analyse/marge/route";
import { EtatVide } from "@/components/ui/EtatVide";

/**
 * Analyse › Masse salariale (10/10/2026) : « L'équipe coûte combien ? »
 * Estimation = heures travaillées du planning Combo × salaire des contrats × 42 % de charges,
 * par équipe et par personne, face au CA HT et à l'objectif ; heures sup ; coût par couvert ;
 * comparaison avec la paie réellement passée (Pennylane) quand le mois est importé.
 * Les calculs sont ceux de l'ancienne page RH › Masse salariale ; les simulations sont dans Analyse › Simulations.
 */
type Presence = { combo_nom: string; equipe: string | null; employe_id: string | null; matched: boolean; heures_planifiees: number; heures_travaillees: number; heures_contrat: number; nb_repas: number; nb_jours_travailles: number; ecart_total: number };
type Contrat = { employe_id: string; prenom: string; nom: string; type: string; heures_semaine: number; remuneration: number; emploi: string; equipes_access: string[] };
type Employe = { nom: string; equipe: string; type: string; emploi: string; hContrat: number; hTrav: number; hs: number; brut: number; coutCharge: number; coutHS: number; repas: number; jours: number; sansContrat: boolean };
const CHARGES = 0.42;
const COULEURS_EQUIPE: Record<string, string> = { Cuisine: "#D97706", Salle: "#5e8278", Bar: "#8a6b3e", Autre: "#b0a894" };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function semaineDe(d: Date): DateRange { const dow = d.getDay() || 7; const lun = new Date(d); lun.setDate(d.getDate() - dow + 1); const dim = new Date(lun); dim.setDate(lun.getDate() + 6); return { from: iso(lun), to: iso(dim) }; }
function moisDe(d: Date): DateRange { return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }; }
const normalise = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function MasseSalariale() {
  useEtabAuto();
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const [range, setRange] = usePilotageRange(() => semaineDe(new Date()));
  // Les heures Combo sont hebdomadaires : la période choisie est calée sur la semaine qui contient
  // son début, ou sur le mois entier si elle couvre au moins 25 jours.
  const selection = useMemo(() => {
    const d0 = new Date(range.from + "T12:00:00"), d1 = new Date(range.to + "T12:00:00");
    const jours = Math.round((d1.getTime() - d0.getTime()) / 86400000) + 1;
    if (jours >= 25) return { mode: "mois" as const, ...moisDe(d0), libelle: libelleMoisLong(range.from.slice(0, 7)) };
    const s = semaineDe(d0);
    return { mode: "semaine" as const, ...s, libelle: `semaine du ${new Date(s.from + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` };
  }, [range.from, range.to]);
  const periode = useMemo<DateRange>(() => ({ from: selection.from, to: selection.to }), [selection.from, selection.to]);
  const { stats, chargement: chargementVentes } = useStatsVentes(periode);
  const etabId = etab?.id ?? "";
  const cle = `${etabId}|${selection.from}|${selection.to}`;
  const [etat, setEtat] = useState<{ cle: string; presences: Presence[]; contrats: Contrat[]; paie: number | null; objectif: number | null; erreur: string | null }>({ cle: "", presences: [], contrats: [], paie: null, objectif: null, erreur: null });
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<"sync" | "import" | null>(null);
  const [tick, setTick] = useState(0);

  const charger = useCallback(async (annule: () => boolean) => {
    try {
      const [pres, cts, marge, obj] = await Promise.all([
        supabase.from("combo_presences").select("combo_nom, equipe, employe_id, matched, heures_planifiees, heures_travaillees, heures_contrat, nb_repas, nb_jours_travailles, ecart_total")
          .eq("etablissement_id", etabId).gte("periode_debut", selection.from).lte("periode_fin", selection.to),
        supabase.rpc("contrats_admin", { p_etab: etabId }).then(async (r) => {
          if (r.error) return [] as Contrat[];
          const actifs = ((r.data ?? []) as Record<string, unknown>[]).filter((c) => c.actif);
          const ids = [...new Set(actifs.map((c) => c.employe_id as string))];
          const emps = ids.length ? await supabase.from("employes").select("id, prenom, nom, equipes_access, actif").in("id", ids).eq("actif", true) : { data: [] as Record<string, unknown>[] };
          const parId = new Map(((emps.data ?? []) as Record<string, unknown>[]).map((e) => [e.id as string, e]));
          return actifs.filter((c) => parId.has(c.employe_id as string)).map((c) => { const e = parId.get(c.employe_id as string)!; return { employe_id: c.employe_id as string, prenom: e.prenom as string, nom: e.nom as string, type: c.type as string, heures_semaine: Number(c.heures_semaine), remuneration: Number(c.remuneration), emploi: (c.emploi as string) ?? "", equipes_access: (e.equipes_access as string[]) ?? [] }; });
        }),
        selection.mode === "mois" ? fetchApi(`/api/analyse/marge?etablissement_id=${etabId}&from=${selection.from}&to=${selection.to}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
        fetchApi(`/api/pilotage/objectifs?etablissement_id=${etabId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (annule()) return;
      const mois = (marge?.mois ?? []) as MoisMarge[];
      const paie = mois.length ? mois[0].postes.masse_salariale ?? null : null;
      setEtat({ cle, presences: (pres.data ?? []) as Presence[], contrats: cts, paie: paie && paie > 0 ? paie : null, objectif: obj?.objectifs?.ratio_masse_sal?.valeur ?? null, erreur: pres.error?.message ?? null });
    } catch (e) { if (!annule()) setEtat({ cle, presences: [], contrats: [], paie: null, objectif: null, erreur: e instanceof Error ? e.message : "Chargement impossible" }); }
  }, [cle, etabId, selection.from, selection.to, selection.mode]);
  useEffect(() => {
    if (!etabId) return;
    let annule = false;
    // Lancement différé : le chargement met l'état à jour après ses requêtes, jamais pendant le rendu
    const t = setTimeout(() => { void charger(() => annule); }, 0);
    return () => { annule = true; clearTimeout(t); };
  }, [charger, etabId, tick]);
  const chargement = chargementVentes || etat.cle !== cle;

  const employes = useMemo<Employe[]>(() => {
    const parNom = new Map<string, Presence & { n: number }>();
    for (const p of etat.presences) {
      const prev = parNom.get(p.combo_nom);
      if (prev) { prev.heures_planifiees += p.heures_planifiees; prev.heures_travaillees += p.heures_travaillees; prev.nb_repas += p.nb_repas; prev.nb_jours_travailles += p.nb_jours_travailles; prev.ecart_total += p.ecart_total; prev.n++; }
      else parNom.set(p.combo_nom, { ...p, n: 1 });
    }
    const prorata = selection.mode === "semaine" ? 12 / 52 : 1;
    return [...parNom.entries()].map(([nom, p]) => {
      const contrat = etat.contrats.find((c) => normalise(`${c.prenom} ${c.nom}`) === normalise(nom));
      const hContrat = contrat?.heures_semaine ?? p.heures_contrat ?? 0;
      const brut = contrat?.remuneration ?? 0, type = contrat?.type ?? "?";
      const equipe = p.equipe ?? contrat?.equipes_access?.[0] ?? "Autre";
      const hs = Math.max(0, p.ecart_total);
      const tauxH = hContrat > 0 && brut > 0 ? brut / (hContrat * 52 / 12) : 0;
      const coutHS = hs * tauxH * 1.1 * (1 + CHARGES);
      const heuresNormales = Math.max(0, p.heures_travaillees - hs);
      const brutPeriode = type === "TNS" || tauxH <= 0 ? brut * prorata : heuresNormales * tauxH;
      return { nom, equipe, type, emploi: contrat?.emploi ?? "", hContrat, hTrav: p.heures_travaillees, hs, brut: brutPeriode, coutCharge: brutPeriode * (1 + CHARGES), coutHS, repas: p.nb_repas, jours: p.nb_jours_travailles, sansContrat: !contrat };
    }).sort((a, b) => b.coutCharge - a.coutCharge);
  }, [etat.presences, etat.contrats, selection.mode]);
  const totaux = useMemo(() => employes.reduce((t, e) => ({ hTrav: t.hTrav + e.hTrav, hContrat: t.hContrat + e.hContrat * (selection.mode === "mois" ? 52 / 12 : 1), hs: t.hs + e.hs, coutHS: t.coutHS + e.coutHS, ms: t.ms + e.coutCharge, brut: t.brut + e.brut, sansContrat: t.sansContrat + (e.sansContrat ? 1 : 0) }), { hTrav: 0, hContrat: 0, hs: 0, coutHS: 0, ms: 0, brut: 0, sansContrat: 0 }), [employes, selection.mode]);
  const equipes = useMemo(() => {
    const m = new Map<string, { equipe: string; n: number; hTrav: number; hContrat: number; hs: number; ms: number }>();
    for (const e of employes) { const x = m.get(e.equipe) ?? { equipe: e.equipe, n: 0, hTrav: 0, hContrat: 0, hs: 0, ms: 0 }; x.n++; x.hTrav += e.hTrav; x.hContrat += e.hContrat * (selection.mode === "mois" ? 52 / 12 : 1); x.hs += e.hs; x.ms += e.coutCharge + e.coutHS; m.set(e.equipe, x); }
    return [...m.values()].sort((a, b) => b.ms - a.ms);
  }, [employes, selection.mode]);
  const caHt = stats?.ca_ht ?? 0, couverts = stats?.couverts ?? 0;
  const msTotale = totaux.ms + totaux.coutHS;
  const ratio = caHt > 0 ? (msTotale / caHt) * 100 : null;
  const objectif = etat.objectif ?? 35;
  const couleurRatio = ratio == null ? undefined : ratio <= objectif ? VERT : ratio <= objectif + 8 ? AMBRE : ROUGE;
  const raccourcis: { libelle: string; r: DateRange }[] = (() => { const auj = new Date(); const sem = new Date(auj); sem.setDate(sem.getDate() - 7); const moisPrec = new Date(auj.getFullYear(), auj.getMonth() - 1, 15); return [{ libelle: "Cette semaine", r: semaineDe(auj) }, { libelle: "Semaine dernière", r: semaineDe(sem) }, { libelle: "Ce mois", r: moisDe(auj) }, { libelle: "Mois dernier", r: moisDe(moisPrec) }]; })();

  async function synchroniser() {
    setOccupe("sync"); setMessage(null);
    try {
      const res = await fetchApi("/api/rh/combo-presences-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: selection.from, to: selection.to }) });
      const d = await res.json();
      setMessage(d.ok ? `Combo synchronisé : ${d.inserted} présences.` : `Erreur : ${d.error ?? "inconnue"}`);
      if (d.ok) { try { localStorage.setItem("combo_last_sync", String(Date.now())); } catch { /* */ } setTick((t) => t + 1); }
    } catch (e) { setMessage(`Erreur : ${String(e)}`); }
    setOccupe(null);
  }
  async function importer(f: File) {
    if (!etab) return;
    setOccupe("import"); setMessage(null);
    const fd = new FormData(); fd.append("file", f); fd.append("mode", "commit");
    try {
      const res = await fetchApi("/api/rh/combo-import", { method: "POST", headers: { "x-etablissement-id": etab.id }, body: fd });
      const j = await res.json();
      setMessage(j.ok ? `${j.nb_employes} employés importés.` : `Erreur : ${j.error ?? "inconnue"}`);
      if (j.ok) setTick((t) => t + 1);
    } catch (e) { setMessage(`Erreur : ${String(e)}`); }
    setOccupe(null);
  }
  const BTN: React.CSSProperties = { height: 34, padding: "0 12px", borderRadius: 10, border: "1px solid #ddd6c8", background: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <EnteteAnalyse titre="Masse salariale" question="L'équipe coûte combien ? Les heures du planning Combo valorisées aux contrats, face au CA et à l'objectif." range={range} onRange={setRange}
        raccourcis={raccourcis} comparaison={`${selection.libelle} · heures Combo`}
        droite={<>
          <button type="button" onClick={() => void synchroniser()} disabled={occupe != null} style={{ ...BTN, opacity: occupe ? 0.6 : 1 }}>{occupe === "sync" ? "Synchro…" : "Sync Combo"}</button>
          <label style={{ ...BTN, opacity: occupe ? 0.6 : 1 }}>{occupe === "import" ? "Import…" : "Importer une feuille Combo"}<input type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importer(f); }} /></label>
        </>} />
      {message && <div style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(74,103,65,0.1)", color: VERT, fontSize: 13, fontWeight: 600 }}>{message}</div>}
      {etat.erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: ROUGE, fontSize: 13 }}>{etat.erreur}</div>}
      {chargement && employes.length === 0 && <Chargement texte="Lecture des présences Combo et des contrats…" />}
      {!chargement && employes.length === 0 && <Cadre><EtatVide icone="equipe" titre="Aucune présence Combo sur cette période" texte="Lancez « Sync Combo » ou importez la feuille de présence de la période." /></Cadre>}

      {employes.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(5, 1fr)" : "repeat(2, 1fr)", gap: bureau ? 10 : 8, opacity: chargement ? 0.6 : 1 }}>
            <TuileVariation compacte={!bureau} icone="euro" libelle="Masse salariale chargée" valeur={euros(msTotale)} actuel={msTotale} precedent={null} sous={`brut ${euros(totaux.brut)} · charges 42 %`} />
            <TuileVariation compacte={!bureau} icone="foodcost" couleur={couleurRatio} libelle="Ratio sur le CA HT" valeur={ratio != null ? pct(ratio, 1) : "—"} actuel={ratio ?? 0} precedent={null} sous={caHt ? `CA HT ${euros(caHt)} · objectif ≤ ${pct(objectif)}` : "pas de ventes sur la période"} />
            <TuileVariation compacte={!bureau} icone="couverts" couleur={BLEU} libelle="Heures travaillées" valeur={`${nombre(totaux.hTrav)} h`} actuel={totaux.hTrav} precedent={null} sous={`${employes.length} personnes · contrats ${nombre(totaux.hContrat)} h`} />
            <TuileVariation compacte={!bureau} icone="alerte" couleur={totaux.hs > 0 ? ROUGE : VERT} libelle="Heures sup" valeur={`${nombre(totaux.hs, 1)} h`} actuel={totaux.hs} precedent={null} inverse sous={totaux.hs > 0 ? `environ ${euros(totaux.coutHS)} chargés` : "aucune heure au-delà des contrats"} />
            <TuileVariation compacte={!bureau} icone="ticket" libelle="Coût par couvert" valeur={couverts ? euros(msTotale / couverts, 2) : "—"} actuel={couverts ? msTotale / couverts : 0} precedent={null} sous={`${nombre(couverts)} couverts`} />
          </div>

          {selection.mode === "mois" && (
            <Cadre titre={`Paie réelle · ${selection.libelle}`} sous="Ce que Pennylane a enregistré en masse salariale ce mois-ci, face à l'estimation.">
              {etat.paie != null ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 13 }}>
                  <span>Paie passée (Pennylane) <b>{euros(etat.paie)}</b></span>
                  <span>Estimation planning <b>{euros(msTotale)}</b></span>
                  <span>Écart <b style={{ color: Math.abs(etat.paie - msTotale) / Math.max(1, etat.paie) > 0.15 ? AMBRE : VERT }}>{euros(etat.paie - msTotale)}</b></span>
                  {caHt > 0 && <span>Ratio réel <b style={{ color: (etat.paie / caHt) * 100 <= objectif ? VERT : ROUGE }}>{pct((etat.paie / caHt) * 100, 1)}</b></span>}
                </div>
              ) : <div style={{ fontSize: 13, color: MUTED }}>Pas encore de paie importée dans Pennylane pour ce mois : l&apos;estimation fait foi en attendant.</div>}
              <Note>La paie est comptabilisée le mois de son règlement : un écart d&apos;un mois est normal. L&apos;estimation ne compte ni primes, ni congés payés, ni indemnités.</Note>
            </Cadre>
          )}

          <Cadre titre="Heures par équipe" sous="Heures de contrat et heures travaillées sur la période.">
            <GraphBarres format={(v) => `${nombre(v)} h`} etiquettes={equipes.map((e) => e.equipe)} libelleAxe="Heures par équipe"
              series={[{ libelle: "Contrat", couleur: "#d9d0c2", valeurs: equipes.map((e) => e.hContrat) }, { libelle: "Travaillées", couleur: BLEU, valeurs: equipes.map((e) => e.hTrav) }, { libelle: "Heures sup", couleur: ROUGE, valeurs: equipes.map((e) => e.hs) }]} />
            <div style={{ display: "grid", gridTemplateColumns: bureau ? `repeat(${Math.min(4, equipes.length)}, 1fr)` : "1fr 1fr", gap: 8, marginTop: 10 }}>
              {equipes.map((e) => (
                <div key={e.equipe} style={{ borderLeft: `4px solid ${COULEURS_EQUIPE[e.equipe] ?? "#b0a894"}`, background: "#faf7f2", borderRadius: 10, padding: "8px 12px", fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700 }}>{e.equipe} <span style={{ color: MUTED, fontWeight: 500 }}>· {e.n} pers.</span></div>
                  <div style={{ color: MUTED }}>{euros(e.ms)} · {caHt ? pct((e.ms / caHt) * 100, 1) : "—"} du CA</div>
                </div>
              ))}
            </div>
          </Cadre>

          <Cadre titre="Par personne" sous="Heures du planning Combo et coût chargé estimé. Sans contrat dans l'application, le coût n'est pas calculé." sansMarge>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={TH}>Personne</th>{bureau && <th style={{ ...TH, textAlign: "right" }}>Contrat</th>}<th style={{ ...TH, textAlign: "right" }}>Travaillées</th><th style={{ ...TH, textAlign: "right" }}>H. sup</th><th style={{ ...TH, textAlign: "right" }}>Coût chargé</th></tr></thead>
                <tbody>
                  {employes.map((e) => (
                    <tr key={e.nom}>
                      <td style={TD}>
                        <div style={{ fontWeight: 600 }}>{e.nom}</div>
                        <div style={{ fontSize: 11.5, color: MUTED }}><span style={{ color: COULEURS_EQUIPE[e.equipe] ?? MUTED, fontWeight: 600 }}>{e.equipe}</span>{e.emploi ? ` · ${e.emploi}` : ""}{e.sansContrat ? <span style={{ color: AMBRE }}> · sans contrat dans l&apos;app</span> : ` · ${e.type} ${e.hContrat} h`}</div>
                      </td>
                      {bureau && <td style={{ ...TDN, color: MUTED }}>{nombre(e.hContrat * (selection.mode === "mois" ? 52 / 12 : 1))} h</td>}
                      <td style={{ ...TDN, fontWeight: 600 }}>{nombre(e.hTrav, 1)} h</td>
                      <td style={{ ...TDN, color: e.hs > 0 ? ROUGE : FAIBLE, fontWeight: e.hs > 0 ? 700 : 400 }}>{e.hs > 0 ? `+${nombre(e.hs, 1)} h` : "—"}</td>
                      <td style={{ ...TDN, fontWeight: 700, color: e.sansContrat ? FAIBLE : "#1a1a1a" }}>{e.sansContrat ? "—" : euros(e.coutCharge + e.coutHS)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 16px 14px" }}>
              <Note>Heures sup : au-delà des heures de contrat sur la période, payées au taux horaire majoré de 10 %. TNS : mensualité fixe. {totaux.sansContrat > 0 ? `${totaux.sansContrat} personne${totaux.sansContrat > 1 ? "s" : ""} sans contrat dans l'application : à compléter dans RH › Équipe.` : ""}</Note>
            </div>
          </Cadre>
        </>
      )}
    </div>
  );
}

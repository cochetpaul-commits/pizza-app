"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { tenirEveille, useTablette } from "@/lib/tablette/store";
import { BON, ATTENTION, MAUVAIS, INFO, BORD, MUTED, FAIBLE, CADRE, INTERTITRE, OSWALD, BTN, CHAMP, pastille } from "@/components/ui/charte";
import type { PateResult, Phase } from "@/lib/pateEngine";
import { formatG, lignesPesee, nomFarine, nomPhase } from "@/lib/pateAffichage";
import { alerteBiga, alertePate, conseilEau, detailBacs, eauBiga, eauPetrissage, etatBiga, formatDuree, lireEtapesFournee, nbBacs, reperesPetrissage, tiersBassinage, CIBLE_BIGA, CIBLE_PATE, PATONS_PAR_BAC, type Repere, type TbCalculee } from "@/lib/pate/fournee";

/**
 * Fournée (module pâte, phase 2, 02/11/2026) : la fabrication par lot dans le Mode production de la fiche d'empâtement.
 * Téléphone en cuisine, mains farinées : un geste par écran, gros boutons, minuteur en gros, rien à taper sauf les
 * températures. Lancer et clôturer : pizzaiolos formés et responsables ; les étapes : toute personne identifiée.
 */
type Etape = { id: string; phase: "biga" | "final"; ordre: number; libelle: string; duree_prevue_s: number | null; demarre_at: string | null; termine_at: string | null; valide_par_nom: string | null };
type Lot = {
  id: string; numero: string; type: "biga" | "direct"; statut: "biga_en_cours" | "biga_au_froid" | "petrissage" | "cloture" | "annule";
  nb_patons: number; poids_paton: number; poids_calcule: number; operateur_nom: string | null; recette_nom: string;
  recette_figee: { calcul?: PateResult };
  essai: boolean; essai_variable: string | null; essai_valeur: string | null; commentaire: string | null;
  biga_debut_at: string | null; biga_froid_at: string | null; petrissage_debut_at: string | null; cloture_at: string | null;
  t_farine_biga: number | null; t_cuisine_biga: number | null; t_eau_biga_calc: number | null; t_eau_biga_utilisee: number | null; t_biga_sortie: number | null;
  t_farine: number | null; t_cuisine: number | null; t_biga: number | null; t_eau_calc: number | null; t_eau_utilisee: number | null; tb_utilisee: number | null; tb_source: string | null;
  t_pate_sortie: number | null; voile_ok: boolean | null;
  /* Pétrissage chronométré (04/11/2026) */
  chrono_debut_at: string | null; chrono_avance: number | null; reperes_faits?: number[] | null; petrissage_fin_at: string | null; biga_confirmee: boolean | null; eau_bassinage_restante_g: number | null;
  etapes: Etape[];
};
type Acteur = { nom: string; peutLancer: boolean; source: "tablette" | "compte" };
type Conseil = { de: [number, number]; vers: [number, number]; reste_pct: number } | null;
type Etat = { lots: Lot[]; ouvert: Lot | null; acteur: Acteur; conseil_bassinage?: Conseil };

const VARIABLES_ESSAI = ["Levure", "Sel", "Hydratation", "Ratio de farines", "Huile", "Miel", "Temps à température ambiante après boulage"];
const GROS: React.CSSProperties = { border: `1px solid ${BORD}`, borderRadius: 14, background: "#fff", padding: "16px 12px", fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", touchAction: "manipulation", width: "100%" };
const PRINCIPAL: React.CSSProperties = { ...GROS, background: "#D4775A", borderColor: "#D4775A", color: "#fff", fontSize: 18, padding: "20px 12px" };
const VALIDE: React.CSSProperties = { ...GROS, background: BON, borderColor: BON, color: "#fff", fontSize: 18, padding: "20px 12px" };
const ALERTE = (niveau: "ok" | "alerte" | "forte" | "glacons" | "chaud" | "jeune" | "depassee" | null): React.CSSProperties => {
  const c = niveau === "ok" ? BON : niveau === "forte" || niveau === "depassee" ? MAUVAIS : niveau === "glacons" ? INFO : ATTENTION;
  return { padding: "8px 12px", borderRadius: 10, background: `${c}1f`, color: c, fontSize: 13, fontWeight: 600 };
};

const temp = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} °`);
const heure = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");
const dateHeure = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export function Fournee({ recipeId, recetteNom, type, nbPatonsDefaut, poidsPaton, calcul, integre = false, onLotOuvert }: {
  recipeId: string; recetteNom: string; type: "biga" | "direct" | "focaccia"; nbPatonsDefaut: number; poidsPaton: number;
  /** calcul courant de la fiche (pour l'aperçu avant lancement) */
  calcul: ((nb: number) => PateResult | null) | null;
  /** Dans la page Empâtements (05/11/2026) : pâtons et pesées sont déjà au-dessus, un seul bouton « Lancer l'empâtement » */
  integre?: boolean;
  /** Prévient la page quand un lot est ouvert (elle masque alors ses pesées) */
  onLotOuvert?: (ouvert: boolean) => void;
}) {
  const tablette = useTablette();
  const jeton = tablette.actif ? tablette.employe?.jeton ?? null : null;
  const entetes = useMemo<Record<string, string>>(() => { const h: Record<string, string> = {}; if (jeton) h["x-employe-tablette"] = jeton; return h; }, [jeton]);
  const [etat, setEtat] = useState<Etat | null>(null);
  const [tb, setTb] = useState<TbCalculee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [patons, setPatons] = useState(nbPatonsDefaut);
  const [essai, setEssai] = useState(false);
  const [essaiVariable, setEssaiVariable] = useState(VARIABLES_ESSAI[0]);
  const [essaiValeur, setEssaiValeur] = useState("");
  // Après une clôture ou une annulation, l'écran revient au démarrage : on dit ce qui vient de se passer
  const [dernier, setDernier] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetchApi(`/api/pate/lots?recette=${recipeId}&etat=en_cours`, { headers: entetes });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error ?? "Erreur"); return; }
      setEtat(j as Etat);
      setErreur(null);
    } catch { setErreur("Réseau indisponible"); }
  }, [recipeId, entetes]);
  useEffect(() => { void charger(); }, [charger]);
  const ouvertId = etat?.ouvert?.id ?? null;
  useEffect(() => { if (etat) onLotOuvert?.(!!ouvertId); }, [ouvertId, etat, onLotOuvert]);
  // Intégré : les pâtons viennent de la page
  const nbLance = integre ? nbPatonsDefaut : patons;

  const appliquer = async (lotId: string, corps: Record<string, unknown>) => {
    setOccupe(true);
    try {
      const r = await fetchApi(`/api/pate/lots/${lotId}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...entetes }, body: JSON.stringify(corps) });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error ?? "Erreur"); return false; }
      setErreur(null);
      setTb(j.tb ?? null);
      const l = j.lot as Lot;
      if (l.statut === "cloture") setDernier(`Lot ${l.numero} clôturé à ${heure(l.cloture_at)} : ${l.nb_patons} pâtons, pâte à ${temp(l.t_pate_sortie)}${l.voile_ok ? ", test du voile fait" : ""}.`);
      else if (l.statut === "annule") setDernier(`Lot ${l.numero} annulé.`);
      setEtat((e) => (e ? { ...e, ouvert: l.statut === "cloture" || l.statut === "annule" ? null : l, lots: [l, ...e.lots.filter((x) => x.id !== l.id)] } : e));
      return true;
    } catch { setErreur("Réseau indisponible"); return false; } finally { setOccupe(false); }
  };

  const lancer = async () => {
    setOccupe(true);
    try {
      const r = await fetchApi("/api/pate/lots", { method: "POST", headers: { "Content-Type": "application/json", ...entetes }, body: JSON.stringify({ recipe_id: recipeId, nb_patons: nbLance, poids_paton: poidsPaton, essai, essai_variable: essai ? essaiVariable : null, essai_valeur: essai ? essaiValeur : null }) });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error ?? "Erreur"); if (j.lot_id) void charger(); return; }
      setErreur(null);
      setTb(j.tb ?? null);
      setEtat((e) => (e ? { ...e, ouvert: j.lot, lots: [j.lot, ...e.lots] } : e));
    } catch { setErreur("Réseau indisponible"); } finally { setOccupe(false); }
  };

  if (type === "focaccia") return <div style={{ ...CADRE, padding: 16, color: MUTED, fontSize: 13 }}>Les fournées suivent les pâtes à pizza (biga ou directe). Pour la focaccia, le Mode production garde le calcul par pivot.</div>;
  if (!etat && !erreur) return <div style={{ textAlign: "center", padding: 30, color: MUTED }}>Chargement…</div>;
  if (!etat) return <div style={{ ...CADRE, padding: 16, color: MAUVAIS, fontSize: 13 }}>{erreur}</div>;

  const lot = etat.ouvert;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5, color: MUTED }}>
        <span>Devant l&apos;écran : <b style={{ color: "#1a1a1a" }}>{etat.acteur.nom}</b>{etat.acteur.source === "tablette" ? " (code tablette)" : ""}</span>
        {!etat.acteur.peutLancer && <span style={pastille(ATTENTION)}>peut suivre les étapes, pas lancer ni clôturer</span>}
      </div>
      {erreur && <div style={ALERTE("forte")}>{erreur}</div>}
      {!lot && dernier && <div style={ALERTE("ok")}>{dernier}</div>}
      {!lot && integre ? (
        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" onClick={() => void lancer()} disabled={!etat.acteur.peutLancer || occupe || nbLance < 1} style={{ ...PRINCIPAL, opacity: !etat.acteur.peutLancer || occupe ? 0.5 : 1, display: "grid", gap: 2, justifyItems: "center" }}>
            <span>Lancer l&apos;empâtement</span>
            <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.9 }}>{nbLance} pâtons · {type === "biga" ? "biga aujourd'hui, pétrissage demain" : "pétrissage"}</span>
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: MUTED, cursor: "pointer", justifySelf: "center" }}>
            <input type="checkbox" checked={essai} onChange={(e) => setEssai(e.target.checked)} /> Fournée d&apos;essai
          </label>
          {essai && (
            <div style={{ display: "grid", gap: 8 }}>
              <select value={essaiVariable} onChange={(e) => setEssaiVariable(e.target.value)} style={{ ...CHAMP, height: 44 }}>{VARIABLES_ESSAI.map((v) => <option key={v}>{v}</option>)}</select>
              <input value={essaiValeur} onChange={(e) => setEssaiValeur(e.target.value)} placeholder="ex. 0,4 % au lieu de 0,5 %" style={{ ...CHAMP, height: 44 }} />
            </div>
          )}
          {!etat.acteur.peutLancer && <div style={{ fontSize: 12.5, color: MUTED, textAlign: "center" }}>Lancer un empâtement est réservé aux pizzaiolos formés et aux responsables.</div>}
        </div>
      ) : !lot ? (
        <Demarrage type={type} recetteNom={recetteNom} patons={patons} setPatons={setPatons} poidsPaton={poidsPaton} calcul={calcul} peutLancer={etat.acteur.peutLancer} occupe={occupe} onLancer={lancer}
          essai={essai} setEssai={setEssai} essaiVariable={essaiVariable} setEssaiVariable={setEssaiVariable} essaiValeur={essaiValeur} setEssaiValeur={setEssaiValeur} />
      ) : (
        <Deroule lot={lot} tb={tb} occupe={occupe} peutLancer={etat.acteur.peutLancer} conseil={etat.conseil_bassinage ?? null} appliquer={(corps) => appliquer(lot.id, corps)} />
      )}
    </div>
  );
}

/* ── Démarrage ──────────────────────────────────────────────────────────── */
function Demarrage(p: {
  type: "biga" | "direct"; recetteNom: string; patons: number; setPatons: (n: number) => void; poidsPaton: number; calcul: ((nb: number) => PateResult | null) | null;
  peutLancer: boolean; occupe: boolean; onLancer: () => void;
  essai: boolean; setEssai: (v: boolean) => void; essaiVariable: string; setEssaiVariable: (v: string) => void; essaiValeur: string; setEssaiValeur: (v: string) => void;
}) {
  const r = p.calcul ? p.calcul(p.patons) : null;
  const couleur = p.type === "biga" ? "#b8601f" : "#4a6741";
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...CADRE, padding: 16, display: "grid", gap: 10, justifyItems: "center" }}>
        <span style={INTERTITRE}>Pâtons de la fournée</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={() => p.setPatons(Math.max(12, p.patons - 12))} style={{ ...GROS, width: 64, fontFamily: OSWALD, fontSize: 18 }}>−12</button>
          <input type="number" inputMode="numeric" value={p.patons} onChange={(e) => p.setPatons(Math.max(1, Math.floor(Number(e.target.value) || 0)))} onFocus={(e) => e.target.select()} aria-label="Pâtons"
            style={{ width: 110, textAlign: "center", fontFamily: OSWALD, fontWeight: 700, fontSize: 48, border: "none", borderBottom: `1px solid ${BORD}`, background: "transparent", outline: "none", fontVariantNumeric: "tabular-nums" }} />
          <button type="button" onClick={() => p.setPatons(p.patons + 12)} style={{ ...GROS, width: 64, fontFamily: OSWALD, fontSize: 18 }}>+12</button>
        </div>
        <div style={{ fontSize: 12.5, color: MUTED }}>{Math.ceil(p.patons / 12)} bacs de 12 · pâton {p.poidsPaton} g{r && r.summary.poidsCalcule_g !== p.poidsPaton ? `, calculé à ${r.summary.poidsCalcule_g} g` : ""}{r ? ` · ${formatG(r.summary.total_ingredients_g)} de pâte` : ""}</div>
        {r?.warnings.map((w) => <div key={w} style={ALERTE("alerte")}>{w}</div>)}
      </div>
      {r && (
        <div style={{ display: "grid", gap: 8 }}>
          {r.phases.map((ph) => <Pesees key={ph.name} phase={ph} nbPhases={r.phases.length} couleur={couleur} />)}
        </div>
      )}
      <div style={{ ...CADRE, padding: 14, display: "grid", gap: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={p.essai} onChange={(e) => p.setEssai(e.target.checked)} style={{ width: 22, height: 22 }} />
          Fournée d&apos;essai (une seule variable change)
        </label>
        {p.essai && (
          <div style={{ display: "grid", gap: 8 }}>
            <select value={p.essaiVariable} onChange={(e) => p.setEssaiVariable(e.target.value)} style={{ ...CHAMP, height: 44 }}>{VARIABLES_ESSAI.map((v) => <option key={v}>{v}</option>)}</select>
            <input value={p.essaiValeur} onChange={(e) => p.setEssaiValeur(e.target.value)} placeholder="ex. 0,4 % au lieu de 0,5 %" style={{ ...CHAMP, height: 44 }} />
          </div>
        )}
      </div>
      <button type="button" onClick={p.onLancer} disabled={!p.peutLancer || p.occupe} style={{ ...PRINCIPAL, opacity: !p.peutLancer || p.occupe ? 0.5 : 1 }}>
        {p.type === "biga" ? "Lancer la biga (veille)" : "Lancer le pétrissage"}
      </button>
      {!p.peutLancer && <div style={{ fontSize: 12.5, color: MUTED, textAlign: "center" }}>Lancer une fournée est réservé aux pizzaiolos formés et aux responsables (fiche employé, « Formé à la pâte »).</div>}
    </div>
  );
}

function Pesees({ phase, nbPhases, couleur }: { phase: Phase; nbPhases: number; couleur: string }) {
  const lignes = lignesPesee(phase);
  return (
    <div style={{ ...CADRE, boxShadow: `inset 6px 0 0 ${couleur}`, padding: "10px 12px 10px 18px" }}>
      <div style={{ ...INTERTITRE, marginBottom: 4 }}>{nomPhase(phase, nbPhases)}</div>
      {lignes.map((l) => (
        <div key={l.libelle} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, padding: "4px 0", borderTop: `1px solid #f3efe7` }}>
          <span>{l.libelle}{l.note && <span style={{ color: MUTED, fontSize: 12 }}> · {l.note}</span>}</span>
          <b style={{ fontFamily: OSWALD, fontSize: 20, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatG(l.grammes, l.precis)}</b>
        </div>
      ))}
    </div>
  );
}

/* ── Déroulé ────────────────────────────────────────────────────────────── */
function Deroule({ lot, tb, occupe, peutLancer, conseil, appliquer }: { lot: Lot; tb: TbCalculee | null; occupe: boolean; peutLancer: boolean; conseil: Conseil; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
  const phaseCourante: "biga" | "final" = lot.statut === "biga_en_cours" ? "biga" : "final";
  const etapes = lot.etapes.filter((e) => e.phase === phaseCourante);
  const courante = etapes.find((e) => !e.termine_at) ?? null;
  const faites = etapes.filter((e) => e.termine_at).length;
  const calcul = lot.recette_figee?.calcul ?? null;
  const couleur = lot.type === "biga" ? "#b8601f" : "#4a6741";
  // Températures à saisir avant de commencer la phase
  const tempsBigaOk = lot.t_eau_biga_calc != null;
  const tempsFinalOk = lot.t_eau_calc != null;
  const besoinTemps = phaseCourante === "biga" ? !tempsBigaOk : !tempsFinalOk;
  // Ouverture du pétrissage (04/11/2026) : biga hors de sa fenêtre, confirmation obligatoire avant de continuer
  const ageBiga = lot.type === "biga" ? etatBiga(lot.biga_froid_at) : null;
  const bigaAConfirmer = phaseCourante === "final" && lot.type === "biga" && !tempsFinalOk && !lot.biga_confirmee && (ageBiga?.niveau === "jeune" || ageBiga?.niveau === "depassee");
  const [annulation, setAnnulation] = useState(false);
  // Fournée en cours : la tablette ne se verrouille pas par inactivité (06/11/2026, retour de Paul)
  useEffect(() => { tenirEveille("fournee", true); return () => tenirEveille("fournee", false); }, []);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...CADRE, padding: "12px 16px", boxShadow: `inset 6px 0 0 ${couleur}`, display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "baseline" }}>
        <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 30, lineHeight: 1 }}>{lot.nb_patons} <span style={{ fontSize: 16 }}>pâtons</span></span>
        <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 16, color: MUTED }}>{lot.numero}</span>
        <span style={pastille(couleur)}>{lot.type === "biga" ? "biga" : "directe"}</span>
        <span style={{ fontSize: 13, color: MUTED }}>pâton {lot.poids_paton} g · {lot.operateur_nom ?? ""}</span>
        {lot.essai && <span style={pastille(INFO)}>essai : {lot.essai_variable}{lot.essai_valeur ? ` (${lot.essai_valeur})` : ""}</span>}
        <span style={{ fontSize: 12.5, color: MUTED }}>{lot.statut === "biga_en_cours" ? `Biga lancée à ${heure(lot.biga_debut_at)}` : lot.statut === "biga_au_froid" ? `Biga au froid depuis ${dateHeure(lot.biga_froid_at)}` : `Pétrissage ${dateHeure(lot.petrissage_debut_at)}`}</span>
      </div>

      {lot.statut === "biga_au_froid" && <EtatBiga froidAt={lot.biga_froid_at} />}

      {bigaAConfirmer ? (
        <ControleBiga lot={lot} occupe={occupe} appliquer={appliquer} />
      ) : besoinTemps ? (
        <>
          {phaseCourante === "final" && calcul && <MiseEnPlace lot={lot} calcul={calcul} conseil={conseil} />}
          <Temperatures lot={lot} phase={phaseCourante} tb={tb} occupe={occupe} appliquer={appliquer} />
        </>
      ) : phaseCourante === "final" && !lot.chrono_debut_at ? (
        <>
          {/* Le chrono ne part que sur ce geste (05/11/2026) */}
          <div style={{ ...CADRE, padding: 16, textAlign: "center" }}>
            <div style={INTERTITRE}>Eau de départ à</div>
            <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 52, lineHeight: 1.1, color: INFO }}>{temp(lot.t_eau_calc)}</div>
            <div style={{ fontSize: 13, color: MUTED }}>Eau et biga dans la cuve : quand tu lances la vitesse 1, appuie.</div>
          </div>
          <button type="button" disabled={occupe} onClick={() => void appliquer({ action: "demarrer_chrono" })} style={PRINCIPAL}>Je lance la vitesse 1</button>
          {calcul && <MiseEnPlace lot={lot} calcul={calcul} conseil={conseil} />}
        </>
      ) : phaseCourante === "final" && !lot.petrissage_fin_at ? (
        <ChronoPetrissage lot={lot} calcul={calcul} occupe={occupe} appliquer={appliquer} />
      ) : phaseCourante === "final" ? (
        <Cloture lot={lot} occupe={occupe} peutLancer={peutLancer} appliquer={appliquer} />
      ) : phaseCourante === "biga" ? (
        <EtapesBiga lot={lot} calcul={calcul} occupe={occupe} appliquer={appliquer} />
      ) : courante ? (
        <EtapeEnCours key={courante.id} lot={lot} etape={courante} index={etapes.indexOf(courante)} total={etapes.length} calcul={calcul} occupe={occupe} appliquer={appliquer} />
      ) : (
        <Cloture lot={lot} occupe={occupe} peutLancer={peutLancer} appliquer={appliquer} />
      )}

      {/* Retour en arrière et correction (02/11/2026) : un bouton appuyé trop tôt se rattrape, l'heure et la température se corrigent */}
      {peutRevenir(lot) && (
        <button type="button" disabled={occupe} onClick={() => void appliquer({ action: "revenir" })} style={{ ...GROS, fontSize: 14, padding: "12px 10px", color: MUTED }}>
          ← Revenir à l&apos;étape précédente
        </button>
      )}
      {lot.type === "biga" && lot.biga_froid_at && <CorrigerBiga lot={lot} occupe={occupe} appliquer={appliquer} />}

      <details style={{ ...CADRE, padding: "10px 14px" }}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Étapes de la phase ({faites}/{etapes.length}) et relevés</summary>
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {etapes.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "baseline" }}>
              <span style={{ ...pastille(e.termine_at ? BON : e === courante ? ATTENTION : "#9a948a"), minWidth: 26, textAlign: "center" }}>{e.ordre}</span>
              <span style={{ flex: 1, color: e.termine_at ? MUTED : "#1a1a1a" }}>{e.libelle}</span>
              <span style={{ color: FAIBLE, whiteSpace: "nowrap" }}>{e.termine_at ? `${heure(e.termine_at)} · ${e.valide_par_nom ?? ""}` : e.duree_prevue_s ? formatDuree(e.duree_prevue_s) : ""}</span>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>
            {lot.type === "biga" && <>Biga : farine {temp(lot.t_farine_biga)}, cuisine {temp(lot.t_cuisine_biga)}, eau conseillée {temp(lot.t_eau_biga_calc)}{lot.t_biga_sortie != null ? `, biga sortie ${temp(lot.t_biga_sortie)}` : ""}. </>}
            {lot.t_eau_calc != null && <>Pétrissage : farine {temp(lot.t_farine)}, cuisine {temp(lot.t_cuisine)}{lot.type === "biga" ? `, biga ${temp(lot.t_biga)}` : ""}, TB {lot.tb_utilisee} ({lot.tb_source === "lots" ? "moyenne des lots" : "manuelle"}), eau conseillée {temp(lot.t_eau_calc)}.</>}
          </div>
        </div>
      </details>

      {peutLancer && (
        <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
          {!annulation ? (
            <button type="button" onClick={() => setAnnulation(true)} style={{ ...BTN, color: MAUVAIS, fontSize: 12.5 }}>Annuler ce lot</button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setAnnulation(false)} style={BTN}>Garder</button>
              <button type="button" disabled={occupe} onClick={() => void appliquer({ action: "annuler" })} style={{ ...BTN, background: MAUVAIS, borderColor: MAUVAIS, color: "#fff" }}>Confirmer l&apos;annulation</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EtatBiga({ froidAt }: { froidAt: string | null }) {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setMaintenant(Date.now()), 60000); return () => clearInterval(t); }, []);
  const e = etatBiga(froidAt, maintenant);
  return e.message ? <div style={ALERTE(e.niveau)}>{e.message}</div> : null;
}

/* ── Températures ───────────────────────────────────────────────────────── */
function Temperatures({ lot, phase, tb, occupe, appliquer }: { lot: Lot; phase: "biga" | "final"; tb: TbCalculee | null; occupe: boolean; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
  // Brouillon gardé sur l'appareil (02/11/2026) : quitter l'appli et revenir ne vide plus les températures
  const [tFarine, setTFarine] = useBrouillon(`${lot.id}:${phase}:farine`, "");
  const [tCuisine, setTCuisine] = useBrouillon(`${lot.id}:${phase}:cuisine`, "");
  const [tBiga, setTBiga] = useBrouillon(`${lot.id}:${phase}:biga`, "");
  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const f = n(tFarine), c = n(tCuisine), b = n(tBiga);
  const complet = f != null && c != null && (phase === "biga" || lot.type === "direct" || b != null);
  const eau = !complet ? null : phase === "biga" ? eauBiga(f as number, c as number) : eauPetrissage(tb?.tb ?? Number(lot.tb_utilisee ?? 56), f as number, c as number, lot.type === "biga" ? b : null);
  const conseil = eau == null ? null : conseilEau(eau);
  const champ = (libelle: string, v: string, set: (s: string) => void) => (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, ...CADRE, padding: "10px 14px", fontSize: 16 }}>
      <span>{libelle}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="number" inputMode="decimal" step={0.5} value={v} onChange={(e) => set(e.target.value)} onFocus={(e) => e.target.select()} aria-label={libelle}
          style={{ width: 84, textAlign: "right", fontFamily: OSWALD, fontWeight: 700, fontSize: 26, border: "none", borderBottom: `1px solid ${BORD}`, outline: "none", background: "transparent", fontVariantNumeric: "tabular-nums" }} />
        <span style={{ color: MUTED }}>°C</span>
      </span>
    </label>
  );
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <span style={INTERTITRE}>{phase === "biga" ? "Biga · températures" : "Pétrissage · températures"}</span>
      {champ("Farine", tFarine, setTFarine)}
      {champ("Cuisine", tCuisine, setTCuisine)}
      {phase === "final" && lot.type === "biga" && champ("Biga sortie du froid", tBiga, setTBiga)}
      <div style={{ ...CADRE, padding: 16, textAlign: "center" }}>
        <div style={INTERTITRE}>{phase === "biga" ? "Eau de biga à" : "Eau de départ à"}</div>
        <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 52, lineHeight: 1.1, color: eau == null ? FAIBLE : phase === "biga" ? "#b8601f" : INFO }}>{eau == null ? "—" : `${eau.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} °`}</div>
        <div style={{ fontSize: 12.5, color: MUTED }}>
          {phase === "biga" ? "55 − (farine + cuisine)" : `TB ${tb?.tb ?? lot.tb_utilisee ?? 56}${tb ? (tb.source === "lots" ? ` (moyenne de ${tb.nbLots} lots)` : ` (manuelle${tb.nbLots ? `, ${tb.nbLots} lot${tb.nbLots > 1 ? "s" : ""} valide${tb.nbLots > 1 ? "s" : ""} sur 3` : ""})`) : ""} − (farine + cuisine${lot.type === "biga" ? " + biga" : ""})`}
          {" · "}cible {phase === "biga" ? `biga ${CIBLE_BIGA.min} à ${CIBLE_BIGA.max} °C` : `pâte ${CIBLE_PATE.min} à ${CIBLE_PATE.max} °C`}
        </div>
        {conseil?.message && <div style={{ ...ALERTE(conseil.niveau), marginTop: 8 }}>{conseil.message}</div>}
      </div>
      <button type="button" disabled={!complet || occupe} onClick={() => void appliquer(phase === "biga" ? { action: "temps_biga", t_farine: f, t_cuisine: c } : { action: "temps_final", t_farine: f, t_cuisine: c, t_biga: b })}
        style={{ ...PRINCIPAL, opacity: !complet || occupe ? 0.5 : 1 }}>
        {phase === "biga" ? "Eau prête, commencer la biga" : "Eau prête"}
      </button>
    </div>
  );
}

/* ── Étape en cours avec minuteur ───────────────────────────────────────── */
function EtapeEnCours({ lot, etape, index, total, calcul, occupe, appliquer }: { lot: Lot; etape: Etape; index: number; total: number; calcul: PateResult | null; occupe: boolean; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [ajout, setAjout] = useState(0);
  const sonne = useRef(false);
  useEffect(() => { const t = setInterval(() => setMaintenant(Date.now()), 500); return () => clearInterval(t); }, []);
  const prevu = (etape.duree_prevue_s ?? 0) + ajout;
  const ecoule = etape.demarre_at ? Math.floor((maintenant - new Date(etape.demarre_at).getTime()) / 1000) : 0;
  const reste = prevu - ecoule;
  const fini = etape.demarre_at != null && prevu > 0 && reste <= 0;
  useEffect(() => {
    if (fini && !sonne.current) {
      sonne.current = true;
      try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); } catch { /* pas de vibreur */ }
    }
  }, [fini]);
  // Les pesées utiles à cette étape : la phase en cours
  const phase = calcul?.phases.find((p) => (etape.phase === "biga" ? p.kind === "biga" : p.kind !== "biga")) ?? null;
  const pesees = phase ? lignesPesee(phase) : [];
  // Les pesées que l'étape mentionne : les farines sur « farine », chaque eau sur son nom, sel, miel, levure, huile
  const texte = etape.libelle.toLowerCase();
  const rappel = pesees.filter((l) => {
    const lib = l.libelle.toLowerCase();
    if (lib.startsWith("eau de bassinage")) return texte.includes("bassinage");
    if (lib.startsWith("eau de départ")) return texte.includes("eau de départ");
    if (lib === "eau") return texte.includes("eau");
    if (lib === "sel" || lib === "miel" || lib === "huile") return texte.includes(lib);
    if (lib.startsWith("levure")) return texte.includes("levure");
    return texte.includes("farine");
  });
  const couleur = lot.type === "biga" ? "#b8601f" : "#4a6741";
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ ...CADRE, padding: 16, boxShadow: `inset 6px 0 0 ${couleur}`, background: `${couleur}10` }}>
        <div style={{ ...INTERTITRE, color: couleur }}>Étape {index + 1} sur {total} · maintenant</div>
        <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 22, lineHeight: 1.2, textWrap: "balance", marginTop: 2 }}>{etape.libelle}</div>
        {/* Les quantités de l'étape, en grand (05/11/2026) */}
        {rappel.length > 0 && (
          <div style={{ display: "grid", gap: 4, marginTop: 10 }}>
            {rappel.map((l) => (
              <div key={l.libelle} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{l.libelle}</span>
                <b style={{ fontFamily: OSWALD, fontSize: 38, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{formatG(l.grammes, l.precis)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
      {etape.duree_prevue_s ? (
        <div style={{ ...CADRE, padding: 16, textAlign: "center" }}>
          <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 64, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: fini ? MAUVAIS : etape.demarre_at ? "#1a1a1a" : FAIBLE }}>
            {etape.demarre_at ? (reste >= 0 ? formatDuree(reste) : `+${formatDuree(-reste)}`) : formatDuree(prevu)}
          </div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>{etape.demarre_at ? (fini ? "Temps écoulé" : `sur ${formatDuree(prevu)}`) : "minuteur prêt"}</div>
          <div style={{ height: 8, borderRadius: 4, background: "#f0ebe3", overflow: "hidden", marginTop: 8 }}><div style={{ width: `${Math.min(100, prevu ? (ecoule / prevu) * 100 : 0)}%`, height: "100%", background: fini ? MAUVAIS : couleur, transition: "width .5s linear" }} /></div>
          {!etape.demarre_at ? (
            <button type="button" disabled={occupe} onClick={() => void appliquer({ action: "etape", etape_id: etape.id, demarre: true })} style={{ ...PRINCIPAL, marginTop: 12 }}>Démarrer le minuteur</button>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
              <button type="button" onClick={() => setAjout((a) => a + 30)} style={GROS}>+ 30 s</button>
              <button type="button" disabled={occupe} onClick={() => void appliquer({ action: "etape", etape_id: etape.id, reprendre: true })} style={GROS}>Remettre à zéro</button>
            </div>
          )}
        </div>
      ) : null}
      <button type="button" disabled={occupe} onClick={() => void appliquer({ action: "etape", etape_id: etape.id, termine: true, ...(etape.demarre_at ? {} : { demarre: true }) })} style={VALIDE}>
        Étape faite
      </button>
    </div>
  );
}

/* ── Biga : les étapes en liste (05/11/2026) ────────────────────────────── */
function EtapesBiga({ lot, calcul, occupe, appliquer }: { lot: Lot; calcul: PateResult | null; occupe: boolean; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
  const etapes = lot.etapes.filter((e) => e.phase === "biga").sort((a, b) => a.ordre - b.ordre);
  const courante = etapes.find((e) => !e.termine_at) ?? null;
  const ligne = (e: Etape, etat: "faite" | "avenir") => (
    <div key={e.id} style={{ ...CADRE, padding: "10px 14px 10px 18px", display: "grid", gridTemplateColumns: "34px 1fr auto", gap: 12, alignItems: "center", boxShadow: `inset 6px 0 0 ${etat === "faite" ? BON : BORD}` }}>
      <span aria-hidden style={{ width: 30, height: 30, borderRadius: 15, border: `2px solid ${etat === "faite" ? BON : BORD}`, background: etat === "faite" ? BON : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700 }}>{etat === "faite" ? "✓" : ""}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: etat === "faite" ? MUTED : "#1a1a1a" }}>{e.libelle}</span>
      <span style={{ fontSize: 12.5, color: FAIBLE, whiteSpace: "nowrap" }}>{etat === "faite" ? heure(e.termine_at) : e.duree_prevue_s ? formatDuree(e.duree_prevue_s) : ""}</span>
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span style={INTERTITRE}>Biga · étape {courante ? etapes.indexOf(courante) + 1 : etapes.length} sur {etapes.length}</span>
      {etapes.map((e, k) => {
        if (e.termine_at) return ligne(e, "faite");
        if (e !== courante) return ligne(e, "avenir");
        // La dernière étape (bac au froid) se valide par la mise au froid
        if (k === etapes.length - 1 || /froid/i.test(e.libelle)) return <AuFroid key={e.id} lot={lot} etape={e} index={k} total={etapes.length} occupe={occupe} appliquer={appliquer} />;
        return <EtapeEnCours key={e.id} lot={lot} etape={e} index={k} total={etapes.length} calcul={calcul} occupe={occupe} appliquer={appliquer} />;
      })}
      {!courante && <AuFroid lot={lot} etape={null} index={etapes.length - 1} total={etapes.length} occupe={occupe} appliquer={appliquer} />}
    </div>
  );
}

/* ── Fin de la biga : au froid, en un geste ─────────────────────────────── */
function AuFroid({ lot, etape, index, total, occupe, appliquer }: { lot: Lot; etape: Etape | null; index: number; total: number; occupe: boolean; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
  const [tSortie, setTSortie] = useBrouillon(`${lot.id}:biga:sortie`, "");
  const t = tSortie.trim() === "" ? null : Number(tSortie.replace(",", "."));
  const a = t != null && Number.isFinite(t) ? alerteBiga(t) : null;
  const couleur = "#b8601f";
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ ...CADRE, padding: 16, boxShadow: `inset 6px 0 0 ${couleur}`, background: `${couleur}10` }}>
        <div style={{ ...INTERTITRE, color: couleur }}>Étape {index + 1} sur {total} · maintenant</div>
        <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 22, lineHeight: 1.2, marginTop: 2 }}>{etape?.libelle ?? "Bac légèrement huilé, couvert, au froid à 4 °C"}</div>
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 13, color: MUTED, cursor: "pointer" }}>Température de la biga (facultatif)</summary>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, marginTop: 8 }}>
            <span>Biga en fin de mélange <span style={{ color: MUTED, fontSize: 12.5 }}>(cible {CIBLE_BIGA.min} à {CIBLE_BIGA.max} °C)</span></span>
            <span><input type="number" inputMode="decimal" step={0.5} value={tSortie} onChange={(e) => setTSortie(e.target.value)} aria-label="Température de la biga" style={{ width: 80, textAlign: "right", fontFamily: OSWALD, fontWeight: 700, fontSize: 24, border: "none", borderBottom: `1px solid ${BORD}`, outline: "none", background: "transparent" }} /> <span style={{ color: MUTED }}>°C</span></span>
          </label>
          {a?.message && <div style={{ ...ALERTE(a.niveau), marginTop: 8 }}>{a.message}</div>}
        </details>
      </div>
      <button type="button" disabled={occupe} onClick={() => void appliquer({ action: "biga_froid", t_biga_sortie: t })} style={VALIDE}>
        Biga au froid, heure enregistrée
      </button>
      <div style={{ fontSize: 12.5, color: MUTED, textAlign: "center" }}>Le pétrissage se fait demain : la fournée reste ouverte et compte l&apos;âge de la biga.</div>
    </div>
  );
}

/* ── Contrôles et clôture ───────────────────────────────────────────────── */
function Cloture({ lot, occupe, peutLancer, appliquer }: { lot: Lot; occupe: boolean; peutLancer: boolean; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
  const [voileTxt, setVoileTxt] = useBrouillon(`${lot.id}:final:voile`, "");
  const voile = voileTxt === "1", setVoile = (v: boolean) => setVoileTxt(v ? "1" : "");
  const [tPate, setTPate] = useBrouillon(`${lot.id}:final:pate`, "");
  const [commentaire, setCommentaire] = useBrouillon(`${lot.id}:final:commentaire`, lot.commentaire ?? "");
  const [reste, setReste] = useBrouillon(`${lot.id}:final:reste`, "");
  const t = tPate.trim() === "" ? null : Number(tPate.replace(",", "."));
  const a = t != null && Number.isFinite(t) ? alertePate(t) : null;
  const pret = voile && t != null && Number.isFinite(t);
  const bassinage = lot.recette_figee?.calcul?.phases.find((p) => p.kind !== "biga")?.water_bassinage_g ?? 0;
  const resteG = reste.trim() === "" ? null : Math.max(0, Number(reste.replace(",", ".")));
  const duree = lot.chrono_debut_at && lot.petrissage_fin_at ? Math.round((new Date(lot.petrissage_fin_at).getTime() - new Date(lot.chrono_debut_at).getTime()) / 1000) : null;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <span style={INTERTITRE}>Pétrissage · contrôles avant clôture{duree != null ? ` · ${formatDuree(duree)} de pétrissage` : ""}</span>
      <label style={{ ...CADRE, padding: 14, display: "flex", alignItems: "center", gap: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", boxShadow: voile ? `inset 6px 0 0 ${BON}` : undefined }}>
        <input type="checkbox" checked={voile} onChange={(e) => setVoile(e.target.checked)} style={{ width: 26, height: 26 }} />
        Test du voile fait
      </label>
      <label style={{ ...CADRE, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16 }}>
        <span>Pâte en sortie de pétrin <span style={{ color: MUTED, fontSize: 12.5 }}>(obligatoire)</span></span>
        <span><input type="number" inputMode="decimal" step={0.5} value={tPate} onChange={(e) => setTPate(e.target.value)} aria-label="Température de la pâte" style={{ width: 84, textAlign: "right", fontFamily: OSWALD, fontWeight: 700, fontSize: 26, border: "none", borderBottom: `1px solid ${BORD}`, outline: "none" }} /> <span style={{ color: MUTED }}>°C</span></span>
      </label>
      {a && <div style={ALERTE(a.niveau)}>{a.message ?? `Pâte à ${t} °C, dans la cible ${CIBLE_PATE.min} à ${CIBLE_PATE.max} °C.`}</div>}
      {bassinage > 0 && (
        <label style={{ ...CADRE, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15 }}>
          <span>Eau de bassinage restante <span style={{ color: MUTED, fontSize: 12.5 }}>(facultatif, sur {Math.round(bassinage).toLocaleString("fr-FR")} g)</span></span>
          <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}><input type="number" inputMode="numeric" step={10} value={reste} onChange={(e) => setReste(e.target.value)} aria-label="Eau de bassinage restante" style={{ width: 90, textAlign: "right", fontFamily: OSWALD, fontWeight: 700, fontSize: 24, border: "none", borderBottom: `1px solid ${BORD}`, outline: "none" }} /> <span style={{ color: MUTED }}>g</span></span>
        </label>
      )}
      {resteG != null && bassinage > 0 && resteG / bassinage > 0.05 && <div style={ALERTE("alerte")}>{Math.round(resteG)} g non versés, soit {Math.round((resteG / bassinage) * 100)} % du bassinage. Si ça se répète au prochain lot, l&apos;appli proposera de déplacer une part du bassinage vers l&apos;eau de départ, hydratation inchangée.</div>}
      <div style={{ ...CADRE, padding: 14, boxShadow: `inset 6px 0 0 ${lot.type === "biga" ? "#b8601f" : "#4a6741"}` }}>
        <div style={INTERTITRE}>Division · bacs à remplir</div>
        <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 56, lineHeight: 1 }}>{nbBacs(lot.nb_patons)} <span style={{ fontSize: 26 }}>bacs</span></div>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>{lot.nb_patons} pâtons de {lot.poids_paton} g (tolérance 5 g), {PATONS_PAR_BAC} par bac : {detailBacs(lot.nb_patons)}.</div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>Grosses boules, rabats, filet d&apos;huile d&apos;olive, détaillage, boulage.</div>
      </div>
      <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Commentaire (facultatif)" rows={2} style={{ ...CHAMP, height: "auto", resize: "vertical" }} />
      <button type="button" disabled={!pret || occupe || !peutLancer} onClick={() => void appliquer({ action: "cloture", voile_ok: voile, t_pate_sortie: t, commentaire, eau_bassinage_restante_g: resteG })} style={{ ...VALIDE, opacity: !pret || occupe || !peutLancer ? 0.5 : 1 }}>
        Boulé, lot clôturé
      </button>
      {!peutLancer && <div style={{ fontSize: 12.5, color: MUTED, textAlign: "center" }}>Clôturer un lot est réservé aux pizzaiolos formés et aux responsables.</div>}
    </div>
  );
}

/** Champ gardé sur l'appareil tant que l'étape n'est pas validée : quitter l'appli et revenir ne le vide pas */
function useBrouillon(cle: string, initial: string): [string, (v: string) => void] {
  const k = `pate:brouillon:${cle}`;
  const [v, setV] = useState<string>(() => {
    try { const x = localStorage.getItem(k); if (x != null) return x; } catch { /* stockage indisponible */ }
    return initial;
  });
  const fixer = (x: string) => { setV(x); try { if (x === "") localStorage.removeItem(k); else localStorage.setItem(k, x); } catch { /* stockage indisponible */ } };
  return [v, fixer];
}

/** Il y a quelque chose à défaire : une étape validée, une phase passée, des températures enregistrées */
function peutRevenir(lot: Lot): boolean {
  if (lot.statut === "cloture" || lot.statut === "annule") return false;
  return lot.etapes.some((e) => e.termine_at) || lot.t_eau_biga_calc != null || lot.t_eau_calc != null;
}

/** Corriger la biga après coup : heure de mise au froid, température de sortie, eau utilisée */
function CorrigerBiga({ lot, occupe, appliquer }: { lot: Lot; occupe: boolean; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
  const local = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const [heure, setHeure] = useState(local(lot.biga_froid_at));
  const [tSortie, setTSortie] = useState(lot.t_biga_sortie != null ? String(lot.t_biga_sortie) : "");
  const [tEau, setTEau] = useState(lot.t_eau_biga_utilisee != null ? String(lot.t_eau_biga_utilisee) : "");
  const [fait, setFait] = useState(false);
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const champ: React.CSSProperties = { ...CHAMP, height: 40, fontSize: 15 };
  return (
    <details style={{ ...CADRE, padding: "10px 14px" }}>
      <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Corriger la biga (heure au froid {heure ? heure.slice(11) : "—"}, sortie {lot.t_biga_sortie != null ? `${lot.t_biga_sortie} °` : "non saisie"})</summary>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>Mise au froid<input type="datetime-local" value={heure} onChange={(e) => setHeure(e.target.value)} style={champ} /></label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>Biga en sortie de pétrin (°C)<input inputMode="decimal" value={tSortie} onChange={(e) => setTSortie(e.target.value)} style={champ} /></label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>Eau réellement utilisée (°C)<input inputMode="decimal" value={tEau} onChange={(e) => setTEau(e.target.value)} style={champ} /></label>
        <button type="button" disabled={occupe || !heure} onClick={async () => { const ok = await appliquer({ action: "corriger", biga_froid_at: new Date(heure).toISOString(), t_biga_sortie: num(tSortie), t_eau_biga_utilisee: num(tEau) }); setFait(ok); }} style={{ ...BTN, justifySelf: "start" }}>
          Enregistrer la correction
        </button>
        {fait && <span style={{ fontSize: 12.5, color: BON }}>Correction enregistrée.</span>}
      </div>
    </details>
  );
}

/* ── Pétrissage chronométré (04/11/2026, retour terrain) ─────────────────────────────────────────────── */

/** Ouverture du pétrissage : biga hors de sa fenêtre de 20 à 30 h, confirmation obligatoire */
function ControleBiga({ lot, occupe, appliquer }: { lot: Lot; occupe: boolean; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
  const [coche, setCoche] = useState(false);
  const e = etatBiga(lot.biga_froid_at);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ ...CADRE, padding: 16, textAlign: "center" }}>
        <div style={INTERTITRE}>Âge de la biga</div>
        <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 52, lineHeight: 1.1, color: MAUVAIS }}>{e.heures != null ? formatHeuresCourt(e.heures) : "—"}</div>
        <div style={{ fontSize: 12.5, color: MUTED }}>au froid depuis {dateHeure(lot.biga_froid_at)}</div>
      </div>
      <div style={ALERTE(e.niveau === "jeune" ? "alerte" : "depassee")}>{e.niveau === "jeune" ? "Biga trop jeune : moins de 20 h au froid, elle risque de manquer de force." : "Biga au delà de la fenêtre de 30 h : elle peut être trop acide ou trop faible."}</div>
      <label style={{ ...CADRE, padding: 14, display: "flex", alignItems: "center", gap: 12, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
        <input type="checkbox" checked={coche} onChange={(ev) => setCoche(ev.target.checked)} style={{ width: 26, height: 26 }} />
        Je l&apos;ai vérifiée, je continue avec cette biga
      </label>
      <button type="button" disabled={!coche || occupe} onClick={() => void appliquer({ action: "confirmer_biga" })} style={{ ...PRINCIPAL, opacity: !coche || occupe ? 0.5 : 1 }}>Continuer</button>
      <div style={{ fontSize: 12.5, color: MUTED, textAlign: "center" }}>La confirmation est notée sur le lot. Pour ne pas pétrir, annule le lot en bas de page.</div>
    </div>
  );
}
const formatHeuresCourt = (h: number) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${hh} h ${String(mm).padStart(2, "0")}`; };

/** Pesées de la pâte finale, bassinage en trois pichets, bacs à préparer */
function MiseEnPlace({ lot, calcul, conseil }: { lot: Lot; calcul: PateResult; conseil: Conseil }) {
  const fin = calcul.phases.find((p) => p.kind !== "biga");
  if (!fin) return null;
  const bassinage = fin.water_bassinage_g ?? 0, eauDepart = fin.water_start_g ?? fin.water_g;
  const [b1, b2, b3] = tiersBassinage(bassinage);
  const ligne = (libelle: React.ReactNode, g: string, note?: string) => (
    <div key={String(libelle)} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, padding: "7px 0", borderTop: "1px solid #f3efe7" }}>
      <span style={{ fontSize: 15 }}>{libelle}{note && <span style={{ display: "block", fontSize: 12, color: MUTED }}>{note}</span>}</span>
      <b style={{ fontFamily: OSWALD, fontSize: 24, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{g}</b>
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ ...CADRE, padding: "10px 14px" }}>
        <div style={INTERTITRE}>Mise en place · pâte finale</div>
        {fin.flours.map((f) => ligne(nomFarine(f.name), formatG(f.grams)))}
        {/* L'eau regroupée (12/11/2026, demande de Paul) : départ, bassinage, puis le total en gros pour tout couler d'un coup et répartir ensuite dans les pichets */}
        {ligne("Eau de départ", formatG(eauDepart), fin.honey_g > 0 ? "miel dissous dedans" : undefined)}
        {bassinage > 0 && ligne("Eau de bassinage, 3 pichets", formatG(bassinage), `${formatG(b1)} · ${formatG(b2)} · ${formatG(b3)}`)}
        {bassinage > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, padding: "10px 12px", margin: "4px -6px 6px", borderRadius: 10, background: `${INFO}14`, boxShadow: `inset 6px 0 0 ${INFO}` }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Eau totale à couler<span style={{ display: "block", fontSize: 12, fontWeight: 500, color: MUTED }}>départ + bassinage</span></span>
            <b style={{ fontFamily: OSWALD, fontSize: 40, lineHeight: 1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: INFO }}>{formatG(eauDepart + bassinage)}</b>
          </div>
        )}
        {fin.honey_g > 0 && ligne("Miel", formatG(fin.honey_g))}
        {ligne("Sel", formatG(fin.salt_g))}
        {fin.yeast_g > 0 && ligne("Levure fraîche", formatG(fin.yeast_g, true))}
      </div>
      <div style={{ ...CADRE, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={INTERTITRE}>Bacs à préparer</div><div style={{ fontSize: 12.5, color: MUTED }}>{lot.nb_patons} pâtons, {PATONS_PAR_BAC} par bac</div></div>
        <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 48, lineHeight: 1 }}>{nbBacs(lot.nb_patons)}</div>
      </div>
      {conseil && <div style={ALERTE("alerte")}>Deux lots de suite avec plus de 5 % d&apos;eau de bassinage restante ({conseil.reste_pct.toLocaleString("fr-FR")} % en moyenne). Dans les réglages de la recette, passe l&apos;eau de départ de {conseil.de[0]} % à {conseil.vers[0]} % (répartition {conseil.de[0]}/{conseil.de[1]} vers {conseil.vers[0]}/{conseil.vers[1]}) : l&apos;hydratation totale ne change pas.</div>}
    </div>
  );
}

/**
 * Pétrissage (05/11/2026, retour de Paul) : un chrono continu lancé sur un geste, et une frise verticale par créneaux
 * (0:00 → 2:00, 2:00 → 7:00…). Le chrono surligne le créneau en cours, avec bip et vibration au changement ;
 * chaque ligne se coche à la main. Une ligne non cochée à l'heure de la suivante passe en orange, sans rien bloquer.
 */
function ChronoPetrissage({ lot, calcul, occupe, appliquer }: { lot: Lot; calcul: PateResult | null; occupe: boolean; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
  const reperes = useMemo<Repere[]>(() => {
    const fin = calcul?.phases.find((p) => p.kind !== "biga");
    const finales = lot.etapes.filter((e) => e.phase === "final").sort((x, y) => x.ordre - y.ordre);
    const etapes = finales.length ? finales.map((e) => ({ texte: e.libelle, phase: e.phase, duree_s: e.duree_prevue_s })) : lireEtapesFournee(null, lot.type);
    const farineG = fin ? fin.flours.reduce((t, f) => t + f.grams, 0) : 0;
    const nom = fin && fin.flours.length === 1 ? nomFarine(fin.flours[0].name) : "Farine";
    return reperesPetrissage(etapes, { eauDepart: fin?.water_start_g ?? fin?.water_g ?? 0, farine: farineG, nomFarine: nom, sel: fin?.salt_g ?? 0, bassinage: fin?.water_bassinage_g ?? 0, levure: fin?.yeast_g }, lot.type);
  }, [calcul, lot.etapes, lot.type]);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const debut = lot.chrono_debut_at ? new Date(lot.chrono_debut_at).getTime() : maintenant;
  useEffect(() => { const t = setInterval(() => setMaintenant(Date.now()), 250); return () => clearInterval(t); }, []);
  const ecoule = Math.max(0, Math.floor((maintenant - debut) / 1000));
  // Le créneau en cours d'après le chrono seul : il surligne, il ne coche rien
  const i = Math.max(0, reperes.reduce((k, r, j) => (r.t <= ecoule ? j : k), 0));
  const faits = new Set((lot.reperes_faits ?? []).map(Number));
  const toutFait = reperes.every((_, k) => faits.has(k));

  // Écran allumé pendant tout le pétrissage (navigateurs qui le permettent)
  useEffect(() => {
    type Verrou = { release: () => Promise<void> };
    let verrou: Verrou | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Verrou> } };
    const demander = () => { nav.wakeLock?.request("screen").then((v) => { verrou = v; }).catch(() => undefined); };
    demander();
    const vis = () => { if (document.visibilityState === "visible") demander(); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); void verrou?.release().catch(() => undefined); };
  }, []);

  // Son et vibration à chaque changement de créneau (pas au premier affichage)
  const precedent = useRef<number | null>(null);
  useEffect(() => {
    if (precedent.current !== null && precedent.current !== i) {
      try { navigator.vibrate?.([250, 120, 250, 120, 450]); } catch { /* pas de vibreur */ }
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          [0, 0.35, 0.7].forEach((d) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.25; o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.2); });
          setTimeout(() => void ctx.close().catch(() => undefined), 1500);
        }
      } catch { /* son indisponible */ }
    }
    precedent.current = i;
  }, [i]);

  const couleur = lot.type === "biga" ? "#b8601f" : "#4a6741";
  const courant = reperes[i];
  const vitesse = courant.titre === "Repos" ? "Repos" : /vitesse 2/i.test(courant.titre) ? "Vitesse 2" : "Vitesse 1";
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ ...CADRE, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, position: "sticky", top: 8, zIndex: 5 }}>
        <div>
          <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 54, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{formatDuree(ecoule)}</div>
          <div style={{ fontSize: 12, color: MUTED }}>depuis le début de la vitesse 1 · écran gardé allumé</div>
        </div>
        <span style={{ ...pastille(couleur), fontSize: 14, padding: "6px 12px" }}>{vitesse}</span>
      </div>
      <span style={INTERTITRE}>Pétrissage · coche chaque ligne quand c&apos;est fait</span>
      <div style={{ display: "grid", gap: 6 }}>
        {reperes.map((r, k) => {
          const finT = reperes[k + 1]?.t ?? null;
          const fait = faits.has(k);
          const enCours = k === i && !fait;
          const enRetard = !fait && finT != null && ecoule >= finT;
          const teinte = fait ? BON : enRetard ? ATTENTION : enCours ? couleur : BORD;
          return (
            <button key={k} type="button" disabled={occupe} onClick={() => void appliquer({ action: "cocher", index: k, fait: !fait })}
              style={{ ...CADRE, textAlign: "left", fontFamily: "inherit", cursor: "pointer", padding: enCours ? "14px 14px 14px 18px" : "10px 14px 10px 18px", display: "grid", gridTemplateColumns: "34px 1fr auto", gap: 12, alignItems: "center",
                boxShadow: `inset 6px 0 0 ${teinte}`, background: enCours ? `${couleur}14` : enRetard ? `${ATTENTION}12` : "#fff", color: "#1a1a1a", touchAction: "manipulation" }}>
              <span aria-hidden style={{ width: 30, height: 30, borderRadius: 15, border: `2px solid ${fait ? BON : enRetard ? ATTENTION : BORD}`, background: fait ? BON : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700 }}>{fait ? "✓" : ""}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: OSWALD, fontWeight: 700, fontSize: 14, color: fait ? BON : enRetard ? ATTENTION : enCours ? couleur : MUTED, fontVariantNumeric: "tabular-nums" }}>
                  {formatDuree(r.t)}{finT != null ? ` → ${formatDuree(finT)}` : ""}{enRetard ? " · en retard" : enCours ? " · maintenant" : ""}
                </span>
                <span style={{ display: "block", fontSize: enCours ? 18 : 15, fontWeight: 700, marginTop: 2, textDecoration: fait ? "line-through" : undefined, color: fait ? MUTED : "#1a1a1a" }}>{r.titre}</span>
                {(enCours || enRetard) && <span style={{ display: "block", fontSize: 14, color: "#1a1a1a", marginTop: 2 }}>{r.consigne}{r.indicatif ? " (repère indicatif)" : ""}</span>}
              </span>
              <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: enCours ? 34 : 20, fontVariantNumeric: "tabular-nums", color: fait ? MUTED : "#1a1a1a", whiteSpace: "nowrap" }}>
                {r.grammes != null ? `${Math.round(r.grammes).toLocaleString("fr-FR")} g` : ""}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" disabled={occupe} onClick={() => void appliquer({ action: "fin_petrissage" })} style={toutFait ? VALIDE : { ...GROS, color: MUTED }}>
        Pétrissage terminé, passer aux contrôles
      </button>
    </div>
  );
}

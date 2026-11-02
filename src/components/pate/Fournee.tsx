"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { useTablette } from "@/lib/tablette/store";
import { BON, ATTENTION, MAUVAIS, INFO, BORD, MUTED, FAIBLE, CADRE, INTERTITRE, OSWALD, BTN, CHAMP, pastille } from "@/components/ui/charte";
import type { PateResult, Phase } from "@/lib/pateEngine";
import { formatG, lignesPesee, nomPhase } from "@/lib/pateAffichage";
import { alerteBiga, alertePate, conseilEau, eauBiga, eauPetrissage, etatBiga, formatDuree, CIBLE_BIGA, CIBLE_PATE, type TbCalculee } from "@/lib/pate/fournee";

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
  etapes: Etape[];
};
type Acteur = { nom: string; peutLancer: boolean; source: "tablette" | "compte" };
type Etat = { lots: Lot[]; ouvert: Lot | null; acteur: Acteur };

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

export function Fournee({ recipeId, recetteNom, type, nbPatonsDefaut, poidsPaton, calcul }: {
  recipeId: string; recetteNom: string; type: "biga" | "direct" | "focaccia"; nbPatonsDefaut: number; poidsPaton: number;
  /** calcul courant de la fiche (pour l'aperçu avant lancement) */
  calcul: ((nb: number) => PateResult | null) | null;
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
      const r = await fetchApi("/api/pate/lots", { method: "POST", headers: { "Content-Type": "application/json", ...entetes }, body: JSON.stringify({ recipe_id: recipeId, nb_patons: patons, poids_paton: poidsPaton, essai, essai_variable: essai ? essaiVariable : null, essai_valeur: essai ? essaiValeur : null }) });
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
      {!lot ? (
        <Demarrage type={type} recetteNom={recetteNom} patons={patons} setPatons={setPatons} poidsPaton={poidsPaton} calcul={calcul} peutLancer={etat.acteur.peutLancer} occupe={occupe} onLancer={lancer}
          essai={essai} setEssai={setEssai} essaiVariable={essaiVariable} setEssaiVariable={setEssaiVariable} essaiValeur={essaiValeur} setEssaiValeur={setEssaiValeur} />
      ) : (
        <Deroule lot={lot} tb={tb} occupe={occupe} peutLancer={etat.acteur.peutLancer} appliquer={(corps) => appliquer(lot.id, corps)} />
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
function Deroule({ lot, tb, occupe, peutLancer, appliquer }: { lot: Lot; tb: TbCalculee | null; occupe: boolean; peutLancer: boolean; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
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
  const [annulation, setAnnulation] = useState(false);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...CADRE, padding: "12px 16px", boxShadow: `inset 6px 0 0 ${couleur}`, display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "baseline" }}>
        <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 20 }}>{lot.numero}</span>
        <span style={pastille(couleur)}>{lot.type === "biga" ? "biga" : "directe"}</span>
        <span style={{ fontSize: 13, color: MUTED }}>{lot.nb_patons} pâtons × {lot.poids_paton} g · {lot.operateur_nom ?? ""}</span>
        {lot.essai && <span style={pastille(INFO)}>essai : {lot.essai_variable}{lot.essai_valeur ? ` (${lot.essai_valeur})` : ""}</span>}
        <span style={{ fontSize: 12.5, color: MUTED }}>{lot.statut === "biga_en_cours" ? `Biga lancée ${dateHeure(lot.biga_debut_at)}` : lot.statut === "biga_au_froid" ? `Biga au froid depuis ${dateHeure(lot.biga_froid_at)}` : `Pétrissage ${dateHeure(lot.petrissage_debut_at)}`}</span>
      </div>

      {lot.statut === "biga_au_froid" && <EtatBiga froidAt={lot.biga_froid_at} />}

      {besoinTemps ? (
        <Temperatures lot={lot} phase={phaseCourante} tb={tb} occupe={occupe} appliquer={appliquer} />
      ) : courante ? (
        <EtapeEnCours key={courante.id} lot={lot} etape={courante} index={etapes.indexOf(courante)} total={etapes.length} faites={faites} calcul={calcul} occupe={occupe} appliquer={appliquer} />
      ) : phaseCourante === "biga" ? (
        <BigaAuFroid lot={lot} occupe={occupe} appliquer={appliquer} />
      ) : (
        <Cloture lot={lot} occupe={occupe} peutLancer={peutLancer} appliquer={appliquer} />
      )}

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
  const [tFarine, setTFarine] = useState<string>("");
  const [tCuisine, setTCuisine] = useState<string>("");
  const [tBiga, setTBiga] = useState<string>("");
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
        {phase === "biga" ? "Eau réglée, commencer la biga" : "Eau réglée, commencer le pétrissage"}
      </button>
    </div>
  );
}

/* ── Étape en cours avec minuteur ───────────────────────────────────────── */
function EtapeEnCours({ lot, etape, index, total, faites, calcul, occupe, appliquer }: { lot: Lot; etape: Etape; index: number; total: number; faites: number; calcul: PateResult | null; occupe: boolean; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
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
      <span style={INTERTITRE}>{etape.phase === "biga" ? "Biga" : "Pétrissage"} · étape {index + 1} sur {total} · {faites} faite{faites > 1 ? "s" : ""}</span>
      <div style={{ ...CADRE, padding: 16, boxShadow: `inset 6px 0 0 ${couleur}` }}>
        <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 22, lineHeight: 1.2, textWrap: "balance" }}>{etape.libelle}</div>
        {rappel.length > 0 && <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>{rappel.map((l) => <span key={l.libelle} style={pastille("#1a1a1a")}>{l.libelle} {formatG(l.grammes, l.precis)}</span>)}</div>}
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

/* ── Fin de la biga : au froid ──────────────────────────────────────────── */
function BigaAuFroid({ lot, occupe, appliquer }: { lot: Lot; occupe: boolean; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
  const [tSortie, setTSortie] = useState("");
  const [tEau, setTEau] = useState(lot.t_eau_biga_calc != null ? String(lot.t_eau_biga_calc) : "");
  const t = tSortie.trim() === "" ? null : Number(tSortie.replace(",", "."));
  const a = t != null && Number.isFinite(t) ? alerteBiga(t) : null;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <span style={INTERTITRE}>Biga · au froid</span>
      <div style={{ ...CADRE, padding: 14, display: "grid", gap: 10 }}>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15 }}>
          <span>Biga en sortie de pétrin <span style={{ color: MUTED, fontSize: 12.5 }}>(cible {CIBLE_BIGA.min} à {CIBLE_BIGA.max} °C, facultatif)</span></span>
          <span><input type="number" inputMode="decimal" step={0.5} value={tSortie} onChange={(e) => setTSortie(e.target.value)} style={{ width: 80, textAlign: "right", fontFamily: OSWALD, fontWeight: 700, fontSize: 24, border: "none", borderBottom: `1px solid ${BORD}`, outline: "none" }} /> <span style={{ color: MUTED }}>°C</span></span>
        </label>
        {a?.message && <div style={ALERTE(a.niveau)}>{a.message}</div>}
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15 }}>
          <span>Eau réellement utilisée</span>
          <span><input type="number" inputMode="decimal" step={0.5} value={tEau} onChange={(e) => setTEau(e.target.value)} style={{ width: 80, textAlign: "right", fontFamily: OSWALD, fontWeight: 700, fontSize: 24, border: "none", borderBottom: `1px solid ${BORD}`, outline: "none" }} /> <span style={{ color: MUTED }}>°C</span></span>
        </label>
      </div>
      <button type="button" disabled={occupe} onClick={() => void appliquer({ action: "biga_froid", t_biga_sortie: t, t_eau_utilisee: tEau.trim() === "" ? null : Number(tEau.replace(",", ".")) })} style={PRINCIPAL}>
        Biga au froid à 4 °C, heure enregistrée
      </button>
      <div style={{ fontSize: 12.5, color: MUTED, textAlign: "center" }}>Le pétrissage final se fait demain : la fournée reste ouverte, avec l&apos;âge de la biga affiché.</div>
    </div>
  );
}

/* ── Contrôles et clôture ───────────────────────────────────────────────── */
function Cloture({ lot, occupe, peutLancer, appliquer }: { lot: Lot; occupe: boolean; peutLancer: boolean; appliquer: (corps: Record<string, unknown>) => Promise<boolean> }) {
  const [voile, setVoile] = useState(false);
  const [tPate, setTPate] = useState("");
  const [tEau, setTEau] = useState(lot.t_eau_calc != null ? String(lot.t_eau_calc) : "");
  const [commentaire, setCommentaire] = useState(lot.commentaire ?? "");
  const t = tPate.trim() === "" ? null : Number(tPate.replace(",", "."));
  const a = t != null && Number.isFinite(t) ? alertePate(t) : null;
  const pret = voile && t != null && Number.isFinite(t);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <span style={INTERTITRE}>Pétrissage · contrôles avant clôture</span>
      <label style={{ ...CADRE, padding: 14, display: "flex", alignItems: "center", gap: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", boxShadow: voile ? `inset 6px 0 0 ${BON}` : undefined }}>
        <input type="checkbox" checked={voile} onChange={(e) => setVoile(e.target.checked)} style={{ width: 26, height: 26 }} />
        Test du voile fait
      </label>
      <label style={{ ...CADRE, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16 }}>
        <span>Pâte en sortie de pétrin <span style={{ color: MUTED, fontSize: 12.5 }}>(obligatoire)</span></span>
        <span><input type="number" inputMode="decimal" step={0.5} value={tPate} onChange={(e) => setTPate(e.target.value)} aria-label="Température de la pâte" style={{ width: 84, textAlign: "right", fontFamily: OSWALD, fontWeight: 700, fontSize: 26, border: "none", borderBottom: `1px solid ${BORD}`, outline: "none" }} /> <span style={{ color: MUTED }}>°C</span></span>
      </label>
      {a && <div style={ALERTE(a.niveau)}>{a.message ?? `Pâte à ${t} °C, dans la cible ${CIBLE_PATE.min} à ${CIBLE_PATE.max} °C.`}</div>}
      <label style={{ ...CADRE, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15 }}>
        <span>Eau réellement utilisée <span style={{ color: MUTED, fontSize: 12.5 }}>(conseillée {temp(lot.t_eau_calc)})</span></span>
        <span><input type="number" inputMode="decimal" step={0.5} value={tEau} onChange={(e) => setTEau(e.target.value)} style={{ width: 84, textAlign: "right", fontFamily: OSWALD, fontWeight: 700, fontSize: 24, border: "none", borderBottom: `1px solid ${BORD}`, outline: "none" }} /> <span style={{ color: MUTED }}>°C</span></span>
      </label>
      <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Commentaire (facultatif)" rows={2} style={{ ...CHAMP, height: "auto", resize: "vertical" }} />
      <button type="button" disabled={!pret || occupe || !peutLancer} onClick={() => void appliquer({ action: "cloture", voile_ok: voile, t_pate_sortie: t, t_eau_utilisee: tEau.trim() === "" ? null : Number(tEau.replace(",", ".")), commentaire })} style={{ ...VALIDE, opacity: !pret || occupe || !peutLancer ? 0.5 : 1 }}>
        Boulé, lot clôturé
      </button>
      {!peutLancer && <div style={{ fontSize: 12.5, color: MUTED, textAlign: "center" }}>Clôturer un lot est réservé aux pizzaiolos formés et aux responsables.</div>}
    </div>
  );
}

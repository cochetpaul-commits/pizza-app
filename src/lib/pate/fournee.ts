import type { EmpatementType } from "@/lib/pateEngine";

/**
 * Fabrication par lot (module pâte, phase 2, 02/11/2026). Logique pure, partagée par l'API et l'écran Fournée :
 * numéro de lot, températures d'eau, température de base du pétrin (TB), étapes par défaut, alertes.
 * Décisions de Paul (02/11) : TB manuelle de départ 56 ; cible biga 20 à 21 °C ; cible pâte 22 à 24 °C, alerte forte
 * au delà de 25 °C ; sous 2 °C d'eau « ajouter des glaçons », au dessus de 35 °C avertissement.
 */
export type PhaseFournee = "biga" | "final";
export type StatutLot = "biga_en_cours" | "biga_au_froid" | "petrissage" | "cloture" | "annule";

export type EtapeFournee = { texte: string; phase: PhaseFournee; duree_s: number | null };

export const TB_MANUELLE_DEFAUT = 56;
export const CIBLE_BIGA = { min: 20, max: 21 };
export const CIBLE_PATE = { min: 22, max: 24, forte: 25 };
export const EAU_GLACONS = 2;
export const EAU_TROP_CHAUDE = 35;
export const FENETRE_BIGA_H = { min: 20, max: 30, cible: 24 };
/** Nombre de lots valides avant que la TB calculée remplace la valeur manuelle, et taille de la moyenne */
export const TB_LOTS_MIN = 3;
export const TB_LOTS_MOYENNE = 5;

/** Étapes par défaut d'une fournée, avec la phase et le minuteur quand il y en a un (textes du brief v2, 1.3) */
export const ETAPES_FOURNEE_BIGA: EtapeFournee[] = [
  { phase: "biga", texte: "Délayer la levure dans l'eau de biga.", duree_s: null },
  { phase: "biga", texte: "Ajouter la farine de biga, mélanger en marche arrière. S'arrêter dès que la farine est hydratée.", duree_s: 120 },
  { phase: "biga", texte: "Bac légèrement huilé, couvert, au froid à 4 °C pendant 24 h (fenêtre 20 à 30 h).", duree_s: null },
  { phase: "final", texte: "Eau de départ et biga coupée en morceaux, vitesse 1.", duree_s: 120 },
  { phase: "final", texte: "Ajouter la farine du pétrissage final, continuer en vitesse 1 jusqu'à 7 min.", duree_s: 300 },
  { phase: "final", texte: "Ajouter le sel.", duree_s: null },
  { phase: "final", texte: "Sel absorbé : bassinage en filet, fin de vitesse 1 à 10 ou 11 min.", duree_s: 210 },
  { phase: "final", texte: "Vitesse 2 en terminant le bassinage.", duree_s: 270 },
  { phase: "final", texte: "Repos.", duree_s: 180 },
  { phase: "final", texte: "Un tour de vitesse 1.", duree_s: null },
  { phase: "final", texte: "Division en grosses boules, rabats, filet d'huile d'olive, détaillage au poids du pâton (tolérance 5 g), boulage, 12 pâtons par bac.", duree_s: null },
];
export const ETAPES_FOURNEE_DIRECT: EtapeFournee[] = [
  { phase: "final", texte: "Délayer la levure dans l'eau de départ avec le miel, verser en cuve, vitesse 1.", duree_s: 120 },
  { phase: "final", texte: "Ajouter toutes les farines, continuer en vitesse 1 jusqu'à 7 min.", duree_s: 300 },
  { phase: "final", texte: "Ajouter le sel.", duree_s: null },
  { phase: "final", texte: "Sel absorbé : bassinage en filet, fin de vitesse 1 à 10 ou 11 min.", duree_s: 210 },
  { phase: "final", texte: "Vitesse 2 en terminant le bassinage.", duree_s: 270 },
  { phase: "final", texte: "Repos.", duree_s: 180 },
  { phase: "final", texte: "Un tour de vitesse 1.", duree_s: null },
  { phase: "final", texte: "Division en grosses boules, rabats, filet d'huile d'olive, détaillage au poids du pâton (tolérance 5 g), boulage, 12 pâtons par bac.", duree_s: null },
];

export function etapesFourneeParDefaut(type: EmpatementType): EtapeFournee[] {
  return (type === "biga" ? ETAPES_FOURNEE_BIGA : ETAPES_FOURNEE_DIRECT).map((e) => ({ ...e }));
}

/** Lit les étapes enregistrées sur la recette (jsonb), sinon les étapes par défaut du type */
export function lireEtapesFournee(brut: unknown, type: EmpatementType): EtapeFournee[] {
  if (Array.isArray(brut) && brut.length > 0) {
    const liste = brut
      .map((e): EtapeFournee | null => {
        if (!e || typeof e !== "object") return null;
        const o = e as Record<string, unknown>;
        const texte = String(o.texte ?? "").trim();
        if (!texte) return null;
        const d = Number(o.duree_s);
        return { texte, phase: o.phase === "biga" ? "biga" : "final", duree_s: Number.isFinite(d) && d > 0 ? Math.round(d) : null };
      })
      .filter((e): e is EtapeFournee => e !== null);
    if (liste.length > 0) return type === "biga" ? liste : liste.filter((e) => e.phase === "final");
  }
  return etapesFourneeParDefaut(type);
}

/** Numéro de lot : L-AAAA-MM-JJ-A, la date est celle du pétrissage final, la lettre suit les lots déjà pris ce jour là */
export function numeroLot(datePetrissage: string, numerosExistants: string[]): string {
  const base = `L-${datePetrissage}-`;
  const lettres = numerosExistants.filter((n) => n.startsWith(base)).map((n) => n.slice(base.length)).filter((l) => /^[A-Z]$/.test(l));
  let code = 65;
  while (lettres.includes(String.fromCharCode(code)) && code < 91) code++;
  return `${base}${String.fromCharCode(code)}`;
}

/** Eau de la biga : 55 moins (farine + cuisine) */
export const eauBiga = (tFarine: number, tCuisine: number) => 55 - (tFarine + tCuisine);

/** Eau du pétrissage : TB moins (farine + cuisine + biga) ; pas de biga pour une directe */
export const eauPetrissage = (tb: number, tFarine: number, tCuisine: number, tBiga: number | null) => tb - (tFarine + tCuisine + (tBiga ?? 0));

export type ConseilEau = { temperature: number; message: string | null; niveau: "ok" | "glacons" | "chaud" };
export function conseilEau(temperature: number): ConseilEau {
  const t = Math.round(temperature * 10) / 10;
  if (t < EAU_GLACONS) return { temperature: t, niveau: "glacons", message: "Eau très froide : ajouter des glaçons." };
  if (t > EAU_TROP_CHAUDE) return { temperature: t, niveau: "chaud", message: "Eau au dessus de 35 °C : vérifie les températures saisies avant de pétrir." };
  return { temperature: t, niveau: "ok", message: null };
}

/** TB d'un lot : farine + cuisine + eau utilisée + biga mesurées (0 pour une directe) */
export const tbLot = (tFarine: number, tCuisine: number, tEau: number, tBiga: number | null) => tFarine + tCuisine + tEau + (tBiga ?? 0);

export type LotPourTb = { type: EmpatementType; t_farine: number | null; t_cuisine: number | null; t_eau_utilisee: number | null; t_biga: number | null; t_pate_sortie: number | null; cloture_at: string | null };

/** Un lot compte pour la TB quand toutes ses températures sont là et que la pâte est sortie dans la cible */
export function lotValidePourTb(l: LotPourTb): boolean {
  if (l.t_farine == null || l.t_cuisine == null || l.t_eau_utilisee == null || l.t_pate_sortie == null) return false;
  if (l.type === "biga" && l.t_biga == null) return false;
  return l.t_pate_sortie >= CIBLE_PATE.min && l.t_pate_sortie <= CIBLE_PATE.max;
}

export type TbCalculee = { tb: number; source: "lots" | "manuelle"; nbLots: number };
/** TB appliquée : moyenne des 5 derniers lots valides du même type, sinon la valeur manuelle (tant qu'il y en a moins de 3) */
export function calculerTb(lots: LotPourTb[], type: EmpatementType, tbManuelle: number | null | undefined): TbCalculee {
  const valides = lots
    .filter((l) => l.type === type && lotValidePourTb(l))
    .sort((a, b) => String(b.cloture_at ?? "").localeCompare(String(a.cloture_at ?? "")))
    .slice(0, TB_LOTS_MOYENNE);
  const manuelle = tbManuelle == null || !Number.isFinite(Number(tbManuelle)) ? TB_MANUELLE_DEFAUT : Number(tbManuelle);
  if (valides.length < TB_LOTS_MIN) return { tb: manuelle, source: "manuelle", nbLots: valides.length };
  const somme = valides.reduce((t, l) => t + tbLot(l.t_farine as number, l.t_cuisine as number, l.t_eau_utilisee as number, l.t_biga), 0);
  return { tb: Math.round((somme / valides.length) * 10) / 10, source: "lots", nbLots: valides.length };
}

export type NiveauAlerte = "ok" | "alerte" | "forte";
/** Température de la pâte en sortie de pétrin face à la cible 22 à 24 °C */
export function alertePate(t: number): { niveau: NiveauAlerte; message: string | null } {
  if (t > CIBLE_PATE.forte) return { niveau: "forte", message: `Pâte à ${t} °C, au delà de ${CIBLE_PATE.forte} °C : fermentation trop rapide, bacs au froid sans attendre.` };
  if (t < CIBLE_PATE.min || t > CIBLE_PATE.max) return { niveau: "alerte", message: `Pâte à ${t} °C, hors cible ${CIBLE_PATE.min} à ${CIBLE_PATE.max} °C.` };
  return { niveau: "ok", message: null };
}
/** Température de la biga en sortie de pétrin face à la cible 20 à 21 °C */
export function alerteBiga(t: number): { niveau: NiveauAlerte; message: string | null } {
  if (t < CIBLE_BIGA.min || t > CIBLE_BIGA.max) return { niveau: "alerte", message: `Biga à ${t} °C, hors cible ${CIBLE_BIGA.min} à ${CIBLE_BIGA.max} °C.` };
  return { niveau: "ok", message: null };
}

/** Âge de la biga en heures depuis l'entrée au froid, et ce qu'on en dit */
export function etatBiga(froidAt: string | null, maintenant = Date.now()): { heures: number | null; niveau: "jeune" | "ok" | "depassee" | null; message: string | null } {
  if (!froidAt) return { heures: null, niveau: null, message: null };
  const h = Math.round(((maintenant - new Date(froidAt).getTime()) / 3600000) * 10) / 10;
  if (h < FENETRE_BIGA_H.min) return { heures: h, niveau: "jeune", message: `Biga de ${formatHeures(h)}, trop jeune (fenêtre ${FENETRE_BIGA_H.min} à ${FENETRE_BIGA_H.max} h).` };
  if (h > FENETRE_BIGA_H.max) return { heures: h, niveau: "depassee", message: `Biga de ${formatHeures(h)}, au delà de la fenêtre de ${FENETRE_BIGA_H.max} h.` };
  return { heures: h, niveau: "ok", message: `Biga de ${formatHeures(h)}, dans la fenêtre ${FENETRE_BIGA_H.min} à ${FENETRE_BIGA_H.max} h.` };
}

export function formatHeures(h: number): string {
  const heures = Math.floor(h), minutes = Math.round((h - heures) * 60);
  return minutes > 0 ? `${heures} h ${String(minutes).padStart(2, "0")}` : `${heures} h`;
}

export const formatDuree = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

/** Date locale AAAA-MM-JJ (Paris) décalée de n jours */
export function dateLocale(decalageJours = 0, maintenant = new Date()): string {
  const d = new Date(maintenant.getTime() + decalageJours * 86400000);
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/* ── Pétrissage chronométré (04/11/2026, retour terrain du lot de 200 pâtons) ─────────────────────────── */

/** Pâtons par bac (12 partout, décision de Paul du 02/11) */
export const PATONS_PAR_BAC = 12;
export const nbBacs = (patons: number, parBac = PATONS_PAR_BAC) => (patons > 0 && parBac > 0 ? Math.ceil(patons / parBac) : 0);
/** « 16 bacs pleins et un bac de 8 » */
export function detailBacs(patons: number, parBac = PATONS_PAR_BAC): string {
  const pleins = Math.floor(patons / parBac), reste = patons - pleins * parBac;
  if (reste === 0) return `${pleins} bac${pleins > 1 ? "s" : ""} pleins`;
  if (pleins === 0) return `un bac de ${reste}`;
  return `${pleins} bac${pleins > 1 ? "s" : ""} plein${pleins > 1 ? "s" : ""} et un bac de ${reste}`;
}

/** Eau de bassinage en trois pichets, au gramme près, le dernier prend l'arrondi */
export function tiersBassinage(total: number): [number, number, number] {
  const t = Math.round(total / 3);
  return [t, t, Math.max(0, Math.round(total) - 2 * t)];
}

export type Repere = {
  /** Secondes depuis le début de la vitesse 1 */
  t: number;
  titre: string;
  consigne: string;
  /** Quantité à verser, en grammes (null : pas de pesée à cette étape) */
  grammes: number | null;
  /** Repère indicatif, à valider d'un geste (premier tiers du bassinage, « dès le sel absorbé ») */
  indicatif?: boolean;
};

export type PeseesPetrissage = { eauDepart: number; farine: number; nomFarine: string; sel: number; bassinage: number; levure?: number };

/**
 * Frise du pétrissage. Les temps viennent des étapes de la recette (minuteurs cumulés : eau de départ 2:00,
 * farine 5:00, bassinage 3:30, vitesse 2 4:30, repos 3:00), le bassinage est coupé en trois : un tiers 30 s
 * après le sel (repère indicatif, sel absorbé), un tiers 1:30 avant la vitesse 2, le reste au début de la
 * vitesse 2. Avec les valeurs par défaut : 0:00, 2:00, 7:00, 7:30, 9:00, 10:30, 15:00, 18:00.
 */
export function reperesPetrissage(etapes: EtapeFournee[], p: PeseesPetrissage, type: EmpatementType): Repere[] {
  const finales = etapes.filter((e) => e.phase === "final");
  const trouve = (re: RegExp) => finales.findIndex((e) => re.test(e.texte.toLowerCase()));
  const offsets: number[] = [];
  let t = 0;
  for (const e of finales) { offsets.push(t); t += e.duree_s ?? 0; }
  const at = (i: number, defaut: number) => (i >= 0 ? offsets[i] : defaut);
  const tFarine = at(trouve(/farine/), 120);
  const tSel = at(trouve(/\bsel\b/), 420);
  const tV2 = at(trouve(/vitesse 2/), 630);
  const tRepos = at(trouve(/repos/), 900);
  const tTour = at(trouve(/tour de vitesse 1/), 1080);
  const [b1, b2, b3] = tiersBassinage(p.bassinage);
  const direct = type !== "biga";
  return [
    { t: 0, titre: direct ? "Eau de départ et levure" : "Eau de départ et biga", grammes: p.eauDepart,
      consigne: direct ? `Levure délayée dans l'eau de départ avec le miel${p.levure ? ` (${Math.round(p.levure)} g de levure)` : ""}, vitesse 1` : "Eau de départ avec le miel dissous, biga coupée en morceaux, vitesse 1" },
    { t: tFarine, titre: direct ? "Toutes les farines" : p.nomFarine, grammes: p.farine, consigne: direct ? "Ajouter toutes les farines, continuer en vitesse 1" : `Ajouter la ${p.nomFarine.toLowerCase()}, continuer en vitesse 1` },
    { t: tSel, titre: "Sel", grammes: p.sel, consigne: "Ajouter le sel" },
    { t: tSel + 30, titre: "Bassinage, premier pichet", grammes: b1, consigne: "Dès le sel absorbé, en filet", indicatif: true },
    { t: Math.max(tSel + 60, tV2 - 90), titre: "Bassinage, deuxième pichet", grammes: b2, consigne: "En filet, toujours en vitesse 1" },
    { t: tV2, titre: "Vitesse 2, dernier pichet", grammes: b3, consigne: "Passer en vitesse 2 pendant 4 min 30 et finir le bassinage" },
    { t: tRepos, titre: "Repos", grammes: null, consigne: "Arrêter le pétrin, repos 3 min" },
    { t: tTour, titre: "Un tour de vitesse 1", grammes: null, consigne: "Un tour de vitesse 1, puis test du voile" },
  ];
}

/** Repère en cours : le dernier atteint par le chrono, ou plus loin si on a avancé à la main */
export function repereCourant(reperes: Repere[], ecouleS: number, avance: number): number {
  let i = 0;
  for (let k = 0; k < reperes.length; k++) if (reperes[k].t <= ecouleS) i = k;
  return Math.min(reperes.length - 1, Math.max(i, avance));
}

export type LotBassinage = { eau_bassinage_restante_g: number | null; bassinage_g: number | null };
/**
 * Reste d'eau de bassinage au delà de 5 % deux lots de suite (décision de Paul du 04/11) : on propose de déplacer
 * une part du bassinage vers l'eau de départ, hydratation totale inchangée (ex. 80/20 vers 85/15).
 * Arrondi au point près ; null tant qu'il n'y a pas deux lots concernés.
 */
export function conseilBassinage(derniers: LotBassinage[], waterStartPct: number): { de: [number, number]; vers: [number, number]; reste_pct: number } | null {
  const deux = derniers.slice(0, 2);
  if (deux.length < 2) return null;
  const parts = deux.map((l) => (l.eau_bassinage_restante_g != null && l.bassinage_g ? l.eau_bassinage_restante_g / l.bassinage_g : null));
  if (parts.some((x) => x == null || x <= 0.05)) return null;
  const moy = (parts as number[]).reduce((t, x) => t + x, 0) / parts.length;
  const bassinage = 100 - waterStartPct;
  const nouveau = Math.max(0, Math.round(bassinage * (1 - moy)));
  if (nouveau >= bassinage) return null;
  return { de: [waterStartPct, bassinage], vers: [100 - nouveau, nouveau], reste_pct: Math.round(moy * 1000) / 10 };
}

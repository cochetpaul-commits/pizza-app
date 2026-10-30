/**
 * Objectifs (29/10/2026) : le rythme de croisière, le budget par poste et le simulateur « Et si… ».
 * Calculs purs, sans accès aux données ; les réglages vivent dans etablissement_params (clé « objectifs »).
 */

export type Plancher = { couverts: number; tm: number; services: number };
export type PosteBudget = {
  cle: string; libelle: string; court: string;
  /** Postes Pennylane additionnés (charges_mensuelles) */
  composition: string[];
  type: "pct" | "eur";
  /** La masse salariale est connue avec un mois de retard */
  lag?: boolean;
};
export type Reglages = {
  /** Plancher du rythme de croisière : couverts par service, ticket moyen TTC, services par semaine */
  plancher: Plancher;
  /** Objectif par poste : % du CA HT, ou € par mois pour les postes fixes */
  objectifs: Record<string, number>;
  /** Référence (liasse du dernier exercice), même unité que l'objectif */
  references: Record<string, number>;
  /** Rapport TTC / HT des ventes (10 % sur place, 20 % sur les alcools) */
  ttcHt: number;
  /** Charges d'emprunt mensuelles (intérêts + capital) et taux d'IS, pour la capacité d'investissement */
  emprunts: number;
  tauxIs: number;
  /** Dernières hypothèses du simulateur */
  simulateur?: Partial<EntreesSimulateur>;
};

export const POSTES_BUDGET: PosteBudget[] = [
  { cle: "achats_matieres", libelle: "Achats matières (cuisine, boissons, café)", court: "Achats matières", composition: ["achats_matieres"], type: "pct" },
  { cle: "masse_salariale", libelle: "Masse salariale (décalée d'un mois)", court: "Masse salariale", composition: ["masse_salariale"], type: "pct", lag: true },
  { cle: "energie", libelle: "Énergie (électricité, gaz, eau)", court: "Énergie", composition: ["energie"], type: "pct" },
  { cle: "entretien", libelle: "Hygiène, entretien, maintenance", court: "Entretien", composition: ["entretien"], type: "pct" },
  { cle: "autres_charges", libelle: "Autres charges externes", court: "Autres charges", composition: ["autres_charges", "commissions_cb", "assurances", "honoraires", "locations", "a_categoriser"], type: "pct" },
  { cle: "loyer", libelle: "Loyer", court: "Loyer", composition: ["loyer"], type: "eur" },
  { cle: "remuneration_gerants", libelle: "Direction (holding)", court: "Direction", composition: ["remuneration_gerants"], type: "eur" },
];

export const REGLAGES_DEFAUT: Reglages = {
  plancher: { couverts: 60, tm: 35, services: 9 },
  objectifs: { achats_matieres: 28, masse_salariale: 31, energie: 2.5, entretien: 2.5, autres_charges: 4, loyer: 4300, remuneration_gerants: 13900 },
  references: { achats_matieres: 30.4, masse_salariale: 29.5, energie: 2.7, entretien: 2.9, autres_charges: 4.5, loyer: 3219, remuneration_gerants: 13867 },
  ttcHt: 1.117,
  emprunts: 5150,
  tauxIs: 25,
};

export function fusionnerReglages(p: Partial<Reglages> | null | undefined): Reglages {
  return {
    plancher: { ...REGLAGES_DEFAUT.plancher, ...(p?.plancher ?? {}) },
    objectifs: { ...REGLAGES_DEFAUT.objectifs, ...(p?.objectifs ?? {}) },
    references: { ...REGLAGES_DEFAUT.references, ...(p?.references ?? {}) },
    ttcHt: p?.ttcHt && p.ttcHt > 1 ? p.ttcHt : REGLAGES_DEFAUT.ttcHt,
    emprunts: p?.emprunts ?? REGLAGES_DEFAUT.emprunts,
    tauxIs: p?.tauxIs ?? REGLAGES_DEFAUT.tauxIs,
    simulateur: p?.simulateur,
  };
}

/** Plancher hebdomadaire TTC, puis mensuel HT (52 semaines / 12) */
export const plancherHebdoTtc = (p: Plancher) => p.couverts * p.tm * p.services;
export const plancherMensuelHt = (p: Plancher, ttcHt: number) => (plancherHebdoTtc(p) * 52) / 12 / ttcHt;

/** Montant d'un poste de budget à partir des postes Pennylane du mois */
export const montantPoste = (poste: PosteBudget, postes: Record<string, number>) => poste.composition.reduce((t, k) => t + (postes[k] ?? 0), 0);

export type Niveau = "bon" | "attention" | "mauvais" | "na";
/** Statut d'un poste face à son objectif : dans le budget, jusqu'à +10 %, au-delà ; « na » si le mois est incomplet */
export function statutBudget(poste: PosteBudget, montant: number | null, caHt: number, incomplet: boolean, objectif: number): { niveau: Niveau; valeur: number | null; texte: string } {
  if (incomplet || montant == null || (poste.type === "pct" && caHt <= 0)) return { niveau: "na", valeur: null, texte: "en cours" };
  const valeur = poste.type === "pct" ? (montant / caHt) * 100 : montant;
  const niveau: Niveau = valeur <= objectif * 1.001 ? "bon" : valeur <= objectif * 1.1 ? "attention" : "mauvais";
  return { niveau, valeur, texte: poste.type === "pct" ? pct1(valeur) : eur0(valeur) };
}

export const eur0 = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
export const pct1 = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

/* ── Services type ─────────────────────────────────────────────────────── */
export type ServiceVendu = { date: string; svc: "midi" | "soir" | "journee"; ca_ht: number; ca_ttc: number; couverts: number };
export type ServiceType = { jour: number; svc: "midi" | "soir" | "journee"; libelle: string; n: number; couverts: number; ca_ht: number; ca_ttc: number; tmTtc: number };
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const jourDe = (date: string) => new Date(date + "T12:00:00").getDay();

/** Moyenne par jour de la semaine et service (lundi midi, lundi soir…), services ouverts seulement */
export function servicesType(services: ServiceVendu[]): ServiceType[] {
  const acc = new Map<string, ServiceType>();
  for (const s of services) {
    if (s.couverts <= 0 && s.ca_ht <= 0) continue;
    const jour = jourDe(s.date);
    const cle = `${jour}-${s.svc}`;
    // « journee » : journal de caisse sans service (Kezia, Piccola Mia)
    const t = acc.get(cle) ?? { jour, svc: s.svc, libelle: `${JOURS[jour]}${s.svc === "journee" ? "" : ` ${s.svc}`}`, n: 0, couverts: 0, ca_ht: 0, ca_ttc: 0, tmTtc: 0 };
    t.n++; t.couverts += s.couverts; t.ca_ht += s.ca_ht; t.ca_ttc += s.ca_ttc;
    acc.set(cle, t);
  }
  const ordre = (j: number) => (j + 6) % 7; // lundi d'abord
  return [...acc.values()].map((t) => ({ ...t, couverts: t.couverts / t.n, ca_ht: t.ca_ht / t.n, ca_ttc: t.ca_ttc / t.n, tmTtc: t.couverts > 0 ? t.ca_ttc / t.couverts : 0 }))
    .sort((a, b) => ordre(a.jour) - ordre(b.jour) || (a.svc === "midi" ? -1 : 1));
}

/* ── Simulateur ────────────────────────────────────────────────────────── */
export type EntreesSimulateur = {
  /** Couverts et ticket moyen TTC par service, services par semaine : midi puis soir */
  cm: number; tm: number; nm: number; cs: number; ts: number; ns: number;
  /** Charges patronales (%) et brut horaire d'une embauche (€) */
  chg: number; brutH: number;
  /** Achats matières et autres charges variables, en % du CA HT */
  ach: number; variables: number;
  /** Direction, loyer, autres charges fixes, en € par mois */
  dir: number; loyer: number; fixes: number;
};
export type Personne = { id: string; nom: string; poste: string; contrat: string; heures: number; brut: number; actif: boolean; ajout: boolean; extra: boolean; note?: string };

/** Heures payées par semaine : au-delà de 35 h, majoration de 10 % (HCR, 36e à 39e heure) */
export const heuresPayees = (h: number) => (h > 35 ? 35 + (h - 35) * 1.1 : h);
/** Brut mensuel d'une embauche à ce brut horaire */
export const brutMensuel = (heures: number, brutH: number) => (heuresPayees(heures) * 52) / 12 * brutH;

export function personneAjoutee(type: "35" | "39" | "extra", n: number, brutH: number): Personne {
  if (type === "extra") return { id: `a${n}`, nom: `Extra n° ${n}`, poste: "à définir", contrat: "10 h / semaine", heures: 10, brut: (10 * 52) / 12 * brutH, actif: true, ajout: true, extra: true };
  const h = Number(type);
  return { id: `a${n}`, nom: `Embauche n° ${n}`, poste: "à définir", contrat: `CDI ${h} h`, heures: h, brut: brutMensuel(h, brutH), actif: true, ajout: true, extra: false };
}

export const masseSalariale = (equipe: Personne[], chg: number) => equipe.filter((e) => e.actif).reduce((t, e) => t + e.brut * (1 + chg / 100), 0);
export const heuresEquipe = (equipe: Personne[]) => equipe.filter((e) => e.actif).reduce((t, e) => t + e.heures, 0);

export type Resultat = {
  caHt: number; couverts: number; achats: number; variables: number; ms: number; ebe: number; seuil: number; invest: number;
  lignes: [string, number, boolean?][];
};

export function calculerSimulation(v: EntreesSimulateur, equipe: Personne[], r: Pick<Reglages, "ttcHt" | "emprunts" | "tauxIs">): Resultat {
  const ms = masseSalariale(equipe, v.chg);
  const semaine = v.cm * v.tm * v.nm + v.cs * v.ts * v.ns;
  const caHt = (semaine * 52) / 12 / r.ttcHt;
  const couverts = ((v.cm * v.nm + v.cs * v.ns) * 52) / 12;
  const achats = (caHt * v.ach) / 100, variables = (caHt * v.variables) / 100;
  const fixes = ms + v.dir + v.loyer + v.fixes;
  const ebe = caHt - achats - variables - fixes;
  const tauxVariable = (v.ach + v.variables) / 100;
  const seuil = tauxVariable < 1 ? fixes / (1 - tauxVariable) : 0;
  const is = Math.max(0, ebe) * (r.tauxIs / 100);
  const invest = ebe - r.emprunts - is;
  const actifs = equipe.filter((e) => e.actif).length;
  const lignes: [string, number, boolean?][] = [
    ["Chiffre d'affaires HT", caHt, true], ["Achats matières", -achats], ["Autres charges variables (CB, produits d'entretien)", -variables],
    [`Masse salariale (${actifs} personne${actifs > 1 ? "s" : ""}, ${Math.round(heuresEquipe(equipe))} h / semaine)`, -ms], ["Direction (holding)", -v.dir], ["Loyer", -v.loyer], ["Autres charges fixes", -v.fixes],
    ["EBE", ebe, true], ["Emprunts (intérêts et capital)", -r.emprunts], ["Impôt sur les sociétés", -is], ["Capacité d'investissement", invest, true],
  ];
  return { caHt, couverts, achats, variables, ms, ebe, seuil, invest, lignes };
}

/** Hypothèses de départ : l'activité des services type et les charges réelles des derniers mois clos */
export function entreesParDefaut(types: ServiceType[], moisClos: { ca_ht: number; postes: Record<string, number> }[], r: Reglages): EntreesSimulateur {
  // Sans midi ni soir (journaux Kezia), la journée entière tient lieu de service unique, côté midi
  const journee = types.filter((t) => t.svc === "journee");
  const midi = [...types.filter((t) => t.svc === "midi"), ...journee], soir = types.filter((t) => t.svc === "soir");
  const moy = (l: ServiceType[], f: (t: ServiceType) => number) => (l.length ? l.reduce((a, t) => a + f(t), 0) / l.length : 0);
  const ca = moisClos.reduce((t, m) => t + m.ca_ht, 0);
  const somme = (cle: string) => moisClos.reduce((t, m) => t + montantPoste(POSTES_BUDGET.find((p) => p.cle === cle)!, m.postes), 0);
  const ratio = (cle: string, defaut: number) => (ca > 0 ? (somme(cle) / ca) * 100 : defaut);
  const parMois = (cle: string, defaut: number) => (moisClos.length ? somme(cle) / moisClos.length : defaut);
  return {
    cm: Math.round(moy(midi, (t) => t.couverts)), tm: Math.round(moy(midi, (t) => t.tmTtc)), nm: midi.length,
    cs: Math.round(moy(soir, (t) => t.couverts)), ts: Math.round(moy(soir, (t) => t.tmTtc)), ns: soir.length,
    chg: 42, brutH: 12.7,
    ach: Math.round(ratio("achats_matieres", r.objectifs.achats_matieres) * 10) / 10,
    variables: Math.round((ratio("entretien", 2.5) + ratio("autres_charges", 4)) * 10) / 10,
    dir: Math.round(parMois("remuneration_gerants", r.objectifs.remuneration_gerants)),
    loyer: Math.round(parMois("loyer", r.objectifs.loyer)),
    fixes: Math.round(parMois("energie", 1000)),
  };
}

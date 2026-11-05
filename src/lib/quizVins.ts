/**
 * Quiz vins (05/11/2026, demande de Paul) : les questions sont fabriquées à partir des fiches de la Cave,
 * rien à saisir. Choix multiple, 4 réponses, les mauvaises prises dans les autres vins (de la même couleur de
 * préférence). Logique pure, testée : le tirage reçoit sa source d'aléa.
 */
export type VinQuiz = {
  id: string; nom: string; couleur: string;
  cepages: string | null; region: string | null; appellation: string | null; domaine: string | null;
  bouche: string | null; pitch: string | null;
  prix: { v?: number | null; b?: number | null } | null;
  accords: string[];
};
export type TypeQuestion = "cepages" | "region" | "domaine" | "appellation" | "accord_plat" | "accord_vin" | "prix_bouteille" | "bouche";
export type Question = {
  type: TypeQuestion; vin_id: string; vin_nom: string;
  question: string; options: string[]; bonne: number;
  /** Ce qu'on dit à la table : affiché après la réponse */
  explication: string;
};
export type QuestionRepondue = Question & { reponse: number | null };

const COULEURS: Record<string, string> = { rouge: "rouge", blanc: "blanc", rose: "rosé", bulles: "bulles", doux: "doux", champagne: "champagne" };
const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
const propre = (s: string | null | undefined) => (s ?? "").trim();

function melanger<T>(liste: T[], alea: () => number): T[] {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** 3 distracteurs distincts, différents de la bonne réponse, pris d'abord chez les vins de la même couleur */
function distracteurs(vins: VinQuiz[], vin: VinQuiz, champ: (v: VinQuiz) => string, bonne: string, alea: () => number): string[] {
  const vus = new Set<string>([bonne.toLowerCase()]);
  const prendre = (source: VinQuiz[]) => {
    const out: string[] = [];
    for (const v of melanger(source, alea)) {
      const x = propre(champ(v));
      if (!x || vus.has(x.toLowerCase())) continue;
      vus.add(x.toLowerCase()); out.push(x);
    }
    return out;
  };
  const memeCouleur = prendre(vins.filter((v) => v.id !== vin.id && v.couleur === vin.couleur));
  const autres = memeCouleur.length >= 3 ? [] : prendre(vins.filter((v) => v.id !== vin.id && v.couleur !== vin.couleur));
  return [...memeCouleur, ...autres].slice(0, 3);
}
function assembler(type: TypeQuestion, vin: VinQuiz, question: string, bonne: string, faux: string[], explication: string, alea: () => number): Question | null {
  if (faux.length < 3) return null;
  const options = melanger([bonne, ...faux], alea);
  return { type, vin_id: vin.id, vin_nom: vin.nom, question, options, bonne: options.indexOf(bonne), explication };
}
const pitchDe = (v: VinQuiz) => propre(v.pitch) || [propre(v.cepages), propre(v.region)].filter(Boolean).join(" · ");

/** Toutes les questions possibles pour un vin */
export function questionsPourVin(vin: VinQuiz, vins: VinQuiz[], alea: () => number): Question[] {
  const out: Question[] = [];
  const le = `le ${vin.nom}`;
  const pousser = (q: Question | null) => { if (q) out.push(q); };
  if (propre(vin.cepages)) pousser(assembler("cepages", vin, `Quels cépages pour ${le} ?`, propre(vin.cepages), distracteurs(vins, vin, (v) => v.cepages ?? "", propre(vin.cepages), alea), pitchDe(vin), alea));
  if (propre(vin.region)) pousser(assembler("region", vin, `D'où vient ${le} ?`, propre(vin.region), distracteurs(vins, vin, (v) => v.region ?? "", propre(vin.region), alea), pitchDe(vin), alea));
  if (propre(vin.domaine)) pousser(assembler("domaine", vin, `Quel domaine produit ${le} ?`, propre(vin.domaine), distracteurs(vins, vin, (v) => v.domaine ?? "", propre(vin.domaine), alea), pitchDe(vin), alea));
  if (propre(vin.appellation)) pousser(assembler("appellation", vin, `Quelle appellation pour ${le} ?`, propre(vin.appellation), distracteurs(vins, vin, (v) => v.appellation ?? "", propre(vin.appellation), alea), pitchDe(vin), alea));
  const b = vin.prix?.b;
  if (b != null && b > 0) {
    const faux = distracteurs(vins, vin, (v) => (v.prix?.b != null && v.prix.b > 0 ? eur(v.prix.b) : ""), eur(b), alea);
    pousser(assembler("prix_bouteille", vin, `À quel prix la bouteille de ${vin.nom} ?`, eur(b), faux, `${vin.nom} : ${eur(b)} la bouteille${vin.prix?.v ? `, ${eur(vin.prix.v)} le verre` : ""}.`, alea));
  }
  if (propre(vin.bouche)) {
    const faux = distracteurs(vins, vin, (v) => v.nom, vin.nom, alea);
    pousser(assembler("bouche", vin, `Quel vin a cette bouche : « ${propre(vin.bouche)} » ?`, vin.nom, faux, pitchDe(vin), alea));
  }
  if (vin.accords.length) {
    const plat = melanger(vin.accords, alea)[0];
    // Quel vin pour ce plat : les vins qui n'ont pas cet accord
    const fauxVins = distracteurs(vins.filter((v) => !v.accords.some((a) => a.toLowerCase() === plat.toLowerCase())), vin, (v) => v.nom, vin.nom, alea);
    pousser(assembler("accord_plat", vin, `Quel vin conseiller avec ${plat} ?`, vin.nom, fauxVins, `${vin.nom} avec ${plat}. ${pitchDe(vin)}`, alea));
    // Quel plat pour ce vin : des plats d'autres vins, pas dans ses accords
    const platsAutres = [...new Set(vins.flatMap((v) => v.accords))].filter((p) => !vin.accords.some((a) => a.toLowerCase() === p.toLowerCase()));
    const fauxPlats = melanger(platsAutres, alea).slice(0, 3);
    pousser(assembler("accord_vin", vin, `Avec quel plat proposer ${le} ?`, plat, fauxPlats, `${vin.nom} accompagne ${vin.accords.join(", ")}.`, alea));
  }
  return out;
}

/** Un quiz de n questions : un vin différent par question tant que possible, des types variés */
export function genererQuiz(vins: VinQuiz[], n: number, alea: () => number = Math.random): Question[] {
  const carte = vins.filter((v) => propre(v.nom));
  if (carte.length < 4) return [];
  const sortie: Question[] = [];
  const typesVus = new Map<TypeQuestion, number>();
  let tour = 0;
  while (sortie.length < n && tour < 3) {
    for (const vin of melanger(carte, alea)) {
      if (sortie.length >= n) break;
      const possibles = questionsPourVin(vin, carte, alea).filter((q) => !sortie.some((s) => s.vin_id === q.vin_id && s.type === q.type));
      if (!possibles.length) continue;
      // Le type le moins posé d'abord, pour varier
      possibles.sort((a, b) => (typesVus.get(a.type) ?? 0) - (typesVus.get(b.type) ?? 0) || alea() - 0.5);
      const q = possibles[0];
      typesVus.set(q.type, (typesVus.get(q.type) ?? 0) + 1);
      sortie.push(q);
    }
    tour++;
  }
  return sortie;
}

export const libelleCouleur = (c: string) => COULEURS[c] ?? c;

/** Score d'une série répondue */
export function score(questions: QuestionRepondue[]): number {
  return questions.filter((q) => q.reponse != null && q.reponse === q.bonne).length;
}

/** Résumé pour les responsables : par personne, et les vins les plus ratés */
export type SessionQuiz = { employe_nom: string; score: number; nb_questions: number; created_at: string; questions: QuestionRepondue[] };
export function resumeEquipe(sessions: SessionQuiz[]) {
  const parPersonne = new Map<string, { nom: string; sessions: number; dernier: number; dernierSur: number; meilleur: number; total: number; totalSur: number; derniereDate: string }>();
  const rates = new Map<string, { vin: string; rates: number; posees: number }>();
  for (const s of [...sessions].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const p = parPersonne.get(s.employe_nom) ?? { nom: s.employe_nom, sessions: 0, dernier: 0, dernierSur: 0, meilleur: 0, total: 0, totalSur: 0, derniereDate: s.created_at };
    p.sessions++; p.dernier = s.score; p.dernierSur = s.nb_questions; p.meilleur = Math.max(p.meilleur, s.nb_questions ? Math.round((s.score / s.nb_questions) * 100) : 0);
    p.total += s.score; p.totalSur += s.nb_questions; p.derniereDate = s.created_at;
    parPersonne.set(s.employe_nom, p);
    for (const q of s.questions) {
      const r = rates.get(q.vin_nom) ?? { vin: q.vin_nom, rates: 0, posees: 0 };
      r.posees++; if (q.reponse !== q.bonne) r.rates++;
      rates.set(q.vin_nom, r);
    }
  }
  return {
    personnes: [...parPersonne.values()].sort((a, b) => b.derniereDate.localeCompare(a.derniereDate)),
    vinsRates: [...rates.values()].filter((r) => r.rates > 0).sort((a, b) => b.rates / b.posees - a.rates / a.posees || b.rates - a.rates).slice(0, 8),
  };
}

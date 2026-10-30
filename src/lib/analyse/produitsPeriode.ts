/**
 * Par produit (30/10/2026) : à partir des ventes agrégées (jour × service × catégorie × produit), la tendance
 * par jour, semaine ou mois selon la longueur de la période, par catégorie ; et le midi / soir par catégorie
 * et par produit. Logique pure, testée.
 */
export type LigneAgregee = { date_service: string; service: string; categorie: string; description: string; qty: number | string; ht: number | string; ttc: number | string };
export type Pas = "jour" | "semaine" | "mois";
export type ProduitsPeriode = {
  pas: Pas;
  cles: string[];
  etiquettes: string[];
  /** Par produit : service et séries par période (le client regroupe selon les catégories affichées) */
  produits: Record<string, { cat: string; midi_qty: number; soir_qty: number; qty: number[]; ht: number[] }>;
};

const estMessage = (cat: string) => /^messages?$/i.test(cat.trim());
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function pasPour(from: string, to: string): Pas {
  const jours = Math.round((new Date(to + "T12:00:00").getTime() - new Date(from + "T12:00:00").getTime()) / 86400000) + 1;
  return jours <= 31 ? "jour" : jours <= 140 ? "semaine" : "mois";
}

/** Clé de regroupement d'une date : le jour, le lundi de la semaine, ou le mois */
export function cleBucket(dateIso: string, pas: Pas): string {
  if (pas === "jour") return dateIso;
  if (pas === "mois") return dateIso.slice(0, 7);
  const d = new Date(dateIso + "T12:00:00");
  const dow = d.getDay() || 7;
  d.setDate(d.getDate() - dow + 1);
  return iso(d);
}

export function etiquetteBucket(cle: string, pas: Pas): string {
  if (pas === "mois") return new Date(cle + "-15T12:00:00").toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
  const d = new Date(cle + "T12:00:00");
  if (pas === "jour") return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }).replace(".", "");
  return `sem. ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "")}`;
}

/** Toutes les clés entre from et to, même sans vente (le graphique garde les jours fermés à zéro) */
export function clesEntre(from: string, to: string, pas: Pas): string[] {
  const out: string[] = [];
  const d = new Date(from + "T12:00:00"), fin = new Date(to + "T12:00:00");
  const vues = new Set<string>();
  while (d <= fin) {
    const k = cleBucket(iso(d), pas);
    if (!vues.has(k)) { vues.add(k); out.push(k); }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export type DetailProduit = {
  nom: string; cat: string; qty: number; ht: number; midi_qty: number; soir_qty: number;
  /** Jours de service où le produit s'est vendu / jours ouverts de la période */
  jours_vendu: number; jours_ouverts: number;
  tendance: { cles: string[]; etiquettes: string[]; midi: number[]; soir: number[] };
  /** Par jour de semaine (lundi → dimanche) : quantité midi et soir */
  semaine: { jour: string; midi: number; soir: number }[];
};

/** Zoom sur un produit (30/10/2026) : combien, quand (jour, semaine ou mois), à quel service, quel jour de la semaine */
export function detailProduit(lignes: LigneAgregee[], from: string, to: string, nom: string): DetailProduit | null {
  const pas = pasPour(from, to);
  const cles = clesEntre(from, to, pas);
  const index = new Map(cles.map((k, i) => [k, i]));
  const midi = cles.map(() => 0), soir = cles.map(() => 0);
  const semaine = JOURS_SEMAINE.map((jour) => ({ jour, midi: 0, soir: 0 }));
  const joursOuverts = new Set<string>(), joursVendu = new Set<string>();
  let cat = "", qty = 0, ht = 0, midiQ = 0, soirQ = 0;
  for (const l of lignes) {
    if (estMessage((l.categorie || "").trim())) continue;
    joursOuverts.add(l.date_service);
    if (l.description !== nom) continue;
    cat ||= (l.categorie || "Autre").trim();
    const q = Number(l.qty) || 0, h = Number(l.ht) || 0;
    const estMidi = (l.service ?? "midi").toLowerCase() === "midi";
    qty += q; ht += h; if (estMidi) midiQ += q; else soirQ += q;
    joursVendu.add(l.date_service);
    const i = index.get(cleBucket(l.date_service, pas));
    if (i != null) (estMidi ? midi : soir)[i] += q;
    const dow = (new Date(l.date_service + "T12:00:00").getDay() + 6) % 7;
    if (estMidi) semaine[dow].midi += q; else semaine[dow].soir += q;
  }
  if (!cat) return null;
  return { nom, cat, qty, ht, midi_qty: midiQ, soir_qty: soirQ, jours_vendu: joursVendu.size, jours_ouverts: joursOuverts.size, tendance: { cles, etiquettes: cles.map((k) => etiquetteBucket(k, pas)), midi, soir }, semaine };
}

const JOURS_SEMAINE = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export function construireProduitsPeriode(lignes: LigneAgregee[], from: string, to: string): ProduitsPeriode {
  const pas = pasPour(from, to);
  const cles = clesEntre(from, to, pas);
  const index = new Map(cles.map((k, i) => [k, i]));
  const produits: ProduitsPeriode["produits"] = {};
  for (const l of lignes) {
    const cat = (l.categorie || "Autre").trim();
    if (estMessage(cat)) continue;
    const q = Number(l.qty) || 0, h = Number(l.ht) || 0;
    const midi = (l.service ?? "midi").toLowerCase() === "midi";
    const p = produits[l.description] ?? { cat, midi_qty: 0, soir_qty: 0, qty: cles.map(() => 0), ht: cles.map(() => 0) };
    if (midi) p.midi_qty += q; else p.soir_qty += q;
    const i = index.get(cleBucket(l.date_service, pas));
    if (i != null) { p.qty[i] += q; p.ht[i] += h; }
    produits[l.description] = p;
  }
  return { pas, cles, etiquettes: cles.map((k) => etiquetteBucket(k, pas)), produits };
}

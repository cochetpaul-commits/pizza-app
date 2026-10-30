/**
 * Par produit (30/10/2026) : à partir des ventes agrégées (jour × service × catégorie × produit), la tendance
 * par jour, semaine ou mois selon la longueur de la période, par catégorie ; et le midi / soir par catégorie
 * et par produit. Logique pure, testée.
 */
export type LigneAgregee = { date_service: string; service: string; categorie: string; description: string; qty: number | string; ht: number | string; ttc: number | string };
export type Pas = "jour" | "semaine" | "mois";
export type ProduitsPeriode = {
  pas: Pas;
  tendance: { cles: string[]; etiquettes: string[]; categories: string[]; qty: Record<string, number[]>; ht: Record<string, number[]> };
  categories: { cat: string; midi_qty: number; soir_qty: number; midi_ht: number; soir_ht: number }[];
  produits: Record<string, { cat: string; midi_qty: number; soir_qty: number }>;
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

export function construireProduitsPeriode(lignes: LigneAgregee[], from: string, to: string): ProduitsPeriode {
  const pas = pasPour(from, to);
  const cles = clesEntre(from, to, pas);
  const index = new Map(cles.map((k, i) => [k, i]));
  const qty: Record<string, number[]> = {}, ht: Record<string, number[]> = {};
  const cats = new Map<string, { cat: string; midi_qty: number; soir_qty: number; midi_ht: number; soir_ht: number }>();
  const produits: ProduitsPeriode["produits"] = {};
  for (const l of lignes) {
    const cat = (l.categorie || "Autre").trim();
    if (estMessage(cat)) continue;
    const q = Number(l.qty) || 0, h = Number(l.ht) || 0;
    const i = index.get(cleBucket(l.date_service, pas));
    if (i != null) {
      (qty[cat] ??= cles.map(() => 0))[i] += q;
      (ht[cat] ??= cles.map(() => 0))[i] += h;
    }
    const midi = (l.service ?? "midi").toLowerCase() === "midi";
    const c = cats.get(cat) ?? { cat, midi_qty: 0, soir_qty: 0, midi_ht: 0, soir_ht: 0 };
    if (midi) { c.midi_qty += q; c.midi_ht += h; } else { c.soir_qty += q; c.soir_ht += h; }
    cats.set(cat, c);
    const p = produits[l.description] ?? { cat, midi_qty: 0, soir_qty: 0 };
    if (midi) p.midi_qty += q; else p.soir_qty += q;
    produits[l.description] = p;
  }
  const categories = [...cats.keys()].sort((a, b) => a.localeCompare(b, "fr"));
  return {
    pas,
    tendance: { cles, etiquettes: cles.map((k) => etiquetteBucket(k, pas)), categories, qty, ht },
    categories: categories.map((k) => cats.get(k)!),
    produits,
  };
}

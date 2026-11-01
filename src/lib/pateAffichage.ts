import type { Phase, PateResult } from "@/lib/pateEngine";

/**
 * Lignes de pesée d'une phase d'empâtement (01/11/2026) : partagées par l'écran Empâtements, les étiquettes
 * de mise en place et les PDF. Les farines sont nommées une par une, l'eau du pétrissage se sépare en eau de
 * départ (avec le miel dissous) et eau de bassinage, la levure n'apparaît que là où elle va.
 */
export type LignePesee = { libelle: string; grammes: number; /** levure : au dixième de gramme sous 100 g */ precis?: boolean; note?: string };

/** « FARINE TIPO 0 'SOFFIO 25 KG » → « Tipo 0 Soffio » : le nom du sac tronquait sur mobile */
export function nomFarine(s: string): string {
  const court = s.replace(/["'«»]/g, "").replace(/\b\d+\s*kg\b/i, "").replace(/^farine\s+/i, "").replace(/\s+/g, " ").trim();
  return (court || s).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export function nomPhase(ph: Phase, nbPhases: number): string {
  if (ph.kind === "biga") return "Biga";
  if (ph.kind === "final") return "Pâte finale";
  return nbPhases > 1 ? ph.name : "Pesée";
}

export function lignesPesee(ph: Phase): LignePesee[] {
  const lignes: LignePesee[] = [];
  const farines = ph.flours.length ? ph.flours : [{ name: "Farine", grams: ph.flour_g, percent: 100 }];
  for (const f of farines) lignes.push({ libelle: nomFarine(f.name), grammes: f.grams });
  if (ph.kind === "biga") {
    lignes.push({ libelle: "Eau", grammes: ph.water_g });
    if (ph.yeast_g > 0) lignes.push({ libelle: "Levure fraîche", grammes: ph.yeast_g, precis: true });
    return lignes;
  }
  const bassinage = ph.water_bassinage_g ?? 0;
  if (bassinage > 0 && ph.water_start_g != null) {
    lignes.push({ libelle: "Eau de départ", grammes: ph.water_start_g, note: ph.honey_g > 0 ? "avec le miel" : undefined });
    lignes.push({ libelle: "Eau de bassinage", grammes: bassinage });
  } else {
    lignes.push({ libelle: "Eau", grammes: ph.water_g });
  }
  if (ph.salt_g > 0) lignes.push({ libelle: "Sel", grammes: ph.salt_g });
  if (ph.honey_g > 0) lignes.push({ libelle: "Miel", grammes: ph.honey_g, note: bassinage > 0 ? "dans l'eau de départ" : undefined });
  if (ph.oil_g > 0) lignes.push({ libelle: "Huile", grammes: ph.oil_g });
  if (ph.yeast_g > 0) lignes.push({ libelle: "Levure fraîche", grammes: ph.yeast_g, precis: true });
  return lignes;
}

/** Grammes en français ; l'espace fine des milliers devient une espace simple (les polices des PDF ne l'ont pas) */
export const formatG = (gr: number, precis?: boolean) =>
  `${(precis && gr < 100 ? Math.round(gr * 10) / 10 : Math.round(gr)).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} g`;

/** Texte « pâton 260 g, calculé à 264 g » */
export function textePaton(r: PateResult): string {
  const s = r.summary;
  return s.poidsCalcule_g !== s.poidsPaton_g ? `pâton ${s.poidsPaton_g} g, calculé à ${s.poidsCalcule_g} g` : `pâton ${s.poidsPaton_g} g`;
}

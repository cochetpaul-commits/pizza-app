/**
 * Valorisation d'un inventaire : coût HT d'UNE unité comptée (règles pures, sans accès base).
 *
 * Une ligne est comptée dans une unité (« kg », « litre », « pièce », « bouteille », « pot »… ; pour un
 * colis de N éléments, le total est en éléments). Le prix d'achat vient de la dernière offre du produit
 * (active, sinon la dernière fermée : dernier prix connu), sinon du prix d'achat de la fiche.
 * Le prix est ramené dans l'unité comptée grâce au poids ou au volume d'une pièce (fiche ou offre) :
 *  - compté au kg / litre, prix à la pièce  : prix ÷ (poids ou volume d'une pièce) ;
 *  - compté à la pièce, prix au kg / litre  : prix × poids (ou volume) d'une pièce ;
 *  - sinon la conversion est impossible → coût inconnu (null), jamais un prix faux.
 */
import { offerRowToCpu, enrichCpuWithConversions, type CpuByUnit } from "@/lib/offerPricing";

export type FicheValo = {
  purchase_price?: number | null; purchase_unit?: number | null; purchase_unit_label?: string | null;
  piece_weight_g?: number | null; piece_volume_ml?: number | null; density_g_per_ml?: number | null;
};
export type OffreValo = Record<string, unknown> & { is_active?: boolean | null; valid_from?: string | null; created_at?: string | null; valid_to?: string | null };

export type Valorisation = { cout: number | null; source: "offre" | "ancienne_offre" | "fiche" | null; raison?: string };

const n = (v: unknown) => { const x = typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Unité comptée → famille de conversion */
export function familleUnite(unite: string | null | undefined): "kg" | "l" | "pc" {
  const u = norm(unite);
  if (u === "kg" || u === "kilo" || u === "kilos") return "kg";
  if (u === "l" || u === "litre" || u === "litres") return "l";
  return "pc";
}

/** Dernière offre : active d'abord (la plus récente), sinon la dernière fermée */
export function choisirOffre(offres: OffreValo[]): { offre: OffreValo | null; ancienne: boolean } {
  const date = (o: OffreValo) => String(o.valid_from ?? o.created_at ?? "");
  const actives = offres.filter((o) => o.is_active && n(o.unit_price) + n(o.pack_price) > 0).sort((a, b) => date(b).localeCompare(date(a)));
  if (actives[0]) return { offre: actives[0], ancienne: false };
  const fermees = offres.filter((o) => n(o.unit_price) + n(o.pack_price) > 0).sort((a, b) => date(b).localeCompare(date(a)));
  return { offre: fermees[0] ?? null, ancienne: !!fermees[0] };
}

/** Prix par g / ml / pièce depuis la fiche (prix d'achat saisi) */
function cpuFiche(f: FicheValo): CpuByUnit {
  const p = n(f.purchase_price), q = n(f.purchase_unit) || 1, label = norm(f.purchase_unit_label);
  if (!(p > 0)) return {};
  const parUnite = p / q;
  let cpu: CpuByUnit = {};
  if (label === "kg") cpu = { g: parUnite / 1000 };
  else if (label === "g") cpu = { g: parUnite };
  else if (label === "l" || label === "litre") cpu = { ml: parUnite / 1000 };
  else if (label === "ml") cpu = { ml: parUnite };
  else cpu = { pcs: parUnite }; // pièce, bouteille, paquet, sachet…
  return enrichCpuWithConversions({ piece_weight_g: f.piece_weight_g, density_kg_per_l: f.density_g_per_ml }, cpu);
}

/** Coût HT d'une unité comptée */
export function coutUniteComptee(unite: string | null | undefined, fiche: FicheValo, offres: OffreValo[]): Valorisation {
  const { offre, ancienne } = choisirOffre(offres);
  let cpu: CpuByUnit = {};
  let source: Valorisation["source"] = null;
  if (offre) {
    cpu = offerRowToCpu({ ...offre, piece_weight_g: n(offre.piece_weight_g) > 0 ? offre.piece_weight_g : fiche.piece_weight_g, density_kg_per_l: n(offre.density_kg_per_l) > 0 ? offre.density_kg_per_l : fiche.density_g_per_ml });
    source = ancienne ? "ancienne_offre" : "offre";
  }
  if (!cpu.g && !cpu.ml && !cpu.pcs) { cpu = cpuFiche(fiche); source = cpu.g || cpu.ml || cpu.pcs ? "fiche" : null; }
  if (!source) return { cout: null, source: null, raison: "aucun prix" };

  const poidsG = n(fiche.piece_weight_g), volMl = n(fiche.piece_volume_ml);
  const fam = familleUnite(unite);
  const arrondi = (x: number) => Math.round(x * 10000) / 10000;
  if (fam === "kg") {
    if (cpu.g) return { cout: arrondi(cpu.g * 1000), source };
    if (cpu.ml && n(fiche.density_g_per_ml) > 0) return { cout: arrondi((cpu.ml / n(fiche.density_g_per_ml)) * 1000), source };
    if (cpu.pcs && poidsG > 0) return { cout: arrondi((cpu.pcs / poidsG) * 1000), source };
    return { cout: null, source, raison: "prix à la pièce, poids d'une pièce inconnu" };
  }
  if (fam === "l") {
    if (cpu.ml) return { cout: arrondi(cpu.ml * 1000), source };
    if (cpu.g && n(fiche.density_g_per_ml) > 0) return { cout: arrondi(cpu.g * n(fiche.density_g_per_ml) * 1000), source };
    if (cpu.pcs && volMl > 0) return { cout: arrondi((cpu.pcs / volMl) * 1000), source };
    return { cout: null, source, raison: "prix à la pièce, volume d'une pièce inconnu" };
  }
  // compté à la pièce (bouteille, pot, colis de 1, élément d'un colis…)
  if (cpu.pcs) return { cout: arrondi(cpu.pcs), source };
  if (cpu.g && poidsG > 0) return { cout: arrondi(cpu.g * poidsG), source };
  if (cpu.ml && volMl > 0) return { cout: arrondi(cpu.ml * volMl), source };
  if (cpu.g && volMl > 0 && n(fiche.density_g_per_ml) > 0) return { cout: arrondi(cpu.g * volMl * n(fiche.density_g_per_ml)), source };
  return { cout: null, source, raison: cpu.g ? "prix au kg, poids d'une pièce inconnu" : "prix au litre, volume d'une pièce inconnu" };
}

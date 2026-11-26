import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toutesLesPages } from "@/lib/supabaseChunks";
import { construireMercuriale, estParPiece } from "@/lib/fiche/mercuriale";
import { recalculerFiche, type CoutsFiche, type FicheBrute, type LigneBrute } from "@/lib/fiche/recalcul";
import type { IngredientRef } from "@/components/fiche/ficheTypes";

/**
 * Recalcul des coûts de toutes les fiches (25/11/2026) avec les prix du jour et la règle de la fiche ouverte.
 * Utilisé par le bouton « Recalculer les coûts » (aperçu puis application) et la tâche de nuit (26/11/2026).
 * Les recettes maison utilisées comme ingrédient sont recalculées en plusieurs passes : leur nouveau prix
 * au kilo se répercute sur les fiches qui les utilisent.
 * Une fiche dont le nouveau coût tombe à zéro alors qu'elle en avait un n'est pas touchée (ingrédients sans prix).
 */
type Rec = FicheBrute & { name: string; establishments: string[] | null; total_cost: number | null; cost_per_kg: number | null; yield_grams: number | null; output_ingredient_id: string | null };
type Ligne = LigneBrute & { recipe_id: string };
export type Changement = { id: string; nom: string; etablissements: string[]; avant: { total: number | null; poids: number | null; kg: number | null }; apres: { total: number; poids: number; kg: number | null }; ecart_pct: number | null; ignoree: boolean };

export async function calculerRecalcul() {
  const [ings, offres, recs, lignes] = await Promise.all([
    toutesLesPages<Record<string, unknown>>((de, a) => supabaseAdmin.from("ingredients").select("id, name, category, allergens, cost_per_unit, cost_per_kg, purchase_price, purchase_unit, purchase_unit_label, density_g_per_ml, piece_weight_g, piece_volume_ml, establishments, source").order("id").range(de, a)),
    toutesLesPages<Record<string, unknown>>((de, a) => supabaseAdmin.from("v_latest_offers").select("*").order("ingredient_id").order("supplier_id").range(de, a)),
    toutesLesPages<Rec>((de, a) => supabaseAdmin.from("kitchen_recipes").select("id, name, category, portions_count, ball_weight_g, cooked_weight_g, sell_price, establishments, total_cost, cost_per_kg, yield_grams, output_ingredient_id").eq("is_active", true).order("id").range(de, a)),
    toutesLesPages<Ligne>((de, a) => supabaseAdmin.from("kitchen_recipe_lines").select("recipe_id, ingredient_id, qty, unit").order("id").range(de, a)),
  ]);
  const erreur = [ings, offres, recs, lignes].find((r) => r.error)?.error;
  if (erreur) throw new Error(erreur.message);

  const lignesPar = new Map<string, Ligne[]>();
  for (const l of lignes.data) { const t = lignesPar.get(l.recipe_id) ?? []; t.push(l); lignesPar.set(l.recipe_id, t); }
  const ingList = ings.data.map((i) => ({ ...i }));
  const ingParId = new Map(ingList.map((i) => [String(i.id), i]));

  let couts = new Map<string, CoutsFiche>();
  for (let passe = 0; passe < 4; passe++) {
    const { mercs } = construireMercuriale(ingList, offres.data);
    const parId = new Map<string, IngredientRef>(mercs.map((m) => [m.id, m]));
    couts = new Map(recs.data.map((r) => [r.id, recalculerFiche(r, lignesPar.get(r.id) ?? [], parId)]));
    // Prix des recettes maison pour la passe suivante (même règle que l'enregistrement de la fiche)
    let bouge = false;
    for (const r of recs.data) {
      const ing = r.output_ingredient_id ? ingParId.get(r.output_ingredient_id) : undefined;
      const c = couts.get(r.id);
      if (!ing || ing.source !== "recette_maison" || !c) continue;
      const prix = estParPiece(ing.purchase_unit_label) ? (c.cost_per_portion > 0 ? Math.round(c.cost_per_portion * 10000) / 10000 : null) : c.cost_per_kg;
      if (prix != null && prix > 0 && Math.abs((Number(ing.purchase_price) || 0) - prix) > 0.005) { ing.purchase_price = prix; ing.purchase_unit = 1; bouge = true; }
    }
    if (!bouge) break;
  }

  const changements: Changement[] = [];
  for (const r of recs.data) {
    const c = couts.get(r.id)!;
    const avantTotal = r.total_cost != null ? Number(r.total_cost) : null;
    const ignoree = !(c.total_cost > 0) && (avantTotal ?? 0) > 0;
    const memeTotal = avantTotal != null && Math.abs(avantTotal - c.total_cost) < 0.01;
    const memePoids = Number(r.yield_grams ?? 0) === c.yield_grams;
    const memeKg = Math.abs(Number(r.cost_per_kg ?? 0) - (c.cost_per_kg ?? 0)) < 0.01;
    if (memeTotal && memePoids && memeKg) continue;
    changements.push({
      id: r.id, nom: r.name, etablissements: r.establishments ?? [],
      avant: { total: avantTotal, poids: r.yield_grams != null ? Number(r.yield_grams) : null, kg: r.cost_per_kg != null ? Number(r.cost_per_kg) : null },
      apres: { total: c.total_cost, poids: c.yield_grams, kg: c.cost_per_kg },
      ecart_pct: avantTotal && avantTotal > 0 ? Math.round(((c.total_cost - avantTotal) / avantTotal) * 1000) / 10 : null,
      ignoree,
    });
  }
  changements.sort((a, b) => Math.abs(b.ecart_pct ?? 0) - Math.abs(a.ecart_pct ?? 0) || a.nom.localeCompare(b.nom, "fr"));
  const sorties = recs.data.filter((r) => r.output_ingredient_id).map((r) => ({ ingId: r.output_ingredient_id!, prix: ingParId.get(r.output_ingredient_id!)?.purchase_price, source: ingParId.get(r.output_ingredient_id!)?.source }));
  return { recs: recs.data, couts, changements, sorties, nbFiches: recs.data.length };
}


export async function appliquerRecalcul(): Promise<{ ecrites: number; ignorees: number; ingredients: number; echecs: string[] }> {
  const { recs, couts, changements, sorties } = await calculerRecalcul();
  const aEcrire = changements.filter((c) => !c.ignoree);
  let ecrites = 0;
  const echecs: string[] = [];
  for (const ch of aEcrire) {
    const r = recs.find((x) => x.id === ch.id)!;
    const c = couts.get(ch.id)!;
    const maj: Record<string, unknown> = { total_cost: c.total_cost, cost_per_portion: c.cost_per_portion, yield_grams: c.yield_grams, cost_per_kg: c.cost_per_kg };
    if (c.margin_rate != null && Number(r.sell_price) > 0) maj.margin_rate = c.margin_rate;
    const { error } = await supabaseAdmin.from("kitchen_recipes").update(maj).eq("id", ch.id);
    if (error) echecs.push(`${ch.nom} : ${error.message}`); else ecrites++;
  }
  // Prix au kilo (ou à la pièce) des recettes maison utilisées comme ingrédient
  let ingredients = 0;
  for (const s of sorties) {
    if (s.source !== "recette_maison" || !(Number(s.prix) > 0)) continue;
    const { error } = await supabaseAdmin.from("ingredients").update({ purchase_price: Number(s.prix), purchase_unit: 1 }).eq("id", s.ingId).eq("source", "recette_maison");
    if (!error) ingredients++;
  }
  return { ecrites, ignorees: changements.length - aEcrire.length, ingredients, echecs };
}

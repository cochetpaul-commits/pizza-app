import { NextRequest, NextResponse } from "next/server";
import { EtabError, getEtablissement } from "@/lib/getEtablissement";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Carte (09/10/2026) : les touches de caisse Popina, chacune avec son prix de vente (Popina),
 * sa TVA, son coût matière (fiche technique par part, ou prix d'achat du produit relié, avec la
 * dose éventuelle), son food cost et ce qu'il faut pour le volet de lecture (description, résumé
 * salle, allergènes calculés, lignes de recette). Les règles de coût sont celles de
 * Pilotage › Produits (/api/ventes/marges) pour que les deux pages racontent la même chose.
 */

export type LigneRecette = { nom: string; qty: number | null; unit: string | null; preparation: boolean };

export type ArticleCarte = {
  id: string;
  popina_id: string;
  nom: string;
  categorie: string;
  sous_categorie: string | null;
  prix_ttc: number;
  tva: number;
  prix_ht: number;
  /** Lien Popina : fiche technique, produit du catalogue, ou rien */
  lien: "fiche" | "produit" | null;
  lien_type: string | null;
  /** Lien vers une fiche ou un produit qui n'existe plus */
  lien_orphelin: boolean;
  fiche: {
    id: string;
    nom: string;
    categorie: string;
    fiche_type: string | null;
    statut: string | null;
    nb_parts: number;
    description: string | null;
    resume_salle: string | null;
    photo_url: string | null;
    allergenes: string[];
    lignes: LigneRecette[];
    total_cost: number | null;
  } | null;
  produit: { id: string; nom: string; dose: string | null; allergenes: string[] } | null;
  /** Coût matière d'une vente (une part, une pizza, une dose) */
  cout: number | null;
  cout_source: "fiche" | "produit" | null;
  cout_detail: string | null;
  food_cost: number | null;
  marge_ht: number | null;
  ventes_30j: { qty: number; ca_ttc: number } | null;
};

export type ReponseCarte = {
  articles: ArticleCarte[];
  periode_ventes: { from: string; to: string };
};

function normaliser(nom: string): string {
  return nom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function lireAllergenes(brut: unknown): string[] {
  if (Array.isArray(brut)) return brut.filter((a): a is string => typeof a === "string");
  if (typeof brut === "string") {
    try { const v = JSON.parse(brut); return Array.isArray(v) ? v.filter((a): a is string => typeof a === "string") : []; } catch { return []; }
  }
  return [];
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const aujourdhui = new Date();
  const depuis = new Date(aujourdhui); depuis.setDate(depuis.getDate() - 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const periode = { from: iso(depuis), to: iso(aujourdhui) };

  const [{ data: touches, error: errTouches }, ventesRes] = await Promise.all([
    supabaseAdmin
      .from("popina_products")
      .select("id, popina_id, name, category, sub_category, price_ttc, tva_rate, kitchen_recipe_id, ingredient_id, linked_type")
      .eq("active", true)
      .order("category")
      .order("name"),
    supabaseAdmin.rpc("ventes_par_produit", { p_etab: etabId, p_from: periode.from, p_to: periode.to }),
  ]);
  if (errTouches) return NextResponse.json({ error: errTouches.message }, { status: 500 });

  const ventes = new Map<string, { qty: number; ca_ttc: number }>();
  for (const v of (ventesRes.data ?? []) as { description: string; qty: number; ca_ttc: number }[]) {
    if (!v.description) continue;
    const cle = normaliser(v.description);
    const avant = ventes.get(cle) ?? { qty: 0, ca_ttc: 0 };
    ventes.set(cle, { qty: avant.qty + (Number(v.qty) || 0), ca_ttc: avant.ca_ttc + (Number(v.ca_ttc) || 0) });
  }

  const ficheIds = [...new Set((touches ?? []).map((t) => t.kitchen_recipe_id).filter((x): x is string => !!x))];
  const produitIds = [...new Set((touches ?? []).map((t) => t.ingredient_id).filter((x): x is string => !!x))];

  const [{ data: fiches }, { data: lignes }, { data: doses }] = await Promise.all([
    ficheIds.length
      ? supabaseAdmin
        .from("kitchen_recipes")
        .select("id, name, category, fiche_type, statut, nb_parts, portions_count, total_cost, cost_per_portion, cost_per_kg, description_courte, resume_salle, photo_url, output_ingredient_id")
        .in("id", ficheIds)
      : Promise.resolve({ data: [] as never[] }),
    ficheIds.length
      ? supabaseAdmin.from("kitchen_recipe_lines").select("recipe_id, ingredient_id, qty, unit, sort_order").in("recipe_id", ficheIds).order("sort_order")
      : Promise.resolve({ data: [] as never[] }),
    supabaseAdmin.from("popina_dose_map").select("popina_product_id, ingredient_id, dose, dose_unit"),
  ]);

  type Fiche = NonNullable<typeof fiches>[number];
  type Ligne = NonNullable<typeof lignes>[number];
  const ficheParId = new Map<string, Fiche>((fiches ?? []).map((f) => [f.id, f]));
  const lignesParFiche = new Map<string, Ligne[]>();
  for (const l of lignes ?? []) {
    const arr = lignesParFiche.get(l.recipe_id) ?? [];
    arr.push(l);
    lignesParFiche.set(l.recipe_id, arr);
  }
  const doseParTouche = new Map((doses ?? []).map((d) => [d.popina_product_id, d]));

  // Ingrédients : ceux des lignes (nom, allergènes) et ceux reliés directement (prix)
  const ingredientIds = [...new Set([...produitIds, ...(lignes ?? []).map((l) => l.ingredient_id).filter((x): x is string => !!x)])];
  const [{ data: ingredients }, { data: offres }, { data: sousFiches }] = await Promise.all([
    ingredientIds.length
      ? supabaseAdmin.from("ingredients").select("id, name, allergens, cost_per_unit, cost_per_kg, piece_volume_ml, source_prep_recipe_id").in("id", ingredientIds)
      : Promise.resolve({ data: [] as never[] }),
    produitIds.length
      ? supabaseAdmin.from("supplier_offers").select("ingredient_id, unit_price, pack_price, pack_count, pack_each_qty").eq("is_active", true).in("ingredient_id", produitIds)
      : Promise.resolve({ data: [] as never[] }),
    // Allergènes des préparations maison utilisées comme ingrédient (un niveau)
    ingredientIds.length
      ? supabaseAdmin.from("kitchen_recipes").select("id, output_ingredient_id").in("output_ingredient_id", ingredientIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  type Ingredient = NonNullable<typeof ingredients>[number];
  const ingParId = new Map<string, Ingredient>((ingredients ?? []).map((i) => [i.id, i]));
  const prixOffre = new Map<string, number>();
  for (const o of offres ?? []) {
    if (prixOffre.has(o.ingredient_id)) continue;
    if (o.unit_price && o.unit_price > 0) { prixOffre.set(o.ingredient_id, Number(o.unit_price)); continue; }
    if (o.pack_price && o.pack_count) {
      const u = Number(o.pack_price) / (Number(o.pack_count) * (Number(o.pack_each_qty) || 1));
      if (u > 0) prixOffre.set(o.ingredient_id, u);
    }
  }
  const ficheParSortie = new Map<string, string>((sousFiches ?? []).filter((s) => s.output_ingredient_id).map((s) => [s.output_ingredient_id as string, s.id]));

  // Lignes des préparations utilisées (pour remonter leurs allergènes)
  const sousFicheIds = [...new Set(ficheParSortie.values())].filter((id) => !lignesParFiche.has(id));
  if (sousFicheIds.length) {
    const { data: lignesSous } = await supabaseAdmin.from("kitchen_recipe_lines").select("recipe_id, ingredient_id, qty, unit, sort_order").in("recipe_id", sousFicheIds);
    const manquants = [...new Set((lignesSous ?? []).map((l) => l.ingredient_id).filter((x): x is string => !!x && !ingParId.has(x)))];
    if (manquants.length) {
      const { data: ings2 } = await supabaseAdmin.from("ingredients").select("id, name, allergens, cost_per_unit, cost_per_kg, piece_volume_ml, source_prep_recipe_id").in("id", manquants);
      for (const i of ings2 ?? []) ingParId.set(i.id, i);
    }
    for (const l of lignesSous ?? []) {
      const arr = lignesParFiche.get(l.recipe_id) ?? [];
      arr.push(l);
      lignesParFiche.set(l.recipe_id, arr);
    }
  }

  function allergenesFiche(ficheId: string, vus = new Set<string>()): string[] {
    const out = new Set<string>();
    for (const l of lignesParFiche.get(ficheId) ?? []) {
      if (!l.ingredient_id || vus.has(l.ingredient_id)) continue;
      vus.add(l.ingredient_id);
      const ing = ingParId.get(l.ingredient_id);
      if (ing) for (const a of lireAllergenes(ing.allergens)) out.add(a);
      const sous = ficheParSortie.get(l.ingredient_id);
      if (sous) for (const a of allergenesFiche(sous, vus)) out.add(a);
    }
    return [...out].sort();
  }

  const articles: ArticleCarte[] = (touches ?? []).map((t) => {
    const prixTtc = Number(t.price_ttc) || 0;
    const tva = Number(t.tva_rate) || 0;
    // tva_rate stockée en pourcent (10) ou en taux (0.10) selon la synchro : on accepte les deux
    const taux = tva > 1 ? tva / 100 : tva;
    const prixHt = arrondi(prixTtc / (1 + taux));

    let fiche: ArticleCarte["fiche"] = null;
    let produit: ArticleCarte["produit"] = null;
    let lien: ArticleCarte["lien"] = null;
    let orphelin = false;
    let cout: number | null = null;
    let coutSource: ArticleCarte["cout_source"] = null;
    let coutDetail: string | null = null;

    if (t.kitchen_recipe_id) {
      const f = ficheParId.get(t.kitchen_recipe_id);
      if (!f) orphelin = true;
      else {
        lien = "fiche";
        const estPizza = f.category === "pizza";
        const parts = Number(f.nb_parts) || Number(f.portions_count) || 1;
        const brut = estPizza
          ? (f.total_cost != null ? Number(f.total_cost) : null)
          : (f.cost_per_portion != null ? Number(f.cost_per_portion) : f.total_cost != null ? Number(f.total_cost) : f.cost_per_kg != null ? Number(f.cost_per_kg) : null);
        if (brut != null && brut > 0) {
          cout = arrondi(brut);
          coutSource = "fiche";
          coutDetail = estPizza ? "la pizza" : parts > 1 ? `la part (${parts} parts, ${arrondi(Number(f.total_cost) || 0).toFixed(2).replace(".", ",")} € la recette)` : "la portion";
        } else {
          coutDetail = "fiche sans coût (ingrédients sans prix ?)";
        }
        fiche = {
          id: f.id, nom: f.name, categorie: f.category, fiche_type: f.fiche_type ?? null, statut: f.statut ?? null, nb_parts: parts,
          description: f.description_courte ?? null, resume_salle: f.resume_salle ?? null, photo_url: f.photo_url ?? null,
          allergenes: allergenesFiche(f.id),
          lignes: (lignesParFiche.get(f.id) ?? []).map((l) => {
            const ing = l.ingredient_id ? ingParId.get(l.ingredient_id) : undefined;
            return { nom: ing?.name ?? "?", qty: l.qty != null ? Number(l.qty) : null, unit: l.unit ?? null, preparation: !!(l.ingredient_id && ficheParSortie.has(l.ingredient_id)) };
          }),
          total_cost: f.total_cost != null ? arrondi(Number(f.total_cost)) : null,
        };
      }
    } else if (t.ingredient_id) {
      const ing = ingParId.get(t.ingredient_id);
      if (!ing) orphelin = true;
      else {
        lien = "produit";
        let unitaire = Number(ing.cost_per_unit) || Number(ing.cost_per_kg) || prixOffre.get(ing.id) || 0;
        const dose = doseParTouche.get(t.id);
        let doseTexte: string | null = null;
        if (dose) {
          const volume = Number(ing.piece_volume_ml) || 0;
          if (dose.dose_unit === "cl" && volume > 0) {
            unitaire = (Number(dose.dose) * 10 / volume) * unitaire;
            doseTexte = `${Number(dose.dose)} cl sur ${volume} ml`;
          } else {
            unitaire = Number(dose.dose) * unitaire;
            doseTexte = `${Number(dose.dose)} ${dose.dose_unit ?? ""}`.trim();
          }
        }
        if (unitaire > 0) {
          cout = arrondi(unitaire);
          coutSource = "produit";
          coutDetail = dose ? `prix d'achat, dose ${doseTexte}` : "prix d'achat (l'unité)";
        } else {
          coutDetail = "produit sans prix d'achat";
        }
        produit = { id: ing.id, nom: ing.name, dose: doseTexte, allergenes: lireAllergenes(ing.allergens) };
      }
    }

    const foodCost = cout != null && prixHt > 0 ? Math.round((cout / prixHt) * 1000) / 10 : null;
    const margeHt = cout != null && prixHt > 0 ? arrondi(prixHt - cout) : null;
    const v = ventes.get(normaliser(t.name));

    return {
      id: t.id, popina_id: t.popina_id, nom: t.name, categorie: t.category ?? "AUTRE", sous_categorie: t.sub_category ?? null,
      prix_ttc: prixTtc, tva: taux, prix_ht: prixHt,
      lien, lien_type: t.linked_type ?? null, lien_orphelin: orphelin,
      fiche, produit, cout, cout_source: coutSource, cout_detail: coutDetail, food_cost: foodCost, marge_ht: margeHt,
      ventes_30j: v ? { qty: v.qty, ca_ttc: arrondi(v.ca_ttc) } : null,
    };
  });

  const reponse: ReponseCarte = { articles, periode_ventes: periode };
  return NextResponse.json(reponse);
}

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { CAT_LABELS, type Category } from "@/types/ingredients";
import { coutUniteComptee, type OffreValo, type RecetteValo } from "@/lib/inventaireValorisation";
import { totalLigne } from "@/lib/inventaire";

/**
 * Valorisation d'un inventaire (côté serveur, clé service) : chaque ligne reçoit le coût HT d'une unité
 * comptée (dernier prix connu du produit, ramené dans l'unité comptée) et sa valeur. Sert au PDF
 * (export comptable) et à la clôture (coûts figés sur les lignes, total sur l'inventaire).
 */

export type LigneValorisee = {
  id: string; ingredient_id: string; zone: string; ordre: number | null; famille: string | null;
  nom: string; nom_feuille: string | null; categorie: string | null; categorie_libelle: string;
  cond_libelle: string | null; cond_contenu: number | null; colis: number | null; unites: number | null;
  /** total en unités comptées ; null = ligne non comptée */
  quantite: number | null; unite: string;
  cout: number | null; valeur: number | null; source: string | null; raison: string | null;
  fiche: "active" | "inactive" | "a_verifier" | "supprimee";
};

export type InventaireValorise = {
  lignes: LigneValorisee[];
  total: number;
  nb_comptees: number; nb_non_comptees: number; nb_sans_prix: number;
  par_zone: { zone: string; valeur: number; lignes: number }[];
  par_famille: { famille: string; valeur: number; lignes: number }[];
  par_categorie: { categorie: string; valeur: number; lignes: number }[];
};

const ordreZones = new Map<string, number>();

export async function valoriserInventaire(invId: string, etabId: string): Promise<InventaireValorise> {
  const [{ data: lignes }, { data: zones }] = await Promise.all([
    supabaseAdmin.from("inventaire_lignes")
      .select("id, ingredient_id, zone, ordre, famille, colis, unites, quantite, unite, cond_contenu, cond_libelle, cout_unitaire, nom_feuille")
      .eq("inventaire_id", invId).eq("retiree", false).order("ordre", { ascending: true, nullsFirst: false }).limit(5000),
    supabaseAdmin.from("storage_zones").select("name, display_order").eq("etablissement_id", etabId),
  ]);
  for (const z of zones ?? []) ordreZones.set(z.name as string, Number(z.display_order ?? 99));
  const ids = [...new Set((lignes ?? []).map((l) => l.ingredient_id as string))];
  const fiches = new Map<string, Record<string, unknown>>();
  const offres = new Map<string, OffreValo[]>();
  // Préparations maison : la recette cuisine dont le produit est la sortie donne le coût au kilo
  const recettes = new Map<string, RecetteValo>();
  for (let i = 0; i < ids.length; i += 200) {
    const lot = ids.slice(i, i + 200);
    const [{ data: ings }, { data: offs }, { data: recs }] = await Promise.all([
      supabaseAdmin.from("ingredients").select("id, name, category, is_active, status, purchase_price, purchase_unit, purchase_unit_label, piece_weight_g, piece_volume_ml, density_g_per_ml").in("id", lot),
      supabaseAdmin.from("supplier_offers").select("ingredient_id, is_active, valid_from, valid_to, created_at, unit, unit_price, pack_price, pack_count, pack_each_qty, pack_each_unit, pack_total_qty, pack_unit, price_kind, piece_weight_g, density_kg_per_l").in("ingredient_id", lot),
      supabaseAdmin.from("kitchen_recipes").select("output_ingredient_id, cost_per_kg, total_cost, yield_grams").in("output_ingredient_id", lot).eq("is_active", true),
    ]);
    for (const f of ings ?? []) fiches.set(f.id as string, f as Record<string, unknown>);
    for (const o of (offs ?? []) as (OffreValo & { ingredient_id: string })[]) offres.set(o.ingredient_id, [...(offres.get(o.ingredient_id) ?? []), o]);
    for (const r of (recs ?? []) as (RecetteValo & { output_ingredient_id: string })[]) if (!recettes.has(r.output_ingredient_id)) recettes.set(r.output_ingredient_id, r);
  }

  const out: LigneValorisee[] = (lignes ?? []).map((l) => {
    const f = fiches.get(l.ingredient_id as string);
    const q = totalLigne(l.colis as number | null, l.unites as number | null, l.cond_contenu as number | null);
    const unite = (l.unite as string | null) ?? "pièce";
    let cout: number | null = l.cout_unitaire != null ? Number(l.cout_unitaire) : null;
    let source: string | null = cout != null ? "figé" : null;
    let raison: string | null = null;
    if (cout == null && f) {
      const v = coutUniteComptee(unite, f, offres.get(l.ingredient_id as string) ?? [], recettes.get(l.ingredient_id as string));
      cout = v.cout; source = v.source; raison = v.raison ?? null;
    }
    if (!f) raison = "fiche supprimée";
    const cat = (f?.category as string | null) ?? null;
    return {
      id: l.id as string, ingredient_id: l.ingredient_id as string, zone: l.zone as string, ordre: l.ordre as number | null, famille: l.famille as string | null,
      nom: (f?.name as string | undefined) ?? (l.nom_feuille as string | null) ?? "?", nom_feuille: l.nom_feuille as string | null,
      categorie: cat, categorie_libelle: CAT_LABELS[cat as Category] ?? cat ?? "Sans catégorie",
      cond_libelle: l.cond_libelle as string | null, cond_contenu: l.cond_contenu as number | null, colis: l.colis as number | null, unites: l.unites as number | null,
      quantite: q, unite, cout, valeur: q != null && cout != null ? Math.round(q * cout * 100) / 100 : null, source, raison,
      fiche: !f ? "supprimee" : f.is_active === false ? "inactive" : f.status === "to_check" ? "a_verifier" : "active",
    };
  });
  out.sort((a, b) => (ordreZones.get(a.zone) ?? 99) - (ordreZones.get(b.zone) ?? 99) || (a.ordre ?? 0) - (b.ordre ?? 0));

  const somme = (cle: (l: LigneValorisee) => string) => {
    const m = new Map<string, { valeur: number; lignes: number }>();
    for (const l of out) { const k = cle(l); const c = m.get(k) ?? { valeur: 0, lignes: 0 }; c.valeur += l.valeur ?? 0; c.lignes += 1; m.set(k, c); }
    return [...m.entries()].map(([k, v]) => ({ cle: k, valeur: Math.round(v.valeur * 100) / 100, lignes: v.lignes }));
  };
  const total = Math.round(out.reduce((s, l) => s + (l.valeur ?? 0), 0) * 100) / 100;
  return {
    lignes: out, total,
    nb_comptees: out.filter((l) => l.quantite != null).length,
    nb_non_comptees: out.filter((l) => l.quantite == null).length,
    nb_sans_prix: out.filter((l) => l.cout == null).length,
    par_zone: somme((l) => l.zone).map((x) => ({ zone: x.cle, valeur: x.valeur, lignes: x.lignes })).sort((a, b) => (ordreZones.get(a.zone) ?? 99) - (ordreZones.get(b.zone) ?? 99)),
    par_famille: somme((l) => l.famille ?? "Sans famille").map((x) => ({ famille: x.cle, valeur: x.valeur, lignes: x.lignes })).sort((a, b) => b.valeur - a.valeur),
    par_categorie: somme((l) => l.categorie_libelle).map((x) => ({ categorie: x.cle, valeur: x.valeur, lignes: x.lignes })).sort((a, b) => b.valeur - a.valeur),
  };
}

/** Clôture : coûts figés sur les lignes, total HT sur l'inventaire */
export async function figerValorisation(invId: string, etabId: string): Promise<{ total: number; sans_prix: number }> {
  const v = await valoriserInventaire(invId, etabId);
  for (const l of v.lignes) {
    if (l.cout == null || l.source === "figé") continue;
    await supabaseAdmin.from("inventaire_lignes").update({ cout_unitaire: l.cout }).eq("id", l.id);
  }
  await supabaseAdmin.from("inventaires").update({ total_valeur: v.total }).eq("id", invId);
  return { total: v.total, sans_prix: v.nb_sans_prix };
}

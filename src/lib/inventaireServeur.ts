import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { CAT_LABELS, type Category } from "@/types/ingredients";
import { choisirConditionnement, lireFeuille, totalLigne, type ArticleFournisseur, type Conditionnement, type OffreActive } from "@/lib/inventaire";

/**
 * Inventaires, saisie « feuille » (côté serveur, clé service) : import de la feuille papier, ajout d'un produit
 * hors liste, clôture (mouvements de stock) et réouverture par un admin. Droits vérifiés par les routes.
 */

export type Reponse = { status: number; body: unknown };
const rep = (body: unknown, status = 200): Reponse => ({ status, body });

type Inv = { id: string; etablissement_id: string; statut: string; saisie: string; date: string };

export async function chargerInventaire(id: string): Promise<Inv | null> {
  const { data } = await supabaseAdmin.from("inventaires").select("id, etablissement_id, statut, saisie, date").eq("id", id).maybeSingle();
  return (data as Inv | null) ?? null;
}

/** Conditionnement retenu et unité de la fiche, pour une liste de produits */
export async function conditionnements(ids: string[]) {
  const res = new Map<string, { cond: Conditionnement | null; uniteFiche: string; nom: string; famille: string | null; existe: boolean }>();
  for (let i = 0; i < ids.length; i += 300) {
    const lot = ids.slice(i, i + 300);
    const [{ data: ings }, { data: arts }, { data: offres }] = await Promise.all([
      supabaseAdmin.from("ingredients").select("id, name, category, default_unit, default_supplier_id").in("id", lot),
      supabaseAdmin.from("commande_articles")
        .select("ingredient_id, supplier_id, unite_commande, contenu_nb, element, element_qte, element_unite, commande_element_permise, precommande")
        .in("ingredient_id", lot),
      supabaseAdmin.from("supplier_offers").select("ingredient_id, supplier_id, created_at, valid_from").eq("is_active", true).in("ingredient_id", lot),
    ]);
    for (const ing of ings ?? []) {
      const id = ing.id as string;
      const a = ((arts ?? []) as unknown as (ArticleFournisseur & { ingredient_id: string })[]).filter((x) => x.ingredient_id === id);
      const o = ((offres ?? []) as unknown as (OffreActive & { ingredient_id: string })[]).filter((x) => x.ingredient_id === id);
      res.set(id, {
        cond: choisirConditionnement((ing.default_supplier_id as string | null) ?? null, a, o),
        uniteFiche: (ing.default_unit as string | null) ?? "pc",
        nom: ing.name as string,
        famille: CAT_LABELS[ing.category as Category] ?? (ing.category as string | null) ?? null,
        existe: true,
      });
    }
  }
  return res;
}

const colonnesCond = (c: Conditionnement | null, uniteFiche: string) => ({
  cond_supplier_id: c?.supplier_id ?? null,
  cond_contenu: c?.contenu ?? null,
  cond_libelle: c?.libelle ?? null,
  unite: c?.unite ?? uniteFiche,
});

/**
 * Pré-remplit l'inventaire avec les lignes de la feuille papier (zone, famille, nom, identifiant), dans l'ordre.
 * Refusé si des quantités ont déjà été saisies ; les lignes pré-remplies non comptées sont remplacées.
 */
export async function importerFeuille(inv: Inv, tableau: unknown[][]): Promise<Reponse> {
  if (inv.statut === "cloture") return rep({ error: "Inventaire clôturé" }, 409);
  const { count: dejaSaisies } = await supabaseAdmin.from("inventaire_lignes").select("id", { count: "exact", head: true })
    .eq("inventaire_id", inv.id).or("colis.not.is.null,unites.not.is.null");
  if ((dejaSaisies ?? 0) > 0) return rep({ error: "Des quantités sont déjà saisies : import refusé pour ne rien écraser" }, 409);

  const { data: zones } = await supabaseAdmin.from("storage_zones").select("name").eq("etablissement_id", inv.etablissement_id);
  const lecture = lireFeuille(tableau, (zones ?? []).map((z) => z.name as string));
  if (!lecture.lignes.length) return rep({ error: lecture.erreurs[0] ?? "Aucune ligne lue", erreurs: lecture.erreurs }, 400);

  const conds = await conditionnements([...new Set(lecture.lignes.map((l) => l.ingredient_id))]);
  const erreurs = [...lecture.erreurs];
  const aInserer = [];
  for (const l of lecture.lignes) {
    const c = conds.get(l.ingredient_id);
    if (!c) { erreurs.push(`${l.nom || l.ingredient_id} : fiche introuvable, ligne ignorée`); continue; }
    aInserer.push({
      inventaire_id: inv.id, ingredient_id: l.ingredient_id, zone: l.zone, ordre: l.ordre,
      famille: l.famille ?? c.famille, quantite: 0, colis: null, unites: null, ...colonnesCond(c.cond, c.uniteFiche),
    });
  }
  const { error: errSup } = await supabaseAdmin.from("inventaire_lignes").delete().eq("inventaire_id", inv.id).is("colis", null).is("unites", null);
  if (errSup) return rep({ error: errSup.message }, 500);
  for (let i = 0; i < aInserer.length; i += 500) {
    const { error } = await supabaseAdmin.from("inventaire_lignes").insert(aInserer.slice(i, i + 500));
    if (error) return rep({ error: error.message, erreurs }, 500);
  }
  await supabaseAdmin.from("inventaires").update({ saisie: "feuille" }).eq("id", inv.id);
  return rep({ ok: true, lignes: aInserer.length, sans_conditionnement: aInserer.filter((x) => x.cond_contenu == null).length, erreurs });
}

/** Produit hors liste ajouté dans une zone (en fin de zone) */
export async function ajouterLigne(inv: Inv, ingredientId: string, zone: string): Promise<Reponse> {
  if (inv.statut === "cloture") return rep({ error: "Inventaire clôturé" }, 409);
  const { data: z } = await supabaseAdmin.from("storage_zones").select("name").eq("etablissement_id", inv.etablissement_id).eq("name", zone).maybeSingle();
  if (!z) return rep({ error: "Zone inconnue" }, 400);
  const c = (await conditionnements([ingredientId])).get(ingredientId);
  if (!c) return rep({ error: "Produit introuvable" }, 404);
  const { data: existe } = await supabaseAdmin.from("inventaire_lignes").select("id").eq("inventaire_id", inv.id).eq("ingredient_id", ingredientId).eq("zone", zone).maybeSingle();
  if (existe) return rep({ error: "Ce produit est déjà dans cette zone", id: existe.id }, 409);
  const { data: dernier } = await supabaseAdmin.from("inventaire_lignes").select("ordre").eq("inventaire_id", inv.id)
    .order("ordre", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const { data, error } = await supabaseAdmin.from("inventaire_lignes").insert({
    inventaire_id: inv.id, ingredient_id: ingredientId, zone, ordre: Number(dernier?.ordre ?? 0) + 1,
    famille: "Ajouts hors liste", quantite: 0, colis: null, unites: null, ...colonnesCond(c.cond, c.uniteFiche),
  }).select("id").single();
  if (error) return rep({ error: error.message }, 500);
  return rep({ ok: true, id: data.id });
}

/** Clôture : statut, puis mouvements de stock (une ligne par produit et par unité comptée, toutes zones additionnées) */
export async function cloturer(inv: Inv, userId: string): Promise<Reponse> {
  if (inv.statut === "cloture") return rep({ error: "Déjà clôturé" }, 409);
  const { data: lignes } = await supabaseAdmin.from("inventaire_lignes").select("ingredient_id, colis, unites, cond_contenu, unite, quantite").eq("inventaire_id", inv.id);
  const nonComptees = (lignes ?? []).filter((l) => l.colis == null && l.unites == null).length;
  const parProduit = new Map<string, { quantite: number; unite: string }>();
  for (const l of lignes ?? []) {
    const t = totalLigne(l.colis as number | null, l.unites as number | null, l.cond_contenu as number | null) ?? (Number(l.quantite) || 0);
    if (!(t > 0)) continue;
    const cle = `${l.ingredient_id}|${l.unite ?? ""}`;
    const p = parProduit.get(cle) ?? { quantite: 0, unite: (l.unite as string | null) ?? "pc" };
    p.quantite += t;
    parProduit.set(cle, p);
  }
  const { error } = await supabaseAdmin.from("inventaires").update({ statut: "cloture", cloture_par: userId, cloture_at: new Date().toISOString() }).eq("id", inv.id);
  if (error) return rep({ error: error.message }, 500);
  const note = `Inventaire du ${new Date(inv.date + "T12:00:00").toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`;
  const mouvements = [...parProduit.entries()].map(([cle, p]) => ({
    etablissement_id: inv.etablissement_id, ingredient_id: cle.split("|")[0], type: "inventaire", quantity: Math.round(p.quantite * 1000) / 1000, unit: p.unite, note,
  }));
  const { error: errMv } = await supabaseAdmin.rpc("inventaire_replace_movements", { p_reference: `inventaire_${inv.id}`, p_movements: mouvements });
  if (errMv) return rep({ ok: true, avertissement: `Clôturé, mais mouvements de stock non enregistrés : ${errMv.message}` });
  return rep({ ok: true, mouvements: mouvements.length, non_comptees: nonComptees });
}

/** Réouverture (admins) : l'inventaire redevient modifiable ; les mouvements de stock seront refaits à la prochaine clôture */
export async function rouvrir(inv: Inv, userId: string): Promise<Reponse> {
  if (inv.statut !== "cloture") return rep({ error: "Inventaire déjà ouvert" }, 409);
  const { error } = await supabaseAdmin.from("inventaires").update({ statut: "en_cours", rouvert_par: userId, rouvert_at: new Date().toISOString() }).eq("id", inv.id);
  if (error) return rep({ error: error.message }, 500);
  return rep({ ok: true });
}

import { supabase } from "@/lib/supabaseClient";
import { dateFermeture } from "@/lib/offerClosing";

/**
 * Actif / inactif d'un produit de la Base produits (10/10/2026).
 * Inactif : la fiche sort des listes, des commandes et du prochain inventaire ; ses offres
 * fournisseur sont fermées ; l'historique est conservé. Réactiver remet la fiche dans les listes
 * (les offres restent à ressaisir ou reviennent avec la prochaine facture).
 */
export type EtabCote = { id: string; slug: string | null } | null | undefined;

const cleEtab = (etab: EtabCote): "bellomio" | "piccola" | null =>
  etab?.slug?.includes("piccola") ? "piccola" : etab?.slug?.includes("bello") ? "bellomio" : null;

/**
 * Fiches partagées entre les deux restaurants (25/11/2026) : supprimer ou désactiver d'un côté ne touche pas l'autre.
 * La fiche perd seulement cet établissement (et ses emplacements ici) ; elle reste active chez l'autre, avec ses offres.
 * Renvoie les fiches propres à cet établissement, à traiter normalement (désactivation ou suppression).
 */
export async function retirerPartagesDuCote(ids: string[], etab: EtabCote): Promise<{ propres: string[]; partages: number; erreur: string | null }> {
  const cle = cleEtab(etab);
  if (!cle || ids.length === 0) return { propres: ids, partages: 0, erreur: null };
  const propres: string[] = [];
  let partages = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from("ingredients").select("id, establishments").in("id", ids.slice(i, i + 100));
    if (error) return { propres, partages, erreur: error.message };
    for (const r of (data ?? []) as { id: string; establishments: string[] | null }[]) {
      const autres = (r.establishments ?? []).filter((e) => e !== cle);
      if ((r.establishments ?? []).includes(cle) && autres.length > 0) {
        const { error: e1 } = await supabase.from("ingredients").update({ establishments: autres }).eq("id", r.id);
        if (e1) return { propres, partages, erreur: e1.message };
        if (etab?.id) await supabase.from("ingredient_zones").delete().eq("etablissement_id", etab.id).eq("ingredient_id", r.id);
        partages++;
      } else propres.push(r.id);
    }
  }
  return { propres, partages, erreur: null };
}

/**
 * Produits encore utilisés dans une fiche technique active (27/11/2026) : ils ne se désactivent pas, sinon la fiche
 * garde un ingrédient introuvable dans la Base produits et sans prix (vécu : 18 ingrédients de fiches désactivés).
 */
async function utilisesEnFiche(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase.from("kitchen_recipe_lines").select("ingredient_id, recette:kitchen_recipes!inner(name, is_active)").in("ingredient_id", ids.slice(i, i + 100)).eq("recette.is_active", true);
    for (const l of (data ?? []) as unknown as { ingredient_id: string; recette: { name: string } | { name: string }[] }[]) {
      const r = Array.isArray(l.recette) ? l.recette[0] : l.recette;
      if (r && !out.has(l.ingredient_id)) out.set(l.ingredient_id, r.name);
    }
  }
  return out;
}

export async function desactiverProduits(idsTous: string[], etab?: EtabCote): Promise<string | null> {
  const utilises = await utilisesEnFiche(idsTous);
  const idsDemandes = idsTous.filter((id) => !utilises.has(id));
  const refus = utilises.size
    ? `${utilises.size} produit${utilises.size > 1 ? "s" : ""} non désactivé${utilises.size > 1 ? "s" : ""} car utilisé${utilises.size > 1 ? "s" : ""} dans une fiche technique (${[...new Set(utilises.values())].slice(0, 4).join(", ")}${utilises.size > 4 ? "…" : ""}). Remplace-le d'abord dans la fiche.`
    : null;
  if (idsDemandes.length === 0) return refus;
  const { propres: ids, erreur } = await retirerPartagesDuCote(idsDemandes, etab);
  if (erreur) return erreur;
  for (let i = 0; i < ids.length; i += 100) {
    const lot = ids.slice(i, i + 100);
    const off = await supabase.from("supplier_offers").update({ is_active: false, valid_to: dateFermeture() }).in("ingredient_id", lot).eq("is_active", true);
    if (off.error) return `Fermeture des offres : ${off.error.message}`;
    const { error } = await supabase.from("ingredients").update({ is_active: false }).in("id", lot);
    if (error) return error.message;
  }
  return refus;
}

export async function reactiverProduits(ids: string[]): Promise<string | null> {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from("ingredients").update({ is_active: true }).in("id", ids.slice(i, i + 100));
    if (error) return error.message;
  }
  return null;
}

/**
 * Restaurants cochés sur une fiche (26/11/2026) : cocher l'autre restaurant ne partage plus la fiche, il reçoit
 * sa propre copie (même fiche, fournisseur de son côté), qui vit ensuite sa vie. Décocher retire ce restaurant.
 * Renvoie les restaurants à garder sur cette fiche, et les copies créées.
 */
export async function appliquerEtablissements(id: string, demandes: string[], actuels: string[]): Promise<{ garder: string[]; copies: string[]; erreur: string | null }> {
  const ajouts = demandes.filter((e) => !actuels.includes(e));
  let garder = actuels.filter((e) => demandes.includes(e));
  if (garder.length === 0) garder = actuels;
  const copies: string[] = [];
  for (const cle of ajouts) {
    const { error } = await supabase.rpc("copier_produit_vers", { p_id: id, p_cle: cle });
    if (error) return { garder, copies, erreur: `Copie pour ${cle === "piccola" ? "Piccola Mia" : "Bello Mio"} : ${error.message}` };
    copies.push(cle);
  }
  return { garder, copies, erreur: null };
}

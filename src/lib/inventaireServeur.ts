import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { CAT_LABELS, type Category } from "@/types/ingredients";
import { categorieDeFamille, choisirConditionnement, comptageFeuille, lireFeuille, totalLigne, uniteFicheDe, UUID, type ArticleFournisseur, type Conditionnement, type OffreActive } from "@/lib/inventaire";

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

const normNom = (x: unknown) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

type FicheCourte = { id: string; name: string; is_active: boolean; etablissement_id: string; updated_at: string; status_note: string | null };

async function toutesLesFiches(): Promise<FicheCourte[]> {
  const toutes: FicheCourte[] = [];
  for (let p = 0; p < 50; p++) {
    const { data } = await supabaseAdmin.from("ingredients").select("id, name, is_active, etablissement_id, updated_at, status_note").range(p * 1000, p * 1000 + 999);
    toutes.push(...((data ?? []) as FicheCourte[]));
    if (!data || data.length < 1000) break;
  }
  return toutes;
}

/**
 * Pré-remplit l'inventaire avec les lignes de la feuille papier, dans l'ordre, avec le nom tel qu'imprimé.
 * Fiche : identifiant, sinon nom exact (fiche active de l'établissement d'abord, puis active ailleurs, puis désactivée) ;
 * sinon fiche créée « à vérifier » (famille et fournisseur du fichier), une seule fois par nom.
 * Saisie dans l'unité de comptage de la feuille (« colis de 20 » : colis + unités ; « kg » : un champ) ;
 * sans unité dans le fichier : conditionnement de commande. Doublons dans une zone gardés (additionnés à la valorisation).
 * Refusé si des quantités ont déjà été saisies ; les lignes pré-remplies non comptées sont remplacées.
 */
export async function importerFeuille(
  inv: Inv, tableau: unknown[][], userId: string,
  /** Correspondances données à la main : nom (tel qu'imprimé ou nom de fiche) → identifiant de fiche */
  correspondances: Record<string, string> = {},
  /** Simulation : rien n'est écrit (ni fiche, ni ligne), seulement le bilan */
  simulation = false,
): Promise<Reponse> {
  if (inv.statut === "cloture") return rep({ error: "Inventaire clôturé" }, 409);
  const { count: dejaSaisies } = await supabaseAdmin.from("inventaire_lignes").select("id", { count: "exact", head: true })
    .eq("inventaire_id", inv.id).or("colis.not.is.null,unites.not.is.null");
  if ((dejaSaisies ?? 0) > 0) return rep({ error: "Des quantités sont déjà saisies : import refusé pour ne rien écraser" }, 409);

  const [{ data: zones }, { data: etab }, { data: fournisseurs }, fiches] = await Promise.all([
    supabaseAdmin.from("storage_zones").select("name").eq("etablissement_id", inv.etablissement_id),
    supabaseAdmin.from("etablissements").select("slug").eq("id", inv.etablissement_id).maybeSingle(),
    supabaseAdmin.from("suppliers").select("id, name").eq("etablissement_id", inv.etablissement_id),
    toutesLesFiches(),
  ]);
  const lecture = lireFeuille(tableau, (zones ?? []).map((z) => z.name as string));
  if (!lecture.lignes.length) return rep({ error: lecture.erreurs[0] ?? "Aucune ligne lue", erreurs: lecture.erreurs }, 400);

  // Rattachement des fiches
  const parId = new Map(fiches.map((f) => [f.id, f]));
  const parNom = new Map<string, FicheCourte[]>();
  for (const f of fiches) parNom.set(normNom(f.name), [...(parNom.get(normNom(f.name)) ?? []), f]);
  const choisir = (nom: string): FicheCourte | null => {
    const c = parNom.get(normNom(nom)) ?? [];
    const recente = (l: FicheCourte[]) => [...l].sort((x, y) => y.updated_at.localeCompare(x.updated_at))[0] ?? null;
    return recente(c.filter((f) => f.is_active && f.etablissement_id === inv.etablissement_id))
      ?? recente(c.filter((f) => f.is_active)) ?? recente(c.filter((f) => f.etablissement_id === inv.etablissement_id)) ?? recente(c);
  };
  /** Fiche fusionnée dans une autre (status_note « … fusionné … -> <id> ») : on suit jusqu'à une fiche active */
  const suivreFusion = (f: FicheCourte): FicheCourte => {
    let cur = f;
    for (let i = 0; i < 5 && !cur.is_active; i++) {
      const note = cur.status_note ?? "";
      const cible = /fusionn/i.test(note) ? /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(note)?.[0] : undefined;
      const suivante = cible ? parId.get(cible.toLowerCase()) : undefined;
      if (!suivante || suivante.id === cur.id) break;
      cur = suivante;
    }
    return cur;
  };
  const manuelles = new Map(Object.entries(correspondances).map(([k, v]) => [normNom(k), v.toLowerCase()]));
  const stats = { par_identifiant: 0, par_nom: 0, correspondance: 0, a_creer_deja_existante: 0, via_fusion: 0, fiche_desactivee: 0, creees: 0 };
  const desactivees: string[] = [];
  const fournisseurDe = (nom: string | null) => (fournisseurs ?? []).find((f) => normNom(f.name) === normNom(nom))?.id as string | undefined;
  const creees = new Map<string, string>(); // nom → id
  const resolues: { l: (typeof lecture.lignes)[number]; id: string }[] = [];
  const erreurs = [...lecture.erreurs];
  for (const l of lecture.lignes) {
    let fiche: FicheCourte | null = null;
    const manuelle = manuelles.get(normNom(l.nom)) ?? (l.ref ? manuelles.get(normNom(l.ref)) : undefined);
    if (manuelle) { fiche = parId.get(manuelle) ?? null; if (fiche) stats.correspondance++; }
    else if (l.ref && UUID.test(l.ref)) { fiche = parId.get(l.ref.toLowerCase()) ?? null; if (fiche) stats.par_identifiant++; }
    else if (l.ref) { fiche = choisir(l.ref); if (fiche) stats.par_nom++; }
    // Fiche « à créer » dont le nom existe déjà (souvent désactivée) : on la reprend, une fiche du même nom ne peut pas être recréée
    else if (!creees.has(normNom(l.nom))) { fiche = choisir(l.nom); if (fiche) stats.a_creer_deja_existante++; }
    if (fiche && !fiche.is_active) {
      const active = suivreFusion(fiche);
      if (active.id !== fiche.id && active.is_active) { fiche = active; stats.via_fusion++; }
    }
    if (fiche) {
      if (!fiche.is_active) { stats.fiche_desactivee++; desactivees.push(`${l.ordre}. ${l.nom}`); }
      resolues.push({ l, id: fiche.id });
      continue;
    }
    // Fiche à créer (« À CRÉER », nom introuvable) : une seule fois par nom
    const cle = normNom(l.nom);
    let id = creees.get(cle);
    if (!id && simulation) { id = `simulation-${cle}`; stats.creees++; }
    if (!id) {
      const four = fournisseurDe(l.fournisseur);
      const { data: cree, error } = await supabaseAdmin.from("ingredients").insert({
        name: l.nom, category: categorieDeFamille(l.famille), default_unit: uniteFicheDe(l.uniteFeuille), status: "to_check",
        status_note: `Créée à l'import de l'inventaire du ${inv.date} (${l.famille ?? "sans famille"}, ${l.fournisseur ?? "sans fournisseur"}) : à vérifier`,
        etablissement_id: inv.etablissement_id, establishments: [etab?.slug === "piccola" ? "piccola" : "bellomio"],
        user_id: userId, supplier_id: four ?? null, default_supplier_id: four ?? null, purchase_unit_label: l.uniteFeuille,
      }).select("id").single();
      if (error || !cree) { erreurs.push(`${l.ordre}. ${l.nom} : fiche non créée (${error?.message ?? "erreur"})`); continue; }
      id = cree.id as string;
      stats.creees++;
    }
    creees.set(cle, id);
    resolues.push({ l, id });
  }

  // Conditionnement de commande, seulement pour les lignes sans unité de comptage dans le fichier
  const sansUnite = [...new Set(resolues.filter((r) => !r.l.uniteFeuille).map((r) => r.id))];
  const conds = sansUnite.length ? await conditionnements(sansUnite) : new Map();
  const aInserer = resolues.map(({ l, id }) => {
    const base = {
      inventaire_id: inv.id, ingredient_id: id, zone: l.zone, ordre: l.ordre, famille: l.famille, quantite: 0, colis: null, unites: null,
      nom_feuille: l.nom, fournisseur_feuille: l.fournisseur, rattachement: l.rattachement,
    };
    if (l.uniteFeuille) {
      const c = comptageFeuille(l.uniteFeuille);
      return { ...base, cond_supplier_id: null, cond_contenu: c.contenu, cond_libelle: c.libelle, unite: c.unite };
    }
    const c = conds.get(id);
    return { ...base, ...colonnesCond(c?.cond ?? null, c?.uniteFiche ?? "pc") };
  });

  if (simulation) return rep({ simulation: true, lignes: aInserer.length, ...stats, doublons: lecture.doublons, desactivees, erreurs });
  const { error: errSup } = await supabaseAdmin.from("inventaire_lignes").delete().eq("inventaire_id", inv.id).is("colis", null).is("unites", null);
  if (errSup) return rep({ error: errSup.message }, 500);
  for (let i = 0; i < aInserer.length; i += 500) {
    const { error } = await supabaseAdmin.from("inventaire_lignes").insert(aInserer.slice(i, i + 500));
    if (error) return rep({ error: error.message, erreurs }, 500);
  }
  await supabaseAdmin.from("inventaires").update({ saisie: "feuille" }).eq("id", inv.id);
  return rep({ ok: true, lignes: aInserer.length, ...stats, doublons: lecture.doublons, desactivees, erreurs });
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

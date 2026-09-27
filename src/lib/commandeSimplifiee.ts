import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { libelleColisage, libelleElement, prixUniteCommande, type CommandeArticle, type OffrePrix } from "@/lib/commandeArticles";
import { calculerHabituels, type AchatBrut, type RegleArticle } from "@/lib/commandeHabituels";

/**
 * Commande simplifiée (fournisseurs avec suppliers.commande_simplifiee, Maël d'abord).
 * Logique de la route /api/commandes/simplifiee, séparée pour être testable à sec.
 *
 * GET  ?supplier_id=…  → écran : articles (colisage, prix, habituels 90 j), rayons, brouillon en cours
 *                        avec le détail « qui a ajouté quoi ».
 * POST { supplier_id, ingredient_id, mode: "uc" | "element", quantite }
 *                      → fixe la quantité de l'utilisateur connecté sur ce produit (0 = retrait).
 *                        Les quantités de plusieurs personnes s'additionnent (commande_ligne_apports).
 *
 * Toujours la fiche fournisseur de l'établissement courant : Bello Mio et Piccola Mia ne se mélangent jamais.
 */

const JOURS_HABITUELS = 90;
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

type ArticleRow = CommandeArticle & { ingredient_id: string; ingredient: { id: string; name: string; is_active: boolean; rayon_commande: string | null } };
type OffreRow = OffrePrix & { ingredient_id: string; supplier_id: string; supplier_sku: string | null; valid_from: string | null; created_at: string | null };

export type Reponse = { status: number; body: unknown };
const rep = (body: unknown, status = 200): Reponse => ({ status, body });

/** Fiche du fournisseur pour l'établissement courant + toutes ses fiches homonymes (repli des prix) */
async function resoudreFiche(supplierId: string, etabId: string) {
  const { data: choisi } = await supabaseAdmin.from("suppliers").select("id, name").eq("id", supplierId).maybeSingle();
  if (!choisi) return null;
  const { data: memes } = await supabaseAdmin.from("suppliers").select("id, name, etablissement_id, commande_simplifiee, is_active");
  const homonymes = (memes ?? []).filter((s) => norm(s.name) === norm(choisi.name));
  const fiche = homonymes.find((s) => s.etablissement_id === etabId && s.commande_simplifiee && s.is_active);
  if (!fiche) return null;
  return { ficheId: fiche.id as string, nom: fiche.name as string, aliasIds: homonymes.map((s) => s.id as string) };
}

/** Offre active : celle de la fiche de l'établissement, sinon la plus récente d'une fiche homonyme */
function choisirOffre(offres: OffreRow[], ficheId: string): OffreRow | null {
  const propre = offres.find((o) => o.supplier_id === ficheId);
  if (propre) return propre;
  const date = (o: OffreRow) => o.valid_from ?? o.created_at ?? "";
  return [...offres].sort((a, b) => date(b).localeCompare(date(a)))[0] ?? null;
}

async function chargerOffres(aliasIds: string[]) {
  const { data } = await supabaseAdmin
    .from("supplier_offers")
    .select("ingredient_id, supplier_id, unit, unit_price, pack_price, pack_count, supplier_sku, valid_from, created_at")
    .eq("is_active", true)
    .in("supplier_id", aliasIds);
  const parProduit = new Map<string, OffreRow[]>();
  const produitParRef = new Map<string, string>();
  for (const o of (data ?? []) as OffreRow[]) {
    const l = parProduit.get(o.ingredient_id) ?? [];
    l.push(o);
    parProduit.set(o.ingredient_id, l);
    if (o.supplier_sku && !produitParRef.has(o.supplier_sku)) produitParRef.set(o.supplier_sku, o.ingredient_id);
  }
  return { parProduit, produitParRef };
}

async function sessionEnCours(ficheId: string, etabId: string) {
  const { data } = await supabaseAdmin
    .from("commande_sessions")
    .select("id, status, created_at")
    .eq("supplier_id", ficheId)
    .eq("etablissement_id", etabId)
    .in("status", ["brouillon", "validee"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; status: string; created_at: string } | null;
}

/** Données de l'écran de commande simplifiée pour la fiche fournisseur de l'établissement */
export async function ecranCommande(supplierId: string, etabId: string, userId: string): Promise<Reponse> {

  const f = await resoudreFiche(supplierId, etabId);
  if (!f) return rep({ error: "Ce fournisseur n'est pas en commande simplifiée pour cet établissement" }, 404);

  const depuis = new Date(Date.now() - JOURS_HABITUELS * 86400000).toISOString().slice(0, 10);
  const [{ data: articlesData, error: errArt }, { data: rayons }, offres, { data: factures }, session] = await Promise.all([
    supabaseAdmin.from("commande_articles")
      .select("ingredient_id, unite_commande, contenu_nb, element, element_qte, element_unite, commande_element_permise, precommande, ingredient:ingredients!inner(id, name, is_active, rayon_commande)")
      .eq("supplier_id", f.ficheId),
    supabaseAdmin.from("rayons_commande").select("code, libelle, ordre").order("ordre"),
    chargerOffres(f.aliasIds),
    supabaseAdmin.from("supplier_invoices").select("id, invoice_date")
      .in("supplier_id", f.aliasIds).eq("etablissement_id", etabId).gte("invoice_date", depuis),
    sessionEnCours(f.ficheId, etabId),
  ]);
  if (errArt) return rep({ error: errArt.message }, 500);

  // Fiches désactivées : jamais proposées
  const articles = ((articlesData ?? []) as unknown as ArticleRow[]).filter((a) => a.ingredient?.is_active);
  const regles = new Map<string, RegleArticle>();
  const sortie = articles.map((a) => {
    const offre = choisirOffre(offres.parProduit.get(a.ingredient_id) ?? [], f.ficheId);
    const prix_uc = prixUniteCommande(a, offre);
    const prix_element = a.commande_element_permise ? prixUniteCommande(a, offre, true) : null;
    regles.set(a.ingredient_id, { prix_uc, contenu_nb: Number(a.contenu_nb), element_permis: a.commande_element_permise, au_poids: a.unite_commande === "kg" || a.unite_commande === "litre" });
    return {
      ingredient_id: a.ingredient_id,
      nom: a.ingredient.name,
      rayon: a.ingredient.rayon_commande,
      precommande: a.precommande,
      au_poids: a.unite_commande === "kg" || a.unite_commande === "litre",
      unite_uc: libelleColisage({ ...a, contenu_nb: Number(a.contenu_nb) }),
      unite_element: libelleElement(a),
      prix_uc,
      prix_element,
      ref: offre?.supplier_sku ?? null,
    };
  });

  // Achats des 90 derniers jours : factures (converties par le montant) + commandes pas encore facturées
  const achats: AchatBrut[] = [];
  const dateFacture = new Map((factures ?? []).map((x) => [x.id as string, String(x.invoice_date)]));
  let derniereFacture = "";
  if (dateFacture.size) {
    const { data: lignesFact } = await supabaseAdmin.from("supplier_invoice_lines")
      .select("invoice_id, sku, total_price").in("invoice_id", [...dateFacture.keys()]);
    for (const l of lignesFact ?? []) {
      const ing = l.sku ? offres.produitParRef.get(l.sku) : undefined;
      const date = dateFacture.get(l.invoice_id as string);
      if (!ing || !date) continue;
      achats.push({ ingredient_id: ing, date, montant: Number(l.total_price) });
      if (date > derniereFacture) derniereFacture = date;
    }
  }
  const { data: envoyees } = await supabaseAdmin.from("commande_sessions").select("id, created_at")
    .eq("supplier_id", f.ficheId).eq("etablissement_id", etabId)
    .in("status", ["validee", "envoyee", "recue"]).gte("created_at", depuis);
  const dateCommande = new Map((envoyees ?? [])
    .map((s) => [s.id as string, String(s.created_at).slice(0, 10)] as const)
    .filter(([, d]) => d > derniereFacture));
  if (dateCommande.size) {
    const elementParProduit = new Map(sortie.map((s) => [s.ingredient_id, s.unite_element]));
    const { data: lignesCmd } = await supabaseAdmin.from("commande_lignes")
      .select("session_id, ingredient_id, quantite, unite").in("session_id", [...dateCommande.keys()]);
    for (const l of lignesCmd ?? []) {
      const date = dateCommande.get(l.session_id as string);
      if (!date) continue;
      const mode = l.unite && l.unite === elementParProduit.get(l.ingredient_id as string) ? "element" : "uc";
      achats.push({ ingredient_id: l.ingredient_id as string, date, quantite: Number(l.quantite), mode });
    }
  }
  const habituels = calculerHabituels(achats, regles);

  // Brouillon en cours : lignes et détail par personne
  let lignes: { ingredient_id: string; unite: string | null; quantite: number; apports: { user_id: string; nom: string; quantite: number }[] }[] = [];
  if (session) {
    const { data: ls } = await supabaseAdmin.from("commande_lignes")
      .select("id, ingredient_id, unite, quantite, commande_ligne_apports(user_id, quantite)")
      .eq("session_id", session.id);
    const userIds = new Set<string>();
    for (const l of ls ?? []) for (const a of (l.commande_ligne_apports ?? []) as { user_id: string }[]) userIds.add(a.user_id);
    const { data: profils } = userIds.size
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", [...userIds])
      : { data: [] as { id: string; display_name: string | null }[] };
    const nomDe = new Map((profils ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? "?"]));
    lignes = (ls ?? []).map((l) => ({
      ingredient_id: l.ingredient_id as string,
      unite: l.unite as string | null,
      quantite: Number(l.quantite),
      apports: ((l.commande_ligne_apports ?? []) as { user_id: string; quantite: number }[])
        .filter((a) => Number(a.quantite) > 0)
        .map((a) => ({ user_id: a.user_id, nom: nomDe.get(a.user_id) ?? "?", quantite: Number(a.quantite) })),
    }));
  }

  return rep({
    fournisseur: { id: f.ficheId, nom: f.nom },
    moi: userId,
    rayons: rayons ?? [],
    articles: sortie.map((s) => ({ ...s, habituel: habituels.get(s.ingredient_id) ?? null })),
    session: session ? { id: session.id, status: session.status } : null,
    lignes,
  });
}

/** Fixe la quantité de l'utilisateur sur un produit du brouillon (0 = retrait) */
export async function fixerApport(body: unknown, etabId: string, userId: string): Promise<Reponse> {
  const { supplier_id, ingredient_id, mode } = body as { supplier_id?: string; ingredient_id?: string; mode?: string };
  const quantiteBrute = Number((body as { quantite?: unknown }).quantite);
  if (!supplier_id || !ingredient_id || (mode !== "uc" && mode !== "element") || !Number.isFinite(quantiteBrute) || quantiteBrute < 0) {
    return rep({ error: "Paramètres invalides" }, 400);
  }

  const f = await resoudreFiche(supplier_id, etabId);
  if (!f) return rep({ error: "Ce fournisseur n'est pas en commande simplifiée pour cet établissement" }, 404);

  const { data: artData } = await supabaseAdmin.from("commande_articles")
    .select("ingredient_id, unite_commande, contenu_nb, element, element_qte, element_unite, commande_element_permise, precommande, ingredient:ingredients!inner(id, name, is_active, rayon_commande)")
    .eq("supplier_id", f.ficheId).eq("ingredient_id", ingredient_id).maybeSingle();
  const article = artData as unknown as ArticleRow | null;
  if (!article || !article.ingredient?.is_active) return rep({ error: "Produit introuvable chez ce fournisseur" }, 404);
  if (mode === "element" && !article.commande_element_permise) return rep({ error: "Ce produit se commande uniquement par " + libelleColisage(article) }, 400);

  const auPoids = article.unite_commande === "kg" || article.unite_commande === "litre";
  const quantite = mode === "uc" && auPoids ? Math.round(quantiteBrute * 2) / 2 : Math.round(quantiteBrute);
  const unite = mode === "element" ? libelleElement(article)! : libelleColisage({ ...article, contenu_nb: Number(article.contenu_nb) });

  // Brouillon de l'établissement (créé à la première saisie)
  let session = await sessionEnCours(f.ficheId, etabId);
  if (session && session.status !== "brouillon") {
    return rep({ error: "Commande validée : repasse-la en brouillon pour la modifier" }, 409);
  }
  if (!session) {
    if (quantite === 0) return rep({ ok: true, session_id: null });
    const { data: cree, error } = await supabaseAdmin.from("commande_sessions")
      .insert({ supplier_id: f.ficheId, etablissement_id: etabId, status: "brouillon", created_by: userId })
      .select("id, status, created_at").single();
    if (error) return rep({ error: error.message }, 500);
    session = cree as { id: string; status: string; created_at: string };
  }

  const { parProduit } = await chargerOffres(f.aliasIds);
  const offre = choisirOffre(parProduit.get(ingredient_id) ?? [], f.ficheId);
  const prix = prixUniteCommande(article, offre, mode === "element");

  const { data: existante } = await supabaseAdmin.from("commande_lignes").select("id")
    .eq("session_id", session.id).eq("ingredient_id", ingredient_id).eq("unite", unite)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  let ligneId = existante?.id as string | undefined;
  if (!ligneId) {
    if (quantite === 0) return rep({ ok: true, session_id: session.id });
    const { data: nouvelle, error } = await supabaseAdmin.from("commande_lignes")
      .insert({ session_id: session.id, ingredient_id, quantite: 0, unite, prix_unitaire_ht: prix, total_ligne_ht: 0 })
      .select("id").single();
    if (error) return rep({ error: error.message }, 500);
    ligneId = nouvelle.id as string;
  } else {
    await supabaseAdmin.from("commande_lignes").update({ prix_unitaire_ht: prix }).eq("id", ligneId);
  }

  // Quantité de CETTE personne ; le total de la ligne est recalculé par la base
  if (quantite > 0) {
    const { error } = await supabaseAdmin.from("commande_ligne_apports")
      .upsert({ ligne_id: ligneId, user_id: userId, quantite, updated_at: new Date().toISOString() }, { onConflict: "ligne_id,user_id" });
    if (error) return rep({ error: error.message }, 500);
  } else {
    await supabaseAdmin.from("commande_ligne_apports").delete().eq("ligne_id", ligneId).eq("user_id", userId);
    const { count } = await supabaseAdmin.from("commande_ligne_apports").select("id", { count: "exact", head: true }).eq("ligne_id", ligneId);
    if (!count) await supabaseAdmin.from("commande_lignes").delete().eq("id", ligneId);
  }

  const { data: totaux } = await supabaseAdmin.from("commande_lignes").select("total_ligne_ht").eq("session_id", session.id);
  const total = (totaux ?? []).reduce((s, l) => s + (Number(l.total_ligne_ht) || 0), 0);
  await supabaseAdmin.from("commande_sessions").update({ total_ht: Math.round(total * 100) / 100, updated_at: new Date().toISOString() }).eq("id", session.id);

  return rep({ ok: true, session_id: session.id });
}

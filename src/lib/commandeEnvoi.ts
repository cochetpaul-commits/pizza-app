import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mapToPermRole } from "@/lib/permissions";
import { libelleColisage, libelleElement, nomUnite, quantiteLisible, taille, type CommandeArticle } from "@/lib/commandeArticles";
import { prochaineLivraison, type RegleLivraison } from "@/lib/commandeLivraison";

/**
 * Envoi d'une commande fournisseur : données communes au mail, à l'écran de confirmation et au PDF.
 * - destinataires : uniquement les contacts cochés « Commandes » (supplier_contacts.send_orders)
 * - livraison : prochaine date d'après suppliers.delivery_schedule, adresse de l'établissement
 * - lignes : rayon, produit, quantité lisible (éléments et colis), référence fournisseur
 */

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Équipier : seulement les fournisseurs en commande simplifiée ; manager et admin : tous */
export function peutValiderEnvoyer(role: string | null | undefined, commandeSimplifiee: boolean): boolean {
  if (!role) return false;
  const r = mapToPermRole(role);
  if (r === "admin" || r === "manager") return true;
  return commandeSimplifiee;
}

/** Message d'erreur si l'utilisateur ne peut pas valider ni envoyer pour ce fournisseur, sinon null */
export async function refusDroit(userId: string, supplierId: string): Promise<string | null> {
  const [{ data: profil }, { data: fournisseur }] = await Promise.all([
    supabaseAdmin.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("suppliers").select("commande_simplifiee").eq("id", supplierId).maybeSingle(),
  ]);
  if (peutValiderEnvoyer(profil?.role as string | null, !!fournisseur?.commande_simplifiee)) return null;
  return "Seuls un manager ou un admin peuvent valider et envoyer les commandes de ce fournisseur.";
}

export type LigneEnvoi = { rayon: string; rayonOrdre: number; nom: string; quantite: number; unite: string; texte: string; ref: string | null };
export type Envoi = {
  session: { id: string; status: string; notes: string | null; created_at: string; email_sent_at: string | null; supplier_id: string };
  fournisseur: { id: string; nom: string; simplifiee: boolean; numero_client: string | null; pied: string | null };
  /** Prénom de la personne qui envoie (ou qui a envoyé) la commande */
  envoyeur: string | null;
  /** Date de la commande = date d'envoi (heure de Paris), « 28 septembre 2026 » */
  dateCommande: string;
  etab: { nom: string; adresse: string | null };
  livraison: { date: string; libelle: string } | null;
  lignes: LigneEnvoi[];
  totalHt: number;
  destinataires: string[];
};

/** Tri alphabétique français sans accents ni casse : « Crème » et « Creme » se suivent, « Œuf » avec les O */
export const ordreAlpha = (a: string, b: string) => a.localeCompare(b, "fr", { sensitivity: "base" });

/** Date en heure de Paris, quel que soit le fuseau du serveur (UTC sur Vercel) */
export const dateParis = (d: Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) =>
  d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", ...opts });

export async function chargerEnvoi(sessionId: string, etabId: string, quand: Date = new Date(), userId?: string): Promise<Envoi | null> {
  const { data: s } = await supabaseAdmin
    .from("commande_sessions")
    .select("id, status, notes, created_at, email_sent_at, supplier_id, suppliers(id, name, commande_simplifiee, delivery_schedule, client_code, pied_commande)")
    .eq("id", sessionId).eq("etablissement_id", etabId).maybeSingle();
  if (!s) return null;
  const sup = s.suppliers as unknown as { id: string; name: string; commande_simplifiee: boolean; delivery_schedule: RegleLivraison[] | null; client_code: string | null; pied_commande: string | null };

  const [{ data: etab }, { data: contacts }, { data: lignes }, { data: memes }, { data: rayons }] = await Promise.all([
    supabaseAdmin.from("etablissements").select("nom, adresse").eq("id", etabId).single(),
    supabaseAdmin.from("supplier_contacts").select("email, send_orders").eq("supplier_id", sup.id),
    supabaseAdmin.from("commande_lignes")
      .select("ingredient_id, quantite, unite, total_ligne_ht, ingredients(name, category, rayon_commande, supplier_sku)")
      .eq("session_id", sessionId).gt("quantite", 0),
    supabaseAdmin.from("suppliers").select("id, name"),
    supabaseAdmin.from("rayons_commande").select("code, libelle, ordre"),
  ]);

  // Références : offre active de la fiche, sinon d'une fiche homonyme (Maël Bello / Maël Piccola)
  const aliasIds = (memes ?? []).filter((x) => norm(x.name) === norm(sup.name)).map((x) => x.id as string);
  const ingIds = [...new Set((lignes ?? []).map((l) => l.ingredient_id as string))];
  const refs = new Map<string, string>();
  const typePrix = new Map<string, string>();
  if (ingIds.length) {
    const { data: offres } = await supabaseAdmin.from("supplier_offers")
      .select("ingredient_id, supplier_id, supplier_sku, price_kind").eq("is_active", true)
      .in("supplier_id", aliasIds.length ? aliasIds : [sup.id]).in("ingredient_id", ingIds);
    for (const o of (offres ?? []).sort((a, b) => Number(b.supplier_id === sup.id) - Number(a.supplier_id === sup.id))) {
      if (o.supplier_sku && !refs.has(o.ingredient_id as string)) refs.set(o.ingredient_id as string, o.supplier_sku as string);
      if (o.price_kind && !typePrix.has(o.ingredient_id as string)) typePrix.set(o.ingredient_id as string, o.price_kind as string);
    }
  }
  // Colisage (commande simplifiée) pour écrire « 2 colis 6 × 500 g (12 pots) »
  const articles = new Map<string, CommandeArticle>();
  if (sup.commande_simplifiee && ingIds.length) {
    const { data: arts } = await supabaseAdmin.from("commande_articles")
      .select("ingredient_id, unite_commande, contenu_nb, element, element_qte, element_unite, commande_element_permise, precommande")
      .eq("supplier_id", sup.id).in("ingredient_id", ingIds);
    for (const a of arts ?? []) articles.set(a.ingredient_id as string, { ...(a as unknown as CommandeArticle), contenu_nb: Number(a.contenu_nb) });
  }
  const rayonDe = new Map((rayons ?? []).map((r) => [r.code as string, { libelle: r.libelle as string, ordre: r.ordre as number }]));

  const sortie: LigneEnvoi[] = (lignes ?? []).map((l) => {
    const ing = l.ingredients as unknown as { name: string; category: string | null; rayon_commande: string | null; supplier_sku: string | null } | null;
    const a = articles.get(l.ingredient_id as string);
    const q = Number(l.quantite);
    const unite = (l.unite as string | null) ?? "";
    let texte = `${String(q).replace(".", ",")} ${unite}`.trim();
    if (a) {
      const auPoids = a.unite_commande === "kg" || a.unite_commande === "litre";
      const mode = unite === libelleElement(a) ? "element" : "uc";
      const lisible = quantiteLisible({ au_poids: auPoids, contenu_nb: a.contenu_nb, element: a.element, unite_commande: a.unite_commande }, q, mode);
      const nb = a.contenu_nb;
      if (auPoids) texte = `${lisible} ${libelleColisage(a)}`;
      // Vendu au colis par le fournisseur (œufs en carton de 90) : son unité d'abord, « 2 cartons (180 pièces) »
      else if (mode === "uc" && nb > 1 && typePrix.get(l.ingredient_id as string) === "pack_composed")
        texte = `${String(q).replace(".", ",")} ${nomUnite(a.unite_commande, q)} (${String(q * nb).replace(".", ",")} ${nomUnite(a.element ?? "piece", q * nb)})`;
      else if (mode === "element") texte = lisible;
      else if (a.contenu_nb > 1) texte = `${lisible} — ${libelleColisage(a)}`;
      // Unité simple : « 4 pièces », « 9 pièces de 2,5 kg », « 1 colis de 2 kg »
      else texte = `${String(q).replace(".", ",")} ${nomUnite(a.unite_commande, q)}${a.element_qte != null && a.element_unite ? ` de ${taille(a.element_qte, a.element_unite)}` : ""}`;
    }
    const rayon = ing?.rayon_commande ? rayonDe.get(ing.rayon_commande) : undefined;
    return {
      rayon: rayon?.libelle ?? "Autres produits",
      rayonOrdre: rayon?.ordre ?? 99,
      nom: ing?.name ?? "?",
      quantite: q,
      unite,
      texte,
      ref: refs.get(l.ingredient_id as string) ?? ing?.supplier_sku ?? null,
    };
  }).sort((x, y) => x.rayonOrdre - y.rayonOrdre || ordreAlpha(x.nom, y.nom));

  // Qui commande : la personne qui a envoyé (journal), sinon celle qui envoie maintenant
  let envoyeurId = userId ?? null;
  if (s.status === "envoyee" || s.status === "recue") {
    const { data: dernier } = await supabaseAdmin.from("commande_envois").select("envoye_par")
      .eq("session_id", sessionId).eq("succes", true).order("envoye_le", { ascending: false }).limit(1).maybeSingle();
    if (dernier?.envoye_par) envoyeurId = dernier.envoye_par as string;
  }
  let envoyeur: string | null = null;
  if (envoyeurId) {
    const { data: p } = await supabaseAdmin.from("profiles").select("display_name").eq("id", envoyeurId).maybeSingle();
    const nom = String(p?.display_name ?? "").trim();
    envoyeur = nom ? nom.split(/\s+/)[0] : null;
    if (envoyeur) envoyeur = envoyeur.charAt(0).toUpperCase() + envoyeur.slice(1).toLowerCase();
  }
  const dateEnvoi = s.email_sent_at && (s.status === "envoyee" || s.status === "recue") ? new Date(s.email_sent_at) : quand;

  const destinataires = [...new Set((contacts ?? []).filter((c) => c.send_orders && c.email).map((c) => String(c.email).trim()))];
  const totalHt = Math.round((lignes ?? []).reduce((t, l) => t + (Number(l.total_ligne_ht) || 0), 0) * 100) / 100;

  return {
    session: { id: s.id, status: s.status, notes: s.notes, created_at: s.created_at, email_sent_at: s.email_sent_at, supplier_id: s.supplier_id },
    fournisseur: { id: sup.id, nom: sup.name, simplifiee: !!sup.commande_simplifiee, numero_client: sup.client_code ?? null, pied: sup.pied_commande ?? null },
    envoyeur,
    dateCommande: dateParis(dateEnvoi),
    etab: { nom: etab?.nom ?? "Restaurant", adresse: etab?.adresse ?? null },
    livraison: prochaineLivraison(sup.delivery_schedule, quand),
    lignes: sortie,
    totalHt,
    destinataires,
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Corps du mail, lisible sur téléphone : une ligne par produit (quantité en gras, produit, référence),
 * regroupée par rayon, puis date et adresse de livraison. Pas de tableau large.
 */
export function corpsMail(e: Envoi, remplace: string | null): string {
  const parRayon = new Map<string, LigneEnvoi[]>();
  for (const l of e.lignes) parRayon.set(l.rayon, [...(parRayon.get(l.rayon) ?? []), l]);
  const blocs = [...parRayon.entries()].map(([rayon, ls]) => `
    <div style="margin:18px 0 6px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#D4775A">${esc(rayon)}</div>
    ${ls.map((l) => `
    <div style="padding:9px 0;border-bottom:1px solid #eee4d6">
      <div style="font-size:15px;color:#1a1a1a"><strong>${esc(l.texte)}</strong></div>
      <div style="font-size:14px;color:#1a1a1a">${esc(l.nom)}</div>
      ${l.ref ? `<div style="font-size:12px;color:#8a8378">Réf. ${esc(l.ref)}</div>` : ""}
    </div>`).join("")}`).join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f2ede4;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:20px 18px">
    <div style="font-size:18px;font-weight:700;color:#1a1a1a">Bon de commande — ${esc(e.etab.nom)}</div>
    <div style="margin-top:4px;font-size:13px;color:#6f6656">${e.fournisseur.numero_client ? `N° client ${esc(e.fournisseur.numero_client)} · ` : ""}${esc(e.dateCommande)}${e.envoyeur ? ` · Commande passée par ${esc(e.envoyeur)}` : ""}</div>
    ${remplace ? `<div style="margin-top:10px;padding:10px 12px;background:#fbf0dc;border-radius:8px;font-size:13px;color:#7a5a2b">Cette commande remplace celle envoyée le ${esc(remplace)}.</div>` : ""}
    <div style="margin-top:12px;font-size:14px;color:#1a1a1a;line-height:1.5">
      Bonjour,<br>Voici notre commande (${e.lignes.length} produit${e.lignes.length > 1 ? "s" : ""}). Le bon de commande est aussi en pièce jointe.
    </div>
    <div style="margin-top:14px;padding:12px;background:#f7f3ec;border-radius:10px;font-size:14px;color:#1a1a1a;line-height:1.5">
      ${e.livraison ? `<strong>Livraison : ${esc(e.livraison.libelle)}</strong><br>` : ""}
      ${e.etab.adresse ? `${esc(e.etab.nom)}, ${esc(e.etab.adresse)}` : esc(e.etab.nom)}
    </div>
    ${blocs}
    ${e.session.notes ? `<div style="margin-top:16px;padding:10px 12px;background:#f7f3ec;border-radius:8px;font-size:14px"><strong>Notes :</strong> ${esc(e.session.notes)}</div>` : ""}
    <div style="margin-top:20px;font-size:14px;color:#1a1a1a">Merci,<br>${esc(e.etab.nom)}</div>
    ${e.fournisseur.pied ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #eee4d6;font-size:13px;color:#6f6656">${esc(e.fournisseur.pied)}</div>` : ""}
  </div></body></html>`;
}

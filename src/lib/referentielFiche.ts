import { supabase } from "@/lib/supabaseClient";

/**
 * Référentiel de la fiche technique (10/10/2026) : familles, catégories, produits de la Base,
 * offres fournisseurs, empâtements, touches Popina, fournisseurs, sous-catégories existantes.
 * Avant, chaque ouverture de fiche rechargeait tout (1 900 produits, 1 300 offres…) : plusieurs
 * secondes à chaque clic. Maintenant : chargé une fois, gardé en mémoire et dans sessionStorage,
 * resservi tout de suite et rafraîchi en arrière-plan s'il a plus de deux minutes.
 * La Carte le précharge dès son ouverture pour que la première fiche s'ouvre sans attendre.
 *
 * Vécu 11/10 : un préchargement parti avant que la session soit prête recevait des listes vides
 * (lecture réservée aux utilisateurs connectés) et les gardait en mémoire : plus de catégories dans
 * la fiche (« Pizza » seule, impossible de changer), sous-catégories non rattachées. Désormais un
 * référentiel n'est gardé que s'il est complet (aucune erreur, familles et catégories présentes).
 */
export type Ligne = Record<string, unknown>;
export type ReferentielFiche = {
  familles: Ligne[];
  categories: Ligne[];
  ingredients: Ligne[];
  empatements: { id: string; name: string }[];
  offres: Ligne[];
  popina: { id: string; name: string; category: string; price_ttc: number; kitchen_recipe_id: string | null }[];
  fournisseurs: Record<string, string>;
  sousCategories: { category: string; sous_categorie: string }[];
  quand: number;
};

const FRAIS_MS = 2 * 60 * 1000;
const memoire = new Map<string, ReferentielFiche>();
const enCours = new Map<string, Promise<ReferentielFiche>>();
const cle = (slug: string) => `referentiel-fiche:v2:${slug}`;

/** Complet = chargé sans erreur, avec familles et catégories : seul un référentiel complet est gardé */
const complet = (r: Pick<ReferentielFiche, "familles" | "categories">) => Array.isArray(r.familles) && r.familles.length > 0 && Array.isArray(r.categories) && r.categories.length > 0;

async function charger(slug: string): Promise<ReferentielFiche> {
  const etab = slug === "piccola" ? "piccola" : "bellomio";
  // Pas de session : les tables ne renvoient rien. On attend qu'elle soit là plutôt que de garder du vide.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Session pas encore prête");
  const [f, c, i, e, o, p, sc] = await Promise.all([
    supabase.from("familles").select("*"),
    supabase.from("categories").select("*").order("sort_order").order("nom").or(`establishments.cs.{"${etab}"},establishments.is.null`),
    supabase.from("ingredients").select("id, name, category, allergens, cost_per_unit, cost_per_kg, purchase_price, purchase_unit, purchase_unit_label, density_g_per_ml, piece_weight_g, piece_volume_ml, establishments, source")
      .or(`establishments.cs.{"${etab}"},establishments.is.null`),
    supabase.from("recipes").select("id, name").order("name"),
    supabase.from("v_latest_offers").select("*"),
    supabase.from("popina_products").select("id, name, category, price_ttc, kitchen_recipe_id").eq("active", true).order("name"),
    supabase.from("kitchen_recipes").select("category, sous_categorie").not("sous_categorie", "is", null),
  ]);
  const erreur = [f, c, i, e, o, p, sc].find((r) => r.error)?.error;
  const offres = (o.data ?? []) as Ligne[];
  const idsFournisseurs = [...new Set(offres.map((x) => String(x.supplier_id ?? "")).filter(Boolean))];
  const fournisseurs: Record<string, string> = {};
  if (idsFournisseurs.length) {
    const { data: sups } = await supabase.from("suppliers").select("id,name").in("id", idsFournisseurs);
    for (const s of (sups ?? []) as { id: string; name: string }[]) if (s.id && s.name) fournisseurs[s.id] = s.name;
  }
  const ref: ReferentielFiche = {
    familles: (f.data ?? []) as Ligne[],
    categories: (c.data ?? []) as Ligne[],
    ingredients: (i.data ?? []) as Ligne[],
    empatements: ((e.data ?? []) as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name.trim() })),
    offres,
    popina: (p.data ?? []) as ReferentielFiche["popina"],
    fournisseurs,
    sousCategories: (sc.data ?? []) as { category: string; sous_categorie: string }[],
    quand: Date.now(),
  };
  if (erreur || !complet(ref)) {
    // Rien n'est gardé : la prochaine ouverture rechargera. La fiche reçoit quand même ce qui est arrivé.
    console.warn("[referentiel-fiche] incomplet, non conservé", erreur?.message ?? "familles ou catégories vides");
    return ref;
  }
  memoire.set(slug, ref);
  try { sessionStorage.setItem(cle(slug), JSON.stringify(ref)); } catch { /* quota ou navigation privée */ }
  return ref;
}

function lireCopie(slug: string): ReferentielFiche | null {
  const m = memoire.get(slug);
  if (m && complet(m)) return m;
  try {
    const brut = sessionStorage.getItem(cle(slug));
    if (!brut) return null;
    const r = JSON.parse(brut) as ReferentielFiche;
    if (Array.isArray(r.ingredients) && Array.isArray(r.offres) && typeof r.quand === "number" && complet(r)) { memoire.set(slug, r); return r; }
  } catch { /* copie illisible */ }
  return null;
}

/** Référentiel du moment : la copie tout de suite si elle existe (rafraîchie en arrière-plan si vieille), sinon chargé */
export function chargerReferentielFiche(slug: string, { fresh = false } = {}): Promise<ReferentielFiche> {
  const copie = fresh ? null : lireCopie(slug);
  if (copie) {
    if (Date.now() - copie.quand > FRAIS_MS && !enCours.has(slug)) {
      const p = charger(slug).finally(() => enCours.delete(slug)).catch(() => copie);
      enCours.set(slug, p);
    }
    return Promise.resolve(copie);
  }
  let p = enCours.get(slug);
  if (!p) { p = charger(slug).finally(() => enCours.delete(slug)); enCours.set(slug, p); }
  return p;
}

/** À appeler dès qu'une page qui ouvre des fiches s'affiche : la première fiche s'ouvre sans attendre */
export function prechargerReferentielFiche(slug: string) {
  void chargerReferentielFiche(slug).catch(() => { /* la fiche rechargera elle-même */ });
}

/** Après une modification qui touche le référentiel (produit créé par une fiche, offre fermée…) */
export function invaliderReferentielFiche(slug?: string) {
  for (const s of slug ? [slug] : [...memoire.keys()]) { memoire.delete(s); try { sessionStorage.removeItem(cle(s)); } catch { /* */ } }
}

/**
 * Pour la fiche elle-même : réessaie (session pas prête, réseau) jusqu'à obtenir un référentiel
 * complet, trois fois au plus ; renvoie le dernier obtenu sinon.
 */
export async function chargerReferentielFicheSur(slug: string): Promise<ReferentielFiche> {
  let dernier: ReferentielFiche | null = null;
  for (let essai = 0; essai < 4; essai++) {
    try {
      const r = await chargerReferentielFiche(slug, { fresh: essai > 0 });
      if (complet(r)) return r;
      dernier = r;
    } catch { /* session pas prête : on attend un peu */ }
    await new Promise((ok) => setTimeout(ok, 600 * (essai + 1)));
  }
  if (dernier) return dernier;
  return { familles: [], categories: [], ingredients: [], empatements: [], offres: [], popina: [], fournisseurs: {}, sousCategories: [], quand: Date.now() };
}

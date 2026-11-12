import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError, callerProfile } from "@/lib/getEtablissement";
import { acteurAction } from "@/lib/tablette/acteur";
import { genererQuiz, resumeEquipe, score, type Question, type QuestionRepondue, type SessionQuiz, type VinQuiz } from "@/lib/quizVins";
import { classementMois, genererQuizCarte, jourParis, lundiDe, nomIngredient, type PlatQuiz, type SerieSemaine } from "@/lib/quizCarte";

export const dynamic = "force-dynamic";

/**
 * Quiz (12/11/2026) : la carte, les vins, et le quiz de la semaine (les deux mélangés) qui compte pour le
 * classement du mois. Les questions sont fabriquées depuis les fiches (Cave, touches Popina, fiches techniques).
 * GET  ?theme=carte|vins|semaine&filtre=…  → les questions
 * GET  ?etat=1&mois=AAAA-MM                → ma semaine, le classement du mois ; responsables : l'équipe sur 90 jours
 * POST { theme, filtre, questions }        → enregistre la série au nom de l'employé (tablette) ou du compte ;
 *                                            le score est recalculé ici ; un seul quiz de la semaine par personne
 */
const THEMES = ["carte", "vins", "semaine"] as const;
type Theme = (typeof THEMES)[number];
const NB = 10;
/** Les familles de la caisse posées dans le quiz carte : les plats, ceux qui ont une fiche technique */
const CUISINE = ["ANTIPASTI", "PIZZE", "CUCINA", "DOLCI"];

async function auth(req: NextRequest) {
  try { return await getEtablissement(req); } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
const cleDe = (employeId: string | null, userId: string | null, nom: string) => employeId ?? `${userId ?? ""}:${nom}`;

async function vinsDeLaCarte(couleur: string | null): Promise<VinQuiz[]> {
  const [{ data: vins }, { data: accords }] = await Promise.all([
    supabaseAdmin.from("vins").select("id, nom, couleur, cepages, region, appellation, domaine, bouche, pitch, prix").eq("sur_carte", true),
    supabaseAdmin.from("vins_accords").select("vin_id, plat_nom"),
  ]);
  const accordsDe = new Map<string, string[]>();
  for (const x of accords ?? []) accordsDe.set(x.vin_id as string, [...(accordsDe.get(x.vin_id as string) ?? []), String(x.plat_nom)]);
  const liste: VinQuiz[] = (vins ?? []).map((v) => ({
    id: v.id as string, nom: String(v.nom), couleur: String(v.couleur ?? ""), cepages: v.cepages as string | null, region: v.region as string | null,
    appellation: v.appellation as string | null, domaine: v.domaine as string | null, bouche: v.bouche as string | null, pitch: v.pitch as string | null,
    prix: (v.prix as VinQuiz["prix"]) ?? null, accords: accordsDe.get(v.id as string) ?? [],
  }));
  return couleur && couleur !== "tous" ? liste.filter((v) => v.couleur === couleur) : liste;
}

function lireAllergenes(brut: unknown): string[] {
  if (Array.isArray(brut)) return brut.filter((x): x is string => typeof x === "string");
  if (typeof brut === "string") { try { const v = JSON.parse(brut); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; } }
  return [];
}
/**
 * Les plats de la carte qui ont une fiche technique, et les préparations maison qui entrent dans ces plats.
 * Les allergènes sont ceux de la fiche, préparations comprises (comme dans la Carte) ; une pizza porte le gluten
 * de sa pâte, qui n'est pas une ligne de la fiche.
 */
async function fichesDeLaCarte(filtre: string | null): Promise<PlatQuiz[]> {
  const [{ data: touches }, { data: fiches }, { data: lignes }] = await Promise.all([
    supabaseAdmin.from("popina_products").select("id, name, category, kitchen_recipe_id").eq("active", true).in("category", CUISINE).not("kitchen_recipe_id", "is", null),
    supabaseAdmin.from("kitchen_recipes").select("id, name, category, output_ingredient_id"),
    supabaseAdmin.from("kitchen_recipe_lines").select("recipe_id, ingredient_id, sort_order, ingredients(name, allergens)").order("sort_order").limit(5000),
  ]);
  type Ligne = { recipe_id: string; ingredient_id: string | null; nom: string; allergenes: string[] };
  const lignesDe = new Map<string, Ligne[]>();
  for (const l of (lignes ?? []) as unknown as { recipe_id: string; ingredient_id: string | null; ingredients: { name: string; allergens: unknown } | { name: string; allergens: unknown }[] | null }[]) {
    const ing = Array.isArray(l.ingredients) ? l.ingredients[0] : l.ingredients;
    if (!ing?.name) continue;
    lignesDe.set(l.recipe_id, [...(lignesDe.get(l.recipe_id) ?? []), { recipe_id: l.recipe_id, ingredient_id: l.ingredient_id, nom: ing.name, allergenes: lireAllergenes(ing.allergens) }]);
  }
  const ficheParId = new Map((fiches ?? []).map((f) => [f.id as string, f]));
  const ficheParSortie = new Map((fiches ?? []).filter((f) => f.output_ingredient_id).map((f) => [f.output_ingredient_id as string, f.id as string]));
  const allergenesDe = (ficheId: string, vus = new Set<string>()): Set<string> => {
    const out = new Set<string>();
    if (vus.has(ficheId)) return out;
    vus.add(ficheId);
    for (const l of lignesDe.get(ficheId) ?? []) {
      for (const x of l.allergenes) out.add(x);
      const sous = l.ingredient_id ? ficheParSortie.get(l.ingredient_id) : undefined;
      if (sous) for (const x of allergenesDe(sous, vus)) out.add(x);
    }
    return out;
  };
  const contenu = (ficheId: string) => {
    const al = allergenesDe(ficheId);
    if (ficheParId.get(ficheId)?.category === "pizza") al.add("Gluten");
    return { ingredients: (lignesDe.get(ficheId) ?? []).map((l) => l.nom), allergenes: [...al].sort((x, y) => x.localeCompare(y, "fr")) };
  };

  const vus = new Set<string>(); const plats: PlatQuiz[] = []; const fichesDesPlats: string[] = [];
  for (const t of touches ?? []) {
    const nom = String(t.name ?? "").trim(); const cle = nom.toLowerCase(); const ficheId = t.kitchen_recipe_id as string;
    if (!nom || vus.has(cle) || !(lignesDe.get(ficheId)?.length)) continue;
    vus.add(cle); fichesDesPlats.push(ficheId);
    plats.push({ id: t.id as string, nom, categorie: String(t.category ?? ""), ...contenu(ficheId) });
  }
  // Les préparations maison qui entrent dans ces plats (et celles qui entrent dans ces préparations)
  const preps = new Map<string, PlatQuiz>();
  const pile = [...fichesDesPlats]; const parcourues = new Set<string>();
  while (pile.length) {
    const id = pile.pop() as string;
    if (parcourues.has(id)) continue;
    parcourues.add(id);
    for (const l of lignesDe.get(id) ?? []) {
      const sous = l.ingredient_id ? ficheParSortie.get(l.ingredient_id) : undefined;
      if (!sous || preps.has(sous) || !(lignesDe.get(sous)?.length)) continue;
      preps.set(sous, { id: sous, nom: nomIngredient(l.nom) || l.nom, categorie: "PREPARATIONS", preparation: true, ...contenu(sous) });
      pile.push(sous);
    }
  }
  if (filtre === "PREPARATIONS") return [...preps.values()];
  if (filtre && CUISINE.includes(filtre)) return plats.filter((p) => p.categorie === filtre);
  return [...plats, ...preps.values()];
}

function melanger<T>(liste: T[]): T[] {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Les séries « semaine » de l'établissement depuis une date */
async function seriesSemaine(etabId: string, depuis: string): Promise<SerieSemaine[]> {
  const { data } = await supabaseAdmin.from("quiz_sessions").select("employe_id, user_id, employe_nom, score, nb_questions, created_at")
    .eq("etablissement_id", etabId).eq("theme", "semaine").gte("created_at", depuis).order("created_at").limit(1000);
  return (data ?? []).map((s) => ({ cle: cleDe(s.employe_id as string | null, s.user_id as string | null, String(s.employe_nom)), nom: String(s.employe_nom), score: Number(s.score), nb_questions: Number(s.nb_questions), created_at: String(s.created_at) }));
}
/** Le quiz de la semaine déjà joué par cette personne, s'il y en a un */
async function maSemaine(etabId: string, cle: string) {
  const lundi = lundiDe(jourParis(new Date()));
  // Deux jours de marge sur le fuseau, le tri se fait sur le jour à Paris
  const series = await seriesSemaine(etabId, new Date(new Date(`${lundi}T00:00:00Z`).getTime() - 2 * 86400000).toISOString());
  return series.find((s) => s.cle === cle && lundiDe(jourParis(s.created_at)) === lundi) ?? null;
}

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if (a instanceof NextResponse) return a;
  const sp = req.nextUrl.searchParams;

  if (sp.get("etat") === "1") {
    const acteur = await acteurAction(req, a.userId, a.etabId);
    const cle = cleDe(acteur.employeId, a.userId, acteur.nom);
    const mois = /^\d{4}-\d{2}$/.test(sp.get("mois") ?? "") ? (sp.get("mois") as string) : jourParis(new Date()).slice(0, 7);
    const [faite, series, p] = await Promise.all([
      maSemaine(a.etabId, cle),
      seriesSemaine(a.etabId, new Date(new Date(`${mois}-01T00:00:00Z`).getTime() - 2 * 86400000).toISOString()),
      callerProfile(req),
    ]);
    const responsable = !!p && ["group_admin", "manager"].includes(p.role ?? "");
    let equipe: ReturnType<typeof resumeEquipe> | null = null;
    if (responsable) {
      const depuis = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data } = await supabaseAdmin.from("quiz_sessions").select("employe_nom, score, nb_questions, created_at, questions")
        .eq("etablissement_id", a.etabId).gte("created_at", depuis).order("created_at", { ascending: false }).limit(1000);
      equipe = resumeEquipe((data ?? []) as SessionQuiz[]);
    }
    return NextResponse.json({
      moi: acteur.nom, mois, lundi: lundiDe(jourParis(new Date())),
      semaine: faite ? { score: faite.score, sur: faite.nb_questions } : null,
      classement: classementMois(series, mois), equipe,
    });
  }

  const theme = (THEMES as readonly string[]).includes(sp.get("theme") ?? "") ? (sp.get("theme") as Theme) : "carte";
  const filtre = sp.get("filtre");
  let questions: Question[] = [];
  if (theme === "vins") questions = genererQuiz(await vinsDeLaCarte(filtre), NB);
  else if (theme === "carte") {
    questions = genererQuizCarte(await fichesDeLaCarte(filtre), NB);
  } else {
    const acteur = await acteurAction(req, a.userId, a.etabId);
    const faite = await maSemaine(a.etabId, cleDe(acteur.employeId, a.userId, acteur.nom));
    if (faite) return NextResponse.json({ error: `Quiz de la semaine déjà fait : ${faite.score} / ${faite.nb_questions}. Le prochain ouvre lundi.` }, { status: 409 });
    // Six questions sur la carte, quatre sur les vins ; si l'un des deux manque, l'autre complète
    const [plats, vins] = await Promise.all([fichesDeLaCarte(null), vinsDeLaCarte(null)]);
    const qv = genererQuiz(vins, 4);
    const qc = genererQuizCarte(plats, NB - qv.length);
    questions = melanger([...qc, ...(qc.length + qv.length < NB ? genererQuiz(vins, NB - qc.length) : qv)]);
  }
  if (!questions.length) return NextResponse.json({ error: "Pas assez de fiches pour un quiz sur cette sélection (il en faut au moins 4)." }, { status: 400 });
  return NextResponse.json({ questions });
}

export async function POST(req: NextRequest) {
  const a = await auth(req);
  if (a instanceof NextResponse) return a;
  const body = (await req.json().catch(() => null)) as { theme?: string; filtre?: string | null; questions?: QuestionRepondue[] } | null;
  const questions = Array.isArray(body?.questions) ? body!.questions : [];
  if (!questions.length) return NextResponse.json({ error: "questions requises" }, { status: 400 });
  const theme = (THEMES as readonly string[]).includes(body?.theme ?? "") ? (body!.theme as Theme) : "carte";
  const acteur = await acteurAction(req, a.userId, a.etabId);
  if (theme === "semaine" && (await maSemaine(a.etabId, cleDe(acteur.employeId, a.userId, acteur.nom)))) {
    return NextResponse.json({ error: "Quiz de la semaine déjà enregistré pour toi." }, { status: 409 });
  }
  const s = score(questions);
  const { error } = await supabaseAdmin.from("quiz_sessions").insert({
    etablissement_id: a.etabId, user_id: a.userId, employe_id: acteur.employeId, employe_nom: acteur.nom, theme,
    filtre: body?.filtre ?? null, nb_questions: questions.length, score: s,
    questions: questions.map((q) => ({ type: q.type, vin_id: q.vin_id, vin_nom: q.vin_nom, question: q.question, options: q.options, bonne: q.bonne, reponse: q.reponse ?? null })),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, score: s, nom: acteur.nom });
}

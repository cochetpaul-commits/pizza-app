import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError, callerProfile } from "@/lib/getEtablissement";
import { acteurAction } from "@/lib/tablette/acteur";
import { genererQuiz, resumeEquipe, score, type Question, type QuestionRepondue, type SessionQuiz, type VinQuiz } from "@/lib/quizVins";
import { classementMois, genererQuizCarte, jourParis, lundiDe, type PlatQuiz, type SerieSemaine } from "@/lib/quizCarte";

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
/** Les familles de la caisse posées dans le quiz carte (les vins ont leur quiz, les messages ne sont pas des produits) */
const CUISINE = ["ANTIPASTI", "PIZZE", "CUCINA", "DOLCI"];
const BOISSONS = ["BEVANDE", "BEVANDE CALDE", "ALCOOL", "DIGESTIVI"];

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

async function platsDeLaCarte(familles: string[]): Promise<PlatQuiz[]> {
  const { data: touches } = await supabaseAdmin.from("popina_products").select("id, name, category, price_ttc, kitchen_recipe_id").eq("active", true).in("category", familles).gt("price_ttc", 0);
  const ficheIds = [...new Set((touches ?? []).map((t) => t.kitchen_recipe_id).filter((x): x is string => !!x))];
  const { data: lignes } = ficheIds.length
    ? await supabaseAdmin.from("kitchen_recipe_lines").select("recipe_id, sort_order, ingredients(name)").in("recipe_id", ficheIds).order("sort_order")
    : { data: [] as never[] };
  const ingredientsDe = new Map<string, string[]>();
  for (const l of (lignes ?? []) as unknown as { recipe_id: string; ingredients: { name: string } | { name: string }[] | null }[]) {
    const ing = Array.isArray(l.ingredients) ? l.ingredients[0] : l.ingredients;
    if (ing?.name) ingredientsDe.set(l.recipe_id, [...(ingredientsDe.get(l.recipe_id) ?? []), ing.name]);
  }
  const vus = new Set<string>(); const plats: PlatQuiz[] = [];
  for (const t of touches ?? []) {
    const nom = String(t.name ?? "").trim(); const cle = nom.toLowerCase();
    if (!nom || vus.has(cle)) continue;
    vus.add(cle);
    plats.push({ id: t.id as string, nom, categorie: String(t.category ?? ""), prix: Number(t.price_ttc) || 0, ingredients: t.kitchen_recipe_id ? ingredientsDe.get(t.kitchen_recipe_id as string) ?? [] : [] });
  }
  return plats;
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
    const familles = filtre === "boissons" ? BOISSONS : filtre && CUISINE.includes(filtre) ? [filtre] : CUISINE;
    questions = genererQuizCarte(await platsDeLaCarte(familles), NB);
  } else {
    const acteur = await acteurAction(req, a.userId, a.etabId);
    const faite = await maSemaine(a.etabId, cleDe(acteur.employeId, a.userId, acteur.nom));
    if (faite) return NextResponse.json({ error: `Quiz de la semaine déjà fait : ${faite.score} / ${faite.nb_questions}. Le prochain ouvre lundi.` }, { status: 409 });
    // Six questions sur la carte, quatre sur les vins ; si l'un des deux manque, l'autre complète
    const [plats, vins] = await Promise.all([platsDeLaCarte(CUISINE), vinsDeLaCarte(null)]);
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

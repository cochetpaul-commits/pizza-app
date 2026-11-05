import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError, callerProfile } from "@/lib/getEtablissement";
import { acteurAction } from "@/lib/tablette/acteur";
import { genererQuiz, resumeEquipe, score, type QuestionRepondue, type SessionQuiz, type VinQuiz } from "@/lib/quizVins";

/**
 * Quiz vins (05/11/2026).
 * GET  ?n=10&couleur=rouge   → des questions fabriquées depuis les fiches de la Cave (vins à la carte)
 * GET  ?equipe=1             → responsables : par personne et vins les plus ratés (90 jours)
 * POST { filtre, questions } → enregistre la série au nom de l'employé (tablette) ou du compte ; le score est recalculé ici
 */
async function auth(req: NextRequest) {
  try { return await getEtablissement(req); } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if (a instanceof NextResponse) return a;
  const sp = req.nextUrl.searchParams;

  if (sp.get("equipe") === "1") {
    const p = await callerProfile(req);
    if (!p || !["group_admin", "manager"].includes(p.role ?? "")) return NextResponse.json({ error: "Réservé aux responsables" }, { status: 403 });
    const depuis = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data, error } = await supabaseAdmin.from("quiz_sessions").select("employe_nom, score, nb_questions, created_at, questions")
      .eq("etablissement_id", a.etabId).eq("theme", "vins").gte("created_at", depuis).order("created_at", { ascending: false }).limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(resumeEquipe((data ?? []) as SessionQuiz[]));
  }

  const n = Math.max(3, Math.min(30, Number(sp.get("n")) || 10));
  const couleur = sp.get("couleur");
  const [{ data: vins, error }, { data: accords }] = await Promise.all([
    supabaseAdmin.from("vins").select("id, nom, couleur, cepages, region, appellation, domaine, bouche, pitch, prix").eq("sur_carte", true),
    supabaseAdmin.from("vins_accords").select("vin_id, plat_nom"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const accordsDe = new Map<string, string[]>();
  for (const x of accords ?? []) accordsDe.set(x.vin_id as string, [...(accordsDe.get(x.vin_id as string) ?? []), String(x.plat_nom)]);
  let liste: VinQuiz[] = (vins ?? []).map((v) => ({
    id: v.id as string, nom: String(v.nom), couleur: String(v.couleur ?? ""), cepages: v.cepages as string | null, region: v.region as string | null,
    appellation: v.appellation as string | null, domaine: v.domaine as string | null, bouche: v.bouche as string | null, pitch: v.pitch as string | null,
    prix: (v.prix as VinQuiz["prix"]) ?? null, accords: accordsDe.get(v.id as string) ?? [],
  }));
  if (couleur && couleur !== "tous") liste = liste.filter((v) => v.couleur === couleur);
  const questions = genererQuiz(liste, n);
  if (!questions.length) return NextResponse.json({ error: "Pas assez de vins à la carte pour un quiz (il en faut au moins 4)." }, { status: 400 });
  return NextResponse.json({ questions, nb_vins: liste.length });
}

export async function POST(req: NextRequest) {
  const a = await auth(req);
  if (a instanceof NextResponse) return a;
  const body = (await req.json().catch(() => null)) as { filtre?: string | null; questions?: QuestionRepondue[] } | null;
  const questions = Array.isArray(body?.questions) ? body!.questions : [];
  if (!questions.length) return NextResponse.json({ error: "questions requises" }, { status: 400 });
  const acteur = await acteurAction(req, a.userId, a.etabId);
  const s = score(questions);
  const { error } = await supabaseAdmin.from("quiz_sessions").insert({
    etablissement_id: a.etabId, user_id: a.userId, employe_id: acteur.employeId, employe_nom: acteur.nom, theme: "vins",
    filtre: body?.filtre ?? null, nb_questions: questions.length, score: s,
    questions: questions.map((q) => ({ type: q.type, vin_id: q.vin_id, vin_nom: q.vin_nom, question: q.question, options: q.options, bonne: q.bonne, reponse: q.reponse ?? null })),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, score: s, nom: acteur.nom });
}

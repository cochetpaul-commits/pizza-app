import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { EtabError } from "@/lib/getEtablissement";
import { acteurPate } from "@/lib/pate/acces";
import { calculRecette, etapesRecette, recetteFigee, tbDuMoment, typeRecette, type RecetteLigne } from "@/lib/pate/lotsServeur";
import { dateLocale, numeroLot } from "@/lib/pate/fournee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const n = (v: unknown, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };

/**
 * GET /api/pate/lots?recette=&etat=en_cours|tous&limit= : les lots de l'établissement (et de la recette), le lot ouvert
 * avec ses étapes, qui est devant l'écran et s'il peut lancer une fournée.
 */
export async function GET(req: NextRequest) {
  let acteur;
  try { acteur = await acteurPate(req); } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const sp = req.nextUrl.searchParams;
  const recette = sp.get("recette");
  const etat = sp.get("etat") ?? "en_cours";
  const limit = Math.min(200, Math.max(1, n(sp.get("limit"), 30)));
  let q = supabaseAdmin.from("pate_lots").select("*").eq("etablissement_id", acteur.etabId).order("created_at", { ascending: false }).limit(limit);
  if (recette) q = q.eq("recipe_id", recette);
  if (etat === "en_cours") q = q.in("statut", ["biga_en_cours", "biga_au_froid", "petrissage"]);
  const { data: lots, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ouvert = (lots ?? []).find((l) => l.statut !== "cloture" && l.statut !== "annule") ?? null;
  let etapes: unknown[] = [];
  if (ouvert) {
    const { data } = await supabaseAdmin.from("pate_lot_etapes").select("*").eq("lot_id", ouvert.id).order("ordre");
    etapes = data ?? [];
  }
  return NextResponse.json({ lots: lots ?? [], ouvert: ouvert ? { ...ouvert, etapes } : null, acteur: { nom: acteur.nom, peutLancer: acteur.peutLancer, source: acteur.source } });
}

/**
 * POST /api/pate/lots { recipe_id, nb_patons, poids_paton?, essai?, essai_variable?, essai_valeur? } : démarre une fournée.
 * La recette est copiée et figée dans le lot ; les étapes viennent de la recette ou des étapes par défaut.
 */
export async function POST(req: NextRequest) {
  let acteur;
  try { acteur = await acteurPate(req); } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  if (!acteur.peutLancer) return NextResponse.json({ error: "Lancer une fournée est réservé aux pizzaiolos formés et aux responsables." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const recipeId = String(body.recipe_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(recipeId)) return NextResponse.json({ error: "recette invalide" }, { status: 400 });
  const { data: r, error: rErr } = await supabaseAdmin.from("recipes").select("*").eq("id", recipeId).maybeSingle();
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  if (!r) return NextResponse.json({ error: "Recette introuvable" }, { status: 404 });
  const recette = r as RecetteLigne;
  const type = typeRecette(recette);
  if (type === "focaccia") return NextResponse.json({ error: "Les fournées suivent les pâtes à pizza (biga ou directe)." }, { status: 400 });

  const nbPatons = Math.max(1, Math.round(n(body.nb_patons, n(recette.balls_count, 12))));
  const poidsPaton = Math.max(1, Math.round(n(body.poids_paton, n(recette.ball_weight, 260))));
  let calcul;
  try { calcul = calculRecette(recette, nbPatons, poidsPaton); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Calcul impossible" }, { status: 400 });
  }

  // Un seul lot ouvert par recette
  const { data: dejaOuvert } = await supabaseAdmin.from("pate_lots").select("id, numero").eq("etablissement_id", acteur.etabId).eq("recipe_id", recipeId).in("statut", ["biga_en_cours", "biga_au_froid", "petrissage"]).limit(1);
  if (dejaOuvert && dejaOuvert.length) return NextResponse.json({ error: `Le lot ${dejaOuvert[0].numero} est encore ouvert sur cette recette.`, lot_id: dejaOuvert[0].id }, { status: 409 });

  // Numéro : date du pétrissage final (demain pour une biga lancée la veille)
  const datePetrissage = dateLocale(type === "biga" ? 1 : 0);
  const { data: existants } = await supabaseAdmin.from("pate_lots").select("numero").eq("etablissement_id", acteur.etabId).like("numero", `L-${datePetrissage}-%`);
  const numero = numeroLot(datePetrissage, (existants ?? []).map((x) => String(x.numero)));
  const maintenant = new Date().toISOString();
  const essai = body.essai === true;

  const { data: lot, error } = await supabaseAdmin.from("pate_lots").insert({
    etablissement_id: acteur.etabId, numero, recipe_id: recipeId, recette_nom: String(recette.name ?? "").trim(), type,
    nb_patons: nbPatons, poids_paton: poidsPaton, poids_calcule: calcul.summary.poidsCalcule_g,
    recette_figee: recetteFigee(recette, calcul),
    operateur_id: acteur.employeId, operateur_nom: acteur.nom,
    statut: type === "biga" ? "biga_en_cours" : "petrissage",
    biga_debut_at: type === "biga" ? maintenant : null,
    essai, essai_variable: essai ? String(body.essai_variable ?? "").trim() || null : null, essai_valeur: essai ? String(body.essai_valeur ?? "").trim() || null : null,
  }).select("*").single();
  if (error || !lot) return NextResponse.json({ error: error?.message ?? "Création impossible" }, { status: 500 });

  const etapes = etapesRecette(recette).map((e, i) => ({ lot_id: lot.id, phase: e.phase, ordre: i + 1, libelle: e.texte, duree_prevue_s: e.duree_s }));
  const { data: etapesCreees, error: eErr } = await supabaseAdmin.from("pate_lot_etapes").insert(etapes).select("*").order("ordre");
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
  const tb = await tbDuMoment(acteur.etabId, type, n(recette.tb_manuelle, 56));
  return NextResponse.json({ lot: { ...lot, etapes: etapesCreees ?? [] }, tb });
}

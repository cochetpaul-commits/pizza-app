import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { CODE_VALIDE, verifierCode } from "@/lib/tablette/codePin";
import { signerJeton } from "@/lib/tablette/jeton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tablette/identifier { code } — qui est devant la tablette ?
 * Compare le code aux employés actifs de l'établissement courant ; renvoie l'employé, sans rien changer aux droits
 * (la tablette garde les droits de son propre compte ; le code sert à savoir qui agit).
 */
export async function POST(req: NextRequest) {
  let etabId: string;
  try { ({ etabId } = await getEtablissement(req)); } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = String(body.code ?? "").trim();
  if (!CODE_VALIDE.test(code)) return NextResponse.json({ error: "Code à 4 chiffres attendu" }, { status: 400 });
  const { data: emps, error } = await supabaseAdmin.from("employes").select("id, prenom, nom, equipes_access, code_pin_hash").eq("etablissement_id", etabId).eq("actif", true).not("code_pin_hash", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const trouve = (emps ?? []).find((e) => verifierCode(code, e.code_pin_hash as string));
  // Petite attente : un code à 4 chiffres ne se devine pas en rafale
  await new Promise((r) => setTimeout(r, 350));
  if (!trouve) return NextResponse.json({ error: "Code inconnu" }, { status: 404 });
  // Le jeton signé sert aux chiffres personnels de l'employé (tableau de bord) sans changer les droits de la tablette
  return NextResponse.json({ employe: { id: trouve.id, prenom: trouve.prenom, nom: trouve.nom, equipe: ((trouve.equipes_access as string[] | null) ?? [])[0] ?? null, jeton: signerJeton(trouve.id as string, etabId) } });
}

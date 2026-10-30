import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { roleDenied } from "@/lib/getEtablissement";
import { CODE_VALIDE, hacherCode, verifierCode } from "@/lib/tablette/codePin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tablette/code?employe_id=… — l'employé a-t-il un code ? (le haché ne sort jamais vers le navigateur) */
export async function GET(req: NextRequest) {
  const refus = await roleDenied(req, ["group_admin", "manager"]);
  if (refus) return refus;
  const employeId = req.nextUrl.searchParams.get("employe_id") ?? "";
  if (!employeId) return NextResponse.json({ error: "employe_id requis" }, { status: 400 });
  const { data } = await supabaseAdmin.from("employes").select("code_pin_hash").eq("id", employeId).maybeSingle();
  return NextResponse.json({ defini: !!data?.code_pin_hash });
}

/**
 * POST /api/tablette/code { employe_id, code } — fixe (ou retire, code vide) le code tablette d'un employé.
 * Réservé aux admins et managers. Le code doit être unique parmi les employés actifs du même établissement.
 */
export async function POST(req: NextRequest) {
  const refus = await roleDenied(req, ["group_admin", "manager"]);
  if (refus) return refus;
  const body = (await req.json().catch(() => ({}))) as { employe_id?: string; code?: string };
  const employeId = String(body.employe_id ?? "");
  const code = String(body.code ?? "").trim();
  if (!employeId) return NextResponse.json({ error: "employe_id requis" }, { status: 400 });
  if (code && !CODE_VALIDE.test(code)) return NextResponse.json({ error: "Le code doit faire 4 chiffres" }, { status: 400 });
  const { data: emp } = await supabaseAdmin.from("employes").select("id, etablissement_id").eq("id", employeId).maybeSingle();
  if (!emp) return NextResponse.json({ error: "Employé introuvable" }, { status: 404 });
  if (code) {
    const { data: autres } = await supabaseAdmin.from("employes").select("id, code_pin_hash").eq("etablissement_id", emp.etablissement_id).eq("actif", true).neq("id", employeId).not("code_pin_hash", "is", null);
    if ((autres ?? []).some((a) => verifierCode(code, a.code_pin_hash as string))) return NextResponse.json({ error: "Ce code est déjà pris par quelqu'un d'autre : choisis-en un autre" }, { status: 409 });
  }
  const { error } = await supabaseAdmin.from("employes").update({ code_pin_hash: code ? hacherCode(code) : null }).eq("id", employeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, defini: !!code });
}

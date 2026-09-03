import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { roleDenied } from "@/lib/getEtablissement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Identifiants du portail de commande d'un fournisseur.
 * Stockés dans supplier_portal_credentials (aucune policy RLS : service role
 * seulement) et servis ici aux administrateurs et managers uniquement.
 *
 * GET  ?supplier_id=…            → { login, password }
 * PUT  { supplier_id, login, password }
 */
const ROLES = ["group_admin", "manager"];

export async function GET(req: NextRequest) {
  const denied = await roleDenied(req, ROLES);
  if (denied) return denied;
  const supplierId = req.nextUrl.searchParams.get("supplier_id");
  if (!supplierId) return NextResponse.json({ error: "supplier_id requis" }, { status: 400 });

  const { data } = await supabaseAdmin
    .from("supplier_portal_credentials")
    .select("login, password")
    .eq("supplier_id", supplierId)
    .maybeSingle();
  return NextResponse.json({ login: data?.login ?? "", password: data?.password ?? "" });
}

export async function PUT(req: NextRequest) {
  const denied = await roleDenied(req, ROLES);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { supplier_id?: string; login?: string; password?: string };
  if (!body.supplier_id) return NextResponse.json({ error: "supplier_id requis" }, { status: 400 });

  const login = (body.login ?? "").trim() || null;
  const password = (body.password ?? "").trim() || null;
  if (!login && !password) {
    await supabaseAdmin.from("supplier_portal_credentials").delete().eq("supplier_id", body.supplier_id);
    return NextResponse.json({ ok: true });
  }
  const { error } = await supabaseAdmin
    .from("supplier_portal_credentials")
    .upsert({ supplier_id: body.supplier_id, login, password, updated_at: new Date().toISOString() }, { onConflict: "supplier_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

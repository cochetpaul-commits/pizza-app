import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { roleDenied } from "@/lib/getEtablissement";

export const runtime = "nodejs";

/**
 * Références fournisseur multiples d'une fiche (alias), lues par le rapprochement.
 *  GET  ?ingredient_id=… | ?supplier_id=…            → liste
 *  POST { supplier_id, sku, ingredient_id, label? }  → crée (ou déplace) l'alias
 *  POST { alias: [ {supplier_id, sku, ingredient_id, label?}, … ] } → en lot
 *  DELETE { id }                                     → retire un alias
 */
export async function GET(req: NextRequest) {
  const denied = await roleDenied(req, ["group_admin", "manager"]);
  if (denied) return denied;
  const ing = req.nextUrl.searchParams.get("ingredient_id");
  const sup = req.nextUrl.searchParams.get("supplier_id");
  let q = supabaseAdmin.from("ingredient_supplier_refs").select("id, ingredient_id, supplier_id, sku, label, created_at").order("created_at");
  if (ing) q = q.eq("ingredient_id", ing);
  if (sup) q = q.eq("supplier_id", sup);
  const { data, error } = await q.range(0, 4999);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, alias: data ?? [] });
}

type AliasIn = { supplier_id?: string; sku?: string | null; ingredient_id?: string; label?: string | null };

export async function POST(req: NextRequest) {
  const denied = await roleDenied(req, ["group_admin", "manager"]);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as AliasIn & { alias?: AliasIn[] };
  const items = (body.alias ?? [body]).map((a) => ({ supplier_id: a.supplier_id ?? "", sku: (a.sku ?? "").trim(), ingredient_id: a.ingredient_id ?? "", label: (a.label ?? "").trim() || null }));
  const invalides = items.filter((a) => !a.supplier_id || !a.sku || !a.ingredient_id);
  if (invalides.length) return NextResponse.json({ error: "supplier_id, sku et ingredient_id requis" }, { status: 400 });
  // Une référence déjà portée par une fiche (supplier_sku) n'a pas besoin d'alias
  const { data, error } = await supabaseAdmin.from("ingredient_supplier_refs").upsert(items, { onConflict: "supplier_id,sku" }).select("id, ingredient_id, supplier_id, sku, label");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, alias: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const denied = await roleDenied(req, ["group_admin", "manager"]);
  if (denied) return denied;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const { error } = await supabaseAdmin.from("ingredient_supplier_refs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

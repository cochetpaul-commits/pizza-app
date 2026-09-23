import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { roleDenied } from "@/lib/getEtablissement";
import { cleReference } from "@/lib/invoices/rapprochement";

export const runtime = "nodejs";

/**
 * Références fournisseur ignorées (produits abandonnés) : sortent de « Lignes en
 * attente » et ne créent jamais de fiche à l'import. Les lignes de facture restent.
 *  POST   { supplier_id, sku?, nom?, label?, motif? }  (clé = référence, sinon libellé normalisé)
 *  POST   { ignorer: [ … ] }                            en lot
 *  DELETE { id }                                        réactive
 */
type In = { supplier_id?: string; sku?: string | null; nom?: string | null; label?: string | null; motif?: string | null };

export async function POST(req: NextRequest) {
  const denied = await roleDenied(req, ["group_admin", "manager"]);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as In & { ignorer?: In[] };
  const items = (body.ignorer ?? [body]).map((a) => ({
    supplier_id: a.supplier_id ?? "",
    sku: cleReference(a.sku, a.nom ?? a.label),
    label: (a.label ?? a.nom ?? "").trim() || null,
    motif: (a.motif ?? "").trim() || null,
  }));
  if (items.some((a) => !a.supplier_id || a.sku === "n:")) return NextResponse.json({ error: "supplier_id et référence ou libellé requis" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("supplier_refs_ignorees").upsert(items, { onConflict: "supplier_id,sku" }).select("id, supplier_id, sku, label");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ignorees: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const denied = await roleDenied(req, ["group_admin", "manager"]);
  if (denied) return denied;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const { error } = await supabaseAdmin.from("supplier_refs_ignorees").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

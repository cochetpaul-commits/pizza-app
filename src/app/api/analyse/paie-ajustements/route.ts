import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { etabAccessDenied, callerProfile } from "@/lib/getEtablissement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paie exceptionnelle et pourboires du mois travaillé (29/10/2026).
 * GET ?etablissement_id&mois=YYYY-MM-01 : les ajustements du mois.
 * POST { etablissement_id, mois, type: ppv | solde | pourboires | autre, montant, libelle } : en ajoute un.
 * DELETE ?etablissement_id&id : le retire. Réservé direction et managers.
 */
const TYPES = ["ppv", "solde", "pourboires", "autre"];

export async function GET(req: NextRequest) {
  const etabId = req.nextUrl.searchParams.get("etablissement_id");
  const mois = req.nextUrl.searchParams.get("mois");
  if (!etabId || !mois || !/^\d{4}-\d{2}-01$/.test(mois)) return NextResponse.json({ error: "etablissement_id et mois requis" }, { status: 400 });
  const denied = await etabAccessDenied(req, etabId, ["group_admin", "manager"]);
  if (denied) return denied;
  const { data, error } = await supabaseAdmin.from("paie_ajustements").select("id, mois, type, montant, libelle, created_at").eq("etablissement_id", etabId).eq("mois", mois).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ajustements: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { etablissement_id?: string; mois?: string; type?: string; montant?: number; libelle?: string } | null;
  if (!body?.etablissement_id || !body.mois || !/^\d{4}-\d{2}-01$/.test(body.mois) || !TYPES.includes(body.type ?? "") || !(Number(body.montant) > 0)) {
    return NextResponse.json({ error: "etablissement_id, mois (YYYY-MM-01), type et montant > 0 requis" }, { status: 400 });
  }
  const denied = await etabAccessDenied(req, body.etablissement_id, ["group_admin", "manager"]);
  if (denied) return denied;
  const p = await callerProfile(req);
  const { data, error } = await supabaseAdmin.from("paie_ajustements")
    .insert({ etablissement_id: body.etablissement_id, mois: body.mois, type: body.type, montant: Number(body.montant), libelle: body.libelle?.trim() || null, created_by: p?.userId ?? null })
    .select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function DELETE(req: NextRequest) {
  const etabId = req.nextUrl.searchParams.get("etablissement_id");
  const id = req.nextUrl.searchParams.get("id");
  if (!etabId || !id) return NextResponse.json({ error: "etablissement_id et id requis" }, { status: 400 });
  const denied = await etabAccessDenied(req, etabId, ["group_admin", "manager"]);
  if (denied) return denied;
  const { error } = await supabaseAdmin.from("paie_ajustements").delete().eq("id", id).eq("etablissement_id", etabId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { roleDenied } from "@/lib/getEtablissement";
import { aliasFournisseur } from "@/lib/invoices/rapprochement";

export const runtime = "nodejs";

/**
 * Baisses de prix de plus de 20 % mises « à valider » par l'import (table supplier_offers_a_valider).
 *  GET  (x-etablissement-id)                → liste en attente, avec produit et fournisseur
 *  POST { id, action: "accepter"|"refuser" } → accepter = l'offre est appliquée (l'offre active du même fournisseur est fermée), refuser = ignorée
 */
export async function GET(req: NextRequest) {
  const denied = await roleDenied(req, ["group_admin", "manager"]);
  if (denied) return denied;
  const etabId = req.headers.get("x-etablissement-id") || "";
  const { data, error } = await supabaseAdmin.from("supplier_offers_a_valider")
    .select("id, ingredient_id, supplier_id, etablissement_id, offre, ancien_prix, nouveau_prix, ecart_pct, unite, source, created_at")
    .eq("statut", "a_valider").order("created_at", { ascending: false }).range(0, 999);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const [{ data: ings }, { data: sups }] = await Promise.all([
    supabaseAdmin.from("ingredients").select("id, name").in("id", Array.from(new Set(rows.map((r) => r.ingredient_id as string)))),
    supabaseAdmin.from("suppliers").select("id, name, etablissement_id"),
  ]);
  const ingName = new Map((ings ?? []).map((i) => [i.id as string, i.name as string]));
  const sup = new Map((sups ?? []).map((s) => [s.id as string, s as { id: string; name: string; etablissement_id: string | null }]));
  const liste = rows
    .filter((r) => !etabId || (r.etablissement_id ?? sup.get(r.supplier_id as string)?.etablissement_id) === etabId)
    .map((r) => ({ ...r, produit: ingName.get(r.ingredient_id as string) ?? "?", fournisseur: sup.get(r.supplier_id as string)?.name ?? "?" }));
  return NextResponse.json({ ok: true, prix: liste });
}

export async function POST(req: NextRequest) {
  const denied = await roleDenied(req, ["group_admin", "manager"]);
  if (denied) return denied;
  const { id, action } = (await req.json().catch(() => ({}))) as { id?: string; action?: string };
  if (!id || (action !== "accepter" && action !== "refuser")) return NextResponse.json({ error: "id et action (accepter|refuser) requis" }, { status: 400 });
  const { data: row, error } = await supabaseAdmin.from("supplier_offers_a_valider").select("*").eq("id", id).eq("statut", "a_valider").single();
  if (error || !row) return NextResponse.json({ error: "demande introuvable ou déjà traitée" }, { status: 404 });
  if (action === "accepter") {
    const offre = row.offre as Record<string, unknown>;
    const dateNouvelle = String(offre.valid_from ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const alias = await aliasFournisseur(supabaseAdmin, row.supplier_id as string);
    const { data: actives } = await supabaseAdmin.from("supplier_offers").select("id, valid_from").eq("ingredient_id", row.ingredient_id).in("supplier_id", alias).eq("is_active", true);
    for (const a of actives ?? []) {
      const vf = a.valid_from ? String(a.valid_from).slice(0, 10) : null;
      const off = await supabaseAdmin.from("supplier_offers").update({ is_active: false, valid_to: vf && vf > dateNouvelle ? vf : dateNouvelle }).eq("id", a.id);
      if (off.error) return NextResponse.json({ error: off.error.message }, { status: 500 });
    }
    const ins = await supabaseAdmin.from("supplier_offers").insert({ ...offre, is_active: true, valid_to: null });
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }
  const { error: e2 } = await supabaseAdmin.from("supplier_offers_a_valider").update({ statut: action === "accepter" ? "acceptee" : "refusee", decide_le: new Date().toISOString() }).eq("id", id);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

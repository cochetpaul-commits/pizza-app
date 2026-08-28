import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { detectCategoryFromName } from "@/lib/invoices/categoryDetector";
import { detectAllergensFromName } from "@/lib/invoices/allergenDetector";
import { extractVolumeFromName, extractWeightGFromName, detectUnitFromName } from "@/lib/invoices/utils";
import type { Category } from "@/types/ingredients";

/**
 * Récupération de produits supprimés par erreur.
 *  GET  → liste des produits vus sur des factures mais absents de la base
 *         + les produits désactivés (repêchables d'un clic)
 *  POST → { items: [{ sku, name, supplier_id }] } : recrée chaque produit
 *         avec le dernier prix facturé ; { reactiver: [ids] } : réactive.
 */

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function requireManager(req: NextRequest): Promise<string | NextResponse> {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const anon = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  const { data } = await anon.auth.getUser(token);
  if (!data?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data: prof } = await supabaseAdmin.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (prof?.role !== "group_admin" && prof?.role !== "manager") {
    return NextResponse.json({ error: "Réservé aux managers" }, { status: 403 });
  }
  return data.user.id;
}

export async function GET(req: NextRequest) {
  const auth = await requireManager(req);
  if (auth instanceof NextResponse) return auth;

  const etabId = req.nextUrl.searchParams.get("etablissement_id");
  const [{ data: disparus, error }, { data: inactifs }] = await Promise.all([
    supabaseAdmin.rpc("produits_disparus", { p_etab: etabId || null }),
    supabaseAdmin
      .from("ingredients")
      .select("id, name, supplier, category, supplier_sku")
      .eq("is_active", false)
      .order("name"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ disparus: disparus ?? [], inactifs: inactifs ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireManager(req);
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const body = (await req.json().catch(() => ({}))) as {
    items?: { sku?: string | null; name?: string; supplier_id?: string }[];
    reactiver?: string[];
  };

  let reactives = 0;
  if (body.reactiver?.length) {
    const { count } = await supabaseAdmin
      .from("ingredients")
      .update({ is_active: true }, { count: "exact" })
      .in("id", body.reactiver);
    reactives = count ?? 0;
  }

  let crees = 0;
  const erreurs: string[] = [];
  for (const item of body.items ?? []) {
    const nm = (item.name ?? "").trim().toUpperCase();
    if (!nm || !item.supplier_id) continue;

    // Dernière ligne facturée pour ce produit → prix, unité, établissement
    const { data: lastLines } = await supabaseAdmin
      .from("supplier_invoice_lines")
      .select("unit_price, unit, quantity, supplier_invoices!inner(invoice_date, invoice_number, etablissement_id)")
      .eq("supplier_id", item.supplier_id)
      .ilike("name", nm)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = lastLines?.[0] as Record<string, unknown> | undefined;
    const inv = (Array.isArray(last?.supplier_invoices) ? (last?.supplier_invoices as Record<string, unknown>[])[0] : last?.supplier_invoices) as Record<string, unknown> | undefined;

    const { data: sup } = await supabaseAdmin.from("suppliers").select("id, name, etablissement_id").eq("id", item.supplier_id).maybeSingle();
    const cat = (detectCategoryFromName(nm) ?? "autre") as Category;
    const volMl = extractVolumeFromName(nm);
    const unitFromLine = (last?.unit as string) ?? null;
    const unit = unitFromLine === "kg" || unitFromLine === "l" || unitFromLine === "pc" ? unitFromLine : detectUnitFromName(nm);
    const allergens = detectAllergensFromName(nm);

    const { data: ins, error: insErr } = await supabaseAdmin.from("ingredients").insert({
      user_id: userId,
      name: nm,
      import_name: nm,
      category: cat,
      allergens: allergens.length ? allergens : null,
      is_active: true,
      default_unit: unit === "kg" ? "g" : "pc",
      supplier: sup?.name ?? null,
      supplier_id: item.supplier_id,
      default_supplier_id: item.supplier_id,
      supplier_sku: item.sku || null,
      status: "to_check",
      status_note: `récupéré depuis les factures${inv?.invoice_number ? ` (${inv.invoice_number})` : ""}`,
      piece_volume_ml: unit === "pc" ? volMl : null,
      piece_weight_g: unit === "pc" && volMl == null ? extractWeightGFromName(nm) : null,
      etablissement_id: sup?.etablissement_id ?? (inv?.etablissement_id as string | undefined) ?? null,
      establishments: ["bellomio", "piccola"],
    }).select("id").single();

    if (insErr) {
      if ((insErr as { code?: string }).code !== "23505") erreurs.push(`${nm} : ${insErr.message}`);
      continue;
    }
    crees++;

    const price = last?.unit_price != null ? Number(last.unit_price) : null;
    if (ins?.id && price != null && price > 0) {
      await supabaseAdmin.from("supplier_offers").insert({
        user_id: userId,
        ingredient_id: ins.id,
        supplier_id: item.supplier_id,
        supplier_sku: item.sku || null,
        supplier_label: nm,
        currency: "EUR",
        is_active: true,
        establishment: "both",
        price_kind: "unit",
        unit: unit ?? "pc",
        unit_price: price,
        price,
        etablissement_id: sup?.etablissement_id ?? null,
      });
    }
  }

  return NextResponse.json({ ok: true, crees, reactives, erreurs });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/ingredients/bulk-pack
 *
 * Set pack_count and pack_each_qty on all supplier_offers for a given supplier
 * where pack_count IS NULL.
 *
 * Body: {
 *   supplier_id: string,
 *   pack_count: number,       // e.g. 6
 *   pack_each_qty: number,    // e.g. 0.75
 *   pack_each_unit: string    // e.g. "l"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { supplier_id, pack_count, pack_each_qty, pack_each_unit } = body;

    if (!supplier_id) {
      return NextResponse.json({ error: "supplier_id requis" }, { status: 400 });
    }
    if (!pack_count || typeof pack_count !== "number" || pack_count < 1) {
      return NextResponse.json({ error: "pack_count requis (nombre >= 1)" }, { status: 400 });
    }
    if (pack_each_qty != null && typeof pack_each_qty !== "number") {
      return NextResponse.json({ error: "pack_each_qty doit etre un nombre" }, { status: 400 });
    }

    // 1. Find all offers for this supplier where pack_count IS NULL
    const { data: offers, error: fetchErr } = await supabaseAdmin
      .from("supplier_offers")
      .select("id, unit_price, pack_count")
      .eq("supplier_id", supplier_id)
      .eq("is_active", true)
      .is("pack_count", null);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!offers || offers.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, message: "Aucune offre sans pack_count" });
    }

    // 2. Update each offer: add pack fields, compute pack_price from unit_price
    let updated = 0;
    const errors: string[] = [];

    for (const offer of offers) {
      const packPrice = offer.unit_price != null
        ? Math.round(offer.unit_price * pack_count * 100) / 100
        : null;

      const updateData: Record<string, unknown> = {
        pack_count,
        pack_each_qty: pack_each_qty ?? null,
        pack_each_unit: pack_each_unit ?? null,
        pack_price: packPrice,
      };

      const { error: upErr } = await supabaseAdmin
        .from("supplier_offers")
        .update(updateData)
        .eq("id", offer.id);

      if (upErr) {
        errors.push(`Offer ${offer.id}: ${upErr.message}`);
      } else {
        updated++;
      }
    }

    return NextResponse.json({
      ok: true,
      updated,
      total: offers.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/ingredients/bulk-pack?supplier_id=xxx
 *
 * Preview: count how many offers would be updated (pack_count IS NULL).
 * Also returns offers that already have pack_count set.
 */
export async function GET(req: NextRequest) {
  const supplierId = req.nextUrl.searchParams.get("supplier_id");
  if (!supplierId) {
    return NextResponse.json({ error: "supplier_id requis" }, { status: 400 });
  }

  const { data: allOffers, error } = await supabaseAdmin
    .from("supplier_offers")
    .select("id, pack_count, pack_each_qty, pack_each_unit")
    .eq("supplier_id", supplierId)
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = allOffers?.length ?? 0;
  const withPack = allOffers?.filter((o) => o.pack_count != null).length ?? 0;
  const withoutPack = total - withPack;

  return NextResponse.json({
    total,
    with_pack: withPack,
    without_pack: withoutPack,
  });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/clean-names
 * Diagnose ingredients with date-like names — show linked offers/invoice lines to identify them.
 */
export async function GET() {
  const { data: allIngredients } = await supabaseAdmin
    .from("ingredients")
    .select("id, name, supplier_id, supplier_sku");

  // Find ingredients whose name looks like a date or is very short/numeric
  const suspect = (allIngredients ?? []).filter((i) =>
    /^\d{1,2}\/\d/.test(i.name) || /^\d+$/.test(i.name.trim())
  );

  const results = [];
  for (const ing of suspect) {
    // Get linked supplier_offers
    const { data: offers } = await supabaseAdmin
      .from("supplier_offers")
      .select("id, supplier_label, supplier_sku, unit_price, price_kind, unit")
      .eq("ingredient_id", ing.id);

    // Get linked invoice lines by sku
    const { data: invoiceLines } = await supabaseAdmin
      .from("supplier_invoice_lines")
      .select("id, name, sku, quantity, unit_price, invoice_id")
      .eq("ingredient_id", ing.id);

    results.push({
      ingredient: ing,
      offers: offers ?? [],
      invoice_lines: invoiceLines ?? [],
    });
  }

  return NextResponse.json({ suspect_count: results.length, results });
}

/**
 * PUT /api/admin/clean-names
 * Fix known orphan ingredients by ID + clean their offers with date-like labels.
 */
export async function PUT() {
  const fixes: Record<string, string> = {
    "641559e0-3351-4dcd-87e6-04bb7d2bb872": "MASCARPONE DE VACHE 41% 500G",
    "c1f79927-804c-4432-8a26-f6db3b47d7f2": "BEURRE DOUX 500G",
  };

  const results = [];

  for (const [id, newName] of Object.entries(fixes)) {
    // Fix ingredient name
    const { error: e1 } = await supabaseAdmin
      .from("ingredients")
      .update({ name: newName })
      .eq("id", id);
    if (e1) { results.push({ id, error: e1.message }); continue; }

    // Fix offers with date-like supplier_label
    const { data: offers } = await supabaseAdmin
      .from("supplier_offers")
      .select("id, supplier_label")
      .eq("ingredient_id", id);

    for (const offer of (offers ?? [])) {
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(offer.supplier_label?.trim() ?? "")) {
        await supabaseAdmin
          .from("supplier_offers")
          .update({ supplier_label: newName })
          .eq("id", offer.id);
      }
    }

    results.push({ id, name: newName, status: "fixed" });
  }

  // Delete orphan ingredient ART1048 with no offers/lines (if not referenced)
  const orphanId = "fb963fb3-b9ec-463c-a13f-f57eb59263ec";
  const { count: refCount } = await supabaseAdmin
    .from("commande_lignes")
    .select("id", { count: "exact", head: true })
    .eq("ingredient_id", orphanId);

  if (!refCount || refCount === 0) {
    await supabaseAdmin.from("supplier_offers").delete().eq("ingredient_id", orphanId);
    const { error: delErr } = await supabaseAdmin.from("ingredients").delete().eq("id", orphanId);
    results.push({ id: orphanId, status: delErr ? `delete failed: ${delErr.message}` : "deleted (orphan ART1048)" });
  } else {
    results.push({ id: orphanId, status: `kept — referenced in ${refCount} commande_lignes` });
  }

  return NextResponse.json({ results });
}

/**
 * POST /api/admin/clean-names
 * One-shot: clean ingredient names that have leading date/number noise from MAEL imports.
 * Also cleans supplier_offers.supplier_label and supplier_invoice_lines.name.
 */
export async function POST() {
  const { data: allIngredients, error: e1b } = await supabaseAdmin
    .from("ingredients")
    .select("id, name");

  if (e1b) return NextResponse.json({ error: e1b.message }, { status: 500 });

  const noisy = (allIngredients ?? []).filter((i) =>
    /^\d{1,2}[/*]/.test(i.name) || /^\d{1,2}\/\d/.test(i.name)
  );

  function cleanName(raw: string): string {
    let s = raw.replace(/\s+/g, " ").trim();
    s = s.replace(/^(NC|DLUO|DLC)\s+/i, "");
    s = s.replace(/^(?:\d{1,2}(?:[/*]\d{0,2}(?:\/\d{2,4})?)?\*?\s+)+/, "").trim();
    return s;
  }

  const updates: { id: string; old: string; new: string }[] = [];

  for (const ing of noisy) {
    const cleaned = cleanName(ing.name);
    if (cleaned !== ing.name && cleaned.length > 0) {
      updates.push({ id: ing.id, old: ing.name, new: cleaned });
      await supabaseAdmin
        .from("ingredients")
        .update({ name: cleaned })
        .eq("id", ing.id);
    }
  }

  // 2. Clean supplier_invoice_lines
  const { data: allLines, error: e2 } = await supabaseAdmin
    .from("supplier_invoice_lines")
    .select("id, name");

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const noisyLines = (allLines ?? []).filter((l) =>
    /^\d{1,2}[/*]/.test(l.name) || /^\d{1,2}\/\d/.test(l.name)
  );

  let lineCount = 0;
  for (const line of noisyLines) {
    const cleaned = cleanName(line.name);
    if (cleaned !== line.name && cleaned.length > 0) {
      lineCount++;
      await supabaseAdmin
        .from("supplier_invoice_lines")
        .update({ name: cleaned })
        .eq("id", line.id);
    }
  }

  // 3. Clean supplier_offers.supplier_label
  const { data: allOffers, error: e3 } = await supabaseAdmin
    .from("supplier_offers")
    .select("id, supplier_label");

  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });

  const noisyOffers = (allOffers ?? []).filter((o) =>
    o.supplier_label && (/^\d{1,2}[/*]/.test(o.supplier_label) || /^\d{1,2}\/\d/.test(o.supplier_label))
  );

  let offerCount = 0;
  for (const offer of noisyOffers) {
    const cleaned = cleanName(offer.supplier_label);
    if (cleaned !== offer.supplier_label && cleaned.length > 0) {
      offerCount++;
      await supabaseAdmin
        .from("supplier_offers")
        .update({ supplier_label: cleaned })
        .eq("id", offer.id);
    }
  }

  return NextResponse.json({
    ingredients_cleaned: updates.length,
    invoice_lines_cleaned: lineCount,
    offers_cleaned: offerCount,
    details: updates.map((u) => `"${u.old}" → "${u.new}"`),
  });
}

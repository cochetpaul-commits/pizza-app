import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

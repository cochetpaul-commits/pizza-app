import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/tresorerie/categorize
 * Update an operation's category and save the rule for future imports.
 *
 * Body: { operation_id, category, etablissement_id }
 */
export async function POST(req: Request) {
  try {
    const { operation_id, category, etablissement_id } = await req.json();

    if (!operation_id || !category || !etablissement_id) {
      return NextResponse.json({ error: "Champs requis: operation_id, category, etablissement_id" }, { status: 400 });
    }

    // 1. Update the operation's category
    const { data: op, error: opErr } = await supabaseAdmin
      .from("bank_operations")
      .update({ category })
      .eq("id", operation_id)
      .select("label")
      .single();

    if (opErr) {
      return NextResponse.json({ error: opErr.message }, { status: 500 });
    }

    // 2. Extract a pattern from the label (first meaningful words, normalized)
    const label = op.label ?? "";
    const pattern = label
      .toUpperCase()
      .replace(/\d{6}/g, "")           // strip 6-digit date codes
      .replace(/FACT\s*\d*/g, "")       // strip FACT + number
      .replace(/CONTRAT\s*\d*/g, "")    // strip CONTRAT + number
      .replace(/REM\s*\d*/g, "")        // strip REM + number
      .replace(/N\.\d+/g, "")          // strip N.number
      .replace(/\d{7,}/g, "")          // strip long numbers
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 4)                     // keep first 4 words as pattern
      .join(" ")
      .trim();

    if (pattern.length >= 3) {
      // 3. Save the rule (upsert — update if pattern already exists)
      await supabaseAdmin
        .from("bank_category_rules")
        .upsert(
          { etablissement_id, pattern, category },
          { onConflict: "etablissement_id,pattern" },
        );

      // 4. Also update all other operations with similar labels in this etablissement
      const { data: similar } = await supabaseAdmin
        .from("bank_operations")
        .select("id, label")
        .eq("etablissement_id", etablissement_id)
        .eq("category", "autre")
        .ilike("label", `%${pattern.split(" ").slice(0, 2).join("%")}%`);

      if (similar && similar.length > 0) {
        const ids = similar.map((s) => s.id);
        await supabaseAdmin
          .from("bank_operations")
          .update({ category })
          .in("id", ids);
      }

      return NextResponse.json({
        ok: true,
        pattern,
        similar_updated: similar?.length ?? 0,
      });
    }

    return NextResponse.json({ ok: true, pattern: null, similar_updated: 0 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

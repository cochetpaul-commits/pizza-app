import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { pdfToText } from "@/lib/pdfToText";
import { parseBankStatement } from "@/lib/bankParser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tresorerie/import
 * Accept FormData with `file` (PDF bank statement)
 * Parse, categorize, and upsert operations into bank_operations.
 */
export async function POST(request: NextRequest) {
  let etabId: string;
  let userId: string;
  try {
    ({ etabId, userId } = await getEtablissement(request));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  // Read the uploaded PDF
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Fichier PDF requis" }, { status: 400 });
  }

  const fileName = (file as File).name ?? "releve.pdf";

  // Extract text from PDF
  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);
  let rawText: string;
  try {
    rawText = await pdfToText(pdfBytes);
  } catch (err) {
    console.error("[tresorerie/import] PDF extraction error:", err);
    return NextResponse.json({ error: "Impossible de lire le PDF" }, { status: 400 });
  }

  // Parse the bank statement
  const parsed = parseBankStatement(rawText);

  if (parsed.operations.length === 0) {
    return NextResponse.json({
      error: "Aucune opération trouvée dans le relevé",
      rawTextPreview: rawText.slice(0, 500),
    }, { status: 400 });
  }

  // Load custom category rules for this establishment
  const { data: customRules } = await supabaseAdmin
    .from("bank_category_rules")
    .select("pattern, category")
    .eq("etablissement_id", etabId);

  const rules = (customRules ?? []) as { pattern: string; category: string }[];

  // Apply custom rules to override default categories
  for (const op of parsed.operations) {
    if (op.category === "autre" && rules.length > 0) {
      const upperLabel = op.label.toUpperCase();
      for (const rule of rules) {
        if (upperLabel.includes(rule.pattern.toUpperCase())) {
          op.category = rule.category;
          break;
        }
      }
    }
  }

  // Upsert operations — avoid duplicates via date + label + amount combo
  let imported = 0;
  let skipped = 0;

  for (const op of parsed.operations) {
    if (!op.operation_date) {
      skipped++;
      continue;
    }

    // Check for existing duplicate
    const { data: existing } = await supabaseAdmin
      .from("bank_operations")
      .select("id")
      .eq("etablissement_id", etabId)
      .eq("operation_date", op.operation_date)
      .eq("label", op.label)
      .eq("amount", op.amount)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const { error } = await supabaseAdmin
      .from("bank_operations")
      .insert({
        etablissement_id: etabId,
        user_id: userId,
        operation_date: op.operation_date,
        value_date: op.value_date,
        label: op.label,
        amount: op.amount,
        category: op.category,
        bank_account: parsed.account_number,
        statement_month: parsed.statement_month,
        source_file: fileName,
      });

    if (error) {
      console.error("[tresorerie/import] Insert error:", error.message);
      skipped++;
    } else {
      imported++;
    }
  }

  return NextResponse.json({
    success: true,
    imported,
    skipped,
    total: parsed.operations.length,
    statement_month: parsed.statement_month,
    account_number: parsed.account_number,
    opening_balance: parsed.opening_balance,
    closing_balance: parsed.closing_balance,
  });
}

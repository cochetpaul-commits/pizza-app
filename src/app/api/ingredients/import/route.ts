import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { roleDenied } from "@/lib/getEtablissement";
import { SHEET_PRODUITS } from "@/lib/ingredientsSheet";
import { importerClasseur } from "@/lib/ingredientsImport";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ingredients/import  (multipart : file, mode=preview|commit, etab=bellomio|piccola)
 * Relit le classeur produit par /api/ingredients/export. La logique vit dans
 * src/lib/ingredientsImport.ts (testable à sec).
 */
export async function POST(req: NextRequest) {
  const denied = await roleDenied(req, ["group_admin", "manager"]);
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "preview");
  const etabDefaut = String(form.get("etab") ?? "bellomio");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });

  let sheetRows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    const ws = wb.Sheets[SHEET_PRODUITS] ?? wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error("classeur vide");
    sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  } catch (e) {
    return NextResponse.json({ error: `Fichier illisible : ${e instanceof Error ? e.message : "format inconnu"}` }, { status: 400 });
  }
  if (sheetRows.length === 0) return NextResponse.json({ error: "Aucune ligne dans la feuille Produits" }, { status: 400 });

  let userId: string | null = null;
  if (mode === "commit") {
    const authHeader = req.headers.get("authorization") ?? "";
    const { data: auth } = await supabaseAdmin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    userId = auth?.user?.id ?? null;
  }
  const r = await importerClasseur(sheetRows, mode, etabDefaut, userId);
  return NextResponse.json(r.body, { status: r.status });
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectCategoryFromName, normalizeIngredientName } from "@/lib/invoices/categoryDetector";
import { detectAllergensFromName } from "@/lib/invoices/allergenDetector";
import type { Category } from "@/types/ingredients";

const execFileAsync = promisify(execFile);

// ── Types partagés ─────────────────────────────────────────────────────────────

export interface ParsedLine {
  sku: string | null;
  name: string | null;
  quantity: number | null;
  unit: "pc" | "kg" | "l" | null;
  unit_price: number | null;
  total_price: number | null;
  tax_rate: number | null;
  notes: string | null;
  piece_weight_g: number | null;
  piece_volume_ml: number | null;
}

export interface ParsedInvoice {
  invoice_number: string | null;
  invoice_date: string | null;
  total_ht: number | null;
  total_ttc: number | null;
  lines: ParsedLine[];
}

export interface ImportResult {
  supplierId: string;
  invoiceId: string;
  invoiceAlreadyImported: boolean;
  ingredientsCreated: number;
  offersInserted: number;
}

// ── Utilitaires ────────────────────────────────────────────────────────────────

function toText(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export async function pdfToText(
  pdfBytes: Uint8Array,
  { prefix, flags }: { prefix: string; flags: string[] }
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const pdfPath = path.join(dir, "invoice.pdf");

  try {
    await fs.writeFile(pdfPath, pdfBytes);
    const { stdout } = await execFileAsync("pdftotext", [...flags, pdfPath, "-"]);
    return toText(stdout);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : toText(e);
    if (String(msg).toLowerCase().includes("enoent")) {
      throw new Error("pdftotext introuvable. Installe Poppler: brew install poppler");
    }
    throw new Error(`pdftotext échec: ${msg}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => null);
  }
}

export function ddmmyyyyToIsoDate(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function notesWithTax(base: string | null, taxRate: number | null): string | null {
  const parts: string[] = [];
  if (base) parts.push(base);
  if (taxRate != null) parts.push(`TVA=${taxRate}`);
  return parts.length ? parts.join(" | ") : null;
}

function toOfferUnit(u: "pc" | "kg" | "l" | null): "pc" | "kg" | "l" | null {
  if (u === "pc") return "pc";
  if (u === "kg") return "kg";
  if (u === "l") return "l";
  return null;
}

// ── Moteur d'import ────────────────────────────────────────────────────────────

export async function runImport(options: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>;
  userId: string;
  supplierName: string;
  payload: ParsedInvoice;
  sourceFileName: string;
  rawText: string;
  mode: string;
  defaultUnit?: "g" | "pc" | "kg" | "l";
  establishment?: "bellomio" | "piccola" | "both";
  filterLine?: (l: ParsedLine) => boolean;
}): Promise<ImportResult> {
  const {
    supabase,
    userId,
    supplierName,
    payload,
    sourceFileName,
    rawText,
    mode,
    defaultUnit = "g",
    establishment = "both",
    filterLine,
  } = options;

  // 1. Upsert supplier
  const { data: supRows, error: supErr } = await supabase
    .from("suppliers")
    .upsert({ user_id: userId, name: supplierName, is_active: true }, { onConflict: "user_id,name" })
    .select("id")
    .limit(1);

  if (supErr) throw new Error(supErr.message);
  const supplierId = (supRows?.[0]?.id as string | undefined) ?? null;
  if (!supplierId) throw new Error(`Supplier ${supplierName}: id manquant`);

  // 2. Déduplication facture
  const invoiceNumber = payload.invoice_number ?? null;
  const invoiceDateIso = ddmmyyyyToIsoDate(payload.invoice_date);
  let invoiceId: string | null = null;
  let invoiceAlreadyImported = false;

  if (invoiceNumber) {
    const { data: existing, error: exErr } = await supabase
      .from("supplier_invoices")
      .select("id")
      .eq("user_id", userId)
      .eq("supplier_id", supplierId)
      .eq("invoice_number", invoiceNumber)
      .limit(1);

    if (exErr) throw new Error(exErr.message);

    if (existing && existing.length > 0) {
      invoiceId = existing[0].id as string;
      invoiceAlreadyImported = true;
    }
  }

  // 3. Insert facture si nouvelle
  if (!invoiceId) {
    const { data: invRows, error: invErr } = await supabase
      .from("supplier_invoices")
      .insert({
        user_id: userId,
        supplier_id: supplierId,
        supplier_name: supplierName,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDateIso,
        total_ht: payload.total_ht,
        total_ttc: payload.total_ttc,
        currency: "EUR",
        source_file_name: sourceFileName,
        raw_text: rawText,
        parsed_json: payload,
      })
      .select("id")
      .limit(1);

    if (invErr) throw new Error(invErr.message);

    invoiceId = (invRows?.[0]?.id as string | undefined) ?? null;
    if (!invoiceId) throw new Error("Insert invoice: id manquant");
  }

  // 4. Insert lignes si absentes
  {
    const { count: linesCount } = await supabase
      .from("supplier_invoice_lines")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("invoice_id", invoiceId);

    if ((linesCount ?? 0) === 0) {
      const lineInserts = payload.lines.map((l) => ({
        user_id: userId,
        invoice_id: invoiceId,
        supplier_id: supplierId,
        sku: l.sku,
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.unit_price,
        total_price: l.total_price,
        notes: notesWithTax(l.notes, l.tax_rate),
      }));

      if (lineInserts.length) {
        const { error: linesErr } = await supabase.from("supplier_invoice_lines").insert(lineInserts);
        if (linesErr) throw new Error(linesErr.message);
      }
    }
  }

  // 5. Retour précoce pour preview
  if (mode !== "commit") {
    return { supplierId, invoiceId, invoiceAlreadyImported, ingredientsCreated: 0, offersInserted: 0 };
  }

  // 6. COMMIT : lookup ingrédients normalisé
  const { data: catRows, error: catErr } = await supabase
    .from("ingredients")
    .select("category")
    .eq("user_id", userId)
    .limit(1);

  if (catErr) throw new Error(catErr.message);
  const fallbackCategory = (catRows?.[0]?.category as string | undefined) ?? "autre";

  const statusNote = `import ${supplierName}${invoiceNumber ? " " + invoiceNumber : ""}${payload.invoice_date ? " " + payload.invoice_date : ""}`.trim();

  let ingredientsCreated = 0;
  let offersInserted = 0;

  const allLines = (payload.lines ?? []).filter((l) => (l.name ?? "").trim().length > 0);
  const lines = filterLine ? allLines.filter(filterLine) : allLines;

  if (lines.length) {
    const skus = Array.from(
      new Set(lines.map((l) => (l.sku ?? "").trim()).filter((s) => s.length > 0))
    );
    const names = Array.from(
      new Set(lines.map((l) => (l.name ?? "").trim()).filter((s) => s.length > 0))
    );

    const skuToIngId = new Map<string, string>();
    if (skus.length) {
      const { data: bySku, error: eSku } = await supabase
        .from("ingredients")
        .select("id,supplier_sku")
        .eq("user_id", userId)
        .eq("supplier_id", supplierId)
        .in("supplier_sku", skus);

      if (eSku) throw new Error(eSku.message);
      for (const r of (bySku ?? []) as Array<{ id: string; supplier_sku: string | null }>) {
        const k = String(r.supplier_sku ?? "").trim();
        if (k) skuToIngId.set(k, r.id);
      }
    }

    // Lookup par nom exact ET normalisé pour éviter les doublons (apostrophes, accents)
    const nameToIngId = new Map<string, string>();
    const normalizedToIngId = new Map<string, string>();
    const { data: allExisting, error: eAll } = await supabase
      .from("ingredients")
      .select("id,name")
      .eq("user_id", userId);

    if (eAll) throw new Error(eAll.message);
    for (const r of (allExisting ?? []) as Array<{ id: string; name: string }>) {
      const n = (r.name ?? "").trim();
      nameToIngId.set(n.toLowerCase(), r.id);
      normalizedToIngId.set(normalizeIngredientName(n), r.id);
    }

    // 7. Création des ingrédients manquants
    const toCreate: Array<Record<string, unknown>> = [];
    for (const l of lines) {
      const sku = (l.sku ?? "").trim();
      const nm = (l.name ?? "").trim().toUpperCase();
      if (!nm) continue;

      const already =
        (sku && skuToIngId.has(sku)) ||
        nameToIngId.has(nm.toLowerCase()) ||
        normalizedToIngId.has(normalizeIngredientName(nm));
      if (already) continue;

      const cat = (detectCategoryFromName(nm) ?? fallbackCategory) as Category;

      // piece_volume_ml : valeur parsée, ou 750ml par défaut pour les boissons/alcools
      let pieceVolumeMl: number | null = l.piece_volume_ml ?? null;
      if (pieceVolumeMl == null && l.unit === "pc" && (cat === "alcool_spiritueux" || cat === "boisson")) {
        pieceVolumeMl = 750;
      }

      const allergens = detectAllergensFromName(nm);

      toCreate.push({
        user_id: userId,
        name: nm,
        category: cat,
        allergens: allergens.length ? allergens : null,
        is_active: true,
        default_unit: defaultUnit,
        supplier: supplierName,
        supplier_id: supplierId,
        default_supplier_id: supplierId,
        supplier_sku: sku || null,
        status: "to_check",
        status_note: statusNote,
        piece_volume_ml: pieceVolumeMl,
      });
    }

    if (toCreate.length) {
      let created = 0;
      for (const row of toCreate) {
        const ins = await supabase.from("ingredients").insert(row);
        if (!ins.error) {
          created++;
        } else if ((ins.error as { code?: string }).code !== "23505") {
          throw new Error(ins.error.message);
        } else {
          console.log("skip duplicate:", row.name);
        }
      }
      ingredientsCreated = created;
    }

    // 8. Re-fetch maps après création
    if (skus.length) {
      const { data: bySku2, error: eSku2 } = await supabase
        .from("ingredients")
        .select("id,supplier_sku")
        .eq("user_id", userId)
        .eq("supplier_id", supplierId)
        .in("supplier_sku", skus);

      if (eSku2) throw new Error(eSku2.message);
      for (const r of (bySku2 ?? []) as Array<{ id: string; supplier_sku: string | null }>) {
        const k = String(r.supplier_sku ?? "").trim();
        if (k) skuToIngId.set(k, r.id);
      }
    }

    if (names.length) {
      const { data: byName2, error: eName2 } = await supabase
        .from("ingredients")
        .select("id,name")
        .eq("user_id", userId)
        .in("name", names);

      if (eName2) throw new Error(eName2.message);
      for (const r of (byName2 ?? []) as Array<{ id: string; name: string }>) {
        const n = (r.name ?? "").trim();
        nameToIngId.set(n.toLowerCase(), r.id);
        normalizedToIngId.set(normalizeIngredientName(n), r.id);
      }
    }

    // 9. Construction offres + deactivate anciens + insert nouveaux
    const offerCandidates = lines
      .map((l) => {
        const sku = (l.sku ?? "").trim();
        const nm = (l.name ?? "").trim().toUpperCase();
        const ingId =
          (sku && skuToIngId.get(sku)) ||
          nameToIngId.get(nm.toLowerCase()) ||
          normalizedToIngId.get(normalizeIngredientName(nm)) ||
          null;

        const u = toOfferUnit(l.unit);
        const p = l.unit_price;

        if (!ingId || !u || !(p != null && Number.isFinite(p) && p > 0)) return null;

        return {
          user_id: userId,
          ingredient_id: ingId,
          supplier_id: supplierId,
          supplier_sku: l.sku,
          supplier_label: l.name,
          price_kind: "unit",
          unit: u,
          unit_price: p,
          price: p,
          currency: "EUR",
          is_active: true,
          piece_weight_g: l.unit === "pc" ? (l.piece_weight_g ?? null) : null,
          density_kg_per_l: null,
          establishment,
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;

    const offerByIngredient = new Map<string, Record<string, unknown>>();
    for (const o of offerCandidates) {
      offerByIngredient.set(String(o.ingredient_id), o);
    }

    const offerRows = Array.from(offerByIngredient.values());

    if (offerRows.length) {
      const ingredientIds = Array.from(new Set(offerRows.map((x) => String(x.ingredient_id))));

      const dPrev = await supabase
        .from("supplier_offers")
        .update({ is_active: false })
        .eq("supplier_id", supplierId)
        .in("ingredient_id", ingredientIds)
        .eq("is_active", true);

      if (dPrev.error) throw new Error(dPrev.error.message);

      for (const row of offerRows) {
        const ingId = String(row.ingredient_id);
        let r = await supabase.from("supplier_offers").insert(row);

        if (r.error && (r.error as { code?: string }).code === "23505") {
          const d2 = await supabase
            .from("supplier_offers")
            .update({ is_active: false })
            .eq("supplier_id", supplierId)
            .eq("ingredient_id", ingId)
            .eq("is_active", true);

          if (d2.error) throw new Error(d2.error.message);
          r = await supabase.from("supplier_offers").insert(row);
        }

        if (r.error) throw new Error(r.error.message);
        offersInserted += 1;
      }
    }
  }

  return { supplierId, invoiceId, invoiceAlreadyImported, ingredientsCreated, offersInserted };
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectCategoryFromName, normalizeIngredientName } from "@/lib/invoices/categoryDetector";
import { detectAllergensFromName } from "@/lib/invoices/allergenDetector";
import { extractPackFromName, extractVolumeFromName, extractWeightGFromName } from "@/lib/invoices/utils";
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

/** Extract the base product name by stripping trailing weight/packaging info.
 *  "BURRATA DE VACHE 8 X 200 G" → "burrata de vache"
 *  "BLANC D'OEUF LIQUIDE 1 KG"  → "blanc d'oeuf liquide"
 *  "CREAM CHEESE 25%"            → "cream cheese"
 */
function baseProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\d+\s*%/g, "")                    // remove percentages
    .replace(/\d[\d\s.,xX×]*\s*(g|gr|kg|ml|cl|l|pc|pcs|pce|pces)\b/gi, "")  // remove weight/volume
    .replace(/\d+\s*x\s*\d+/gi, "")             // remove "8 x 200" patterns
    .replace(/\b(c\d+|fb\d+)\b/gi, "")          // remove codes like C1, FB7060
    .replace(/\s+/g, " ")
    .trim();
}

function toOfferUnit(u: "pc" | "kg" | "l" | null): "pc" | "kg" | "l" {
  if (u === "kg") return "kg";
  if (u === "l") return "l";
  return "pc"; // default to piece when unit unknown
}

// ── Supplier category auto-detection ──────────────────────────────────────────

const SUPPLIER_CATEGORY: Record<string, string> = {
  metro: "alimentaire_general",
  mael: "cremerie_frais",
  maël: "cremerie_frais",
  vinoflo: "vins",
  cozigou: "boissons_spiritueux",
  carniato: "viande_charcuterie",
  "bar spirits": "spiritueux",
  barspirits: "spiritueux",
  sum: "alimentaire_general",
  armor: "emballage",
  masse: "surgeles",
  elien: "glaces",
  sdpf: "produits_fins",
  progourmands: "produits_fins",
  lmdw: "spiritueux",
};

function detectSupplierCategory(name: string): string | null {
  const lower = name.toLowerCase().trim();
  return SUPPLIER_CATEGORY[lower] ?? null;
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
  etabId?: string;
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
    etabId,
    filterLine,
  } = options;

  // 1. Upsert supplier (normalize name to Title Case to avoid duplicates)
  const normalizedName = supplierName
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  const supplierRow: Record<string, unknown> = { user_id: userId, name: normalizedName, is_active: true };
  if (etabId) supplierRow.etablissement_id = etabId;
  const { data: supRows, error: supErr } = await supabase
    .from("suppliers")
    .upsert(supplierRow, { onConflict: "etablissement_id,name" })
    .select("id,category")
    .limit(1);

  if (supErr) throw new Error(supErr.message);
  const supplierId = (supRows?.[0]?.id as string | undefined) ?? null;
  if (!supplierId) throw new Error(`Supplier ${normalizedName}: id manquant`);

  // Auto-fill category if not yet set
  const existingCat = supRows?.[0]?.category as string | null;
  if (!existingCat) {
    const detectedCat = detectSupplierCategory(normalizedName);
    if (detectedCat) {
      await supabase.from("suppliers").update({ category: detectedCat }).eq("id", supplierId);
    }
  }

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
    const invoiceRow: Record<string, unknown> = {
        user_id: userId,
        supplier_id: supplierId,
        supplier_name: normalizedName,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDateIso,
        total_ht: payload.total_ht,
        total_ttc: payload.total_ttc,
        currency: "EUR",
        source_file_name: sourceFileName,
        raw_text: rawText,
        parsed_json: payload,
      };
    if (etabId) invoiceRow.etablissement_id = etabId;
    const { data: invRows, error: invErr } = await supabase
      .from("supplier_invoices")
      .insert(invoiceRow)
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
  let catQ = supabase
    .from("ingredients")
    .select("category")
    .eq("user_id", userId);
  if (etabId) catQ = catQ.eq("etablissement_id", etabId);
  const { data: catRows, error: catErr } = await catQ.limit(1);

  if (catErr) throw new Error(catErr.message);
  const fallbackCategory = (catRows?.[0]?.category as string | undefined) ?? "autre";

  const statusNote = `import ${normalizedName}${invoiceNumber ? " " + invoiceNumber : ""}${payload.invoice_date ? " " + payload.invoice_date : ""}`.trim();

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
      // Do NOT filter by etablissement_id here — dedup must be global to avoid duplicates
      const skuQ = supabase
        .from("ingredients")
        .select("id,supplier_sku")
        .eq("user_id", userId)
        .eq("supplier_id", supplierId)
        .in("supplier_sku", skus);
      const { data: bySku, error: eSku } = await skuQ;

      if (eSku) throw new Error(eSku.message);
      for (const r of (bySku ?? []) as Array<{ id: string; supplier_sku: string | null }>) {
        const k = String(r.supplier_sku ?? "").trim();
        if (k) skuToIngId.set(k, r.id);
      }
    }

    // Lookup par nom exact ET normalisé pour éviter les doublons (apostrophes, accents)
    // Utilise import_name comme clé stable ; fallback sur name pour rétrocompatiblité.
    const nameToIngId = new Map<string, string>();
    const normalizedToIngId = new Map<string, string>();
    // Do NOT filter by etablissement_id — dedup must be global to find validated ingredients
    const allQ = supabase
      .from("ingredients")
      .select("id,name,import_name")
      .eq("user_id", userId);
    const { data: allExisting, error: eAll } = await allQ;

    if (eAll) throw new Error(eAll.message);
    const baseNameToIngId = new Map<string, string>();
    for (const r of (allExisting ?? []) as Array<{ id: string; name: string; import_name: string | null }>) {
      // Clé primaire = import_name (stable) ; si absent, fallback sur name
      const primary = ((r.import_name ?? r.name) ?? "").trim();
      nameToIngId.set(primary.toLowerCase(), r.id);
      normalizedToIngId.set(normalizeIngredientName(primary), r.id);
      // Base name index (strips weight/packaging) for fuzzy matching
      const bn = baseProductName(primary);
      if (bn.length >= 3 && !baseNameToIngId.has(bn)) {
        baseNameToIngId.set(bn, r.id);
      }
      // Indexer aussi le name courant comme fallback (rétrocompat : ancien import_name non renseigné)
      if (r.import_name && r.name) {
        const legacy = (r.name ?? "").trim();
        if (legacy.toLowerCase() !== primary.toLowerCase()) {
          nameToIngId.set(legacy.toLowerCase(), r.id);
          normalizedToIngId.set(normalizeIngredientName(legacy), r.id);
          const bnLegacy = baseProductName(legacy);
          if (bnLegacy.length >= 3 && !baseNameToIngId.has(bnLegacy)) {
            baseNameToIngId.set(bnLegacy, r.id);
          }
        }
      }
    }

    // 7. Création des ingrédients manquants
    const toCreate: Array<Record<string, unknown>> = [];
    for (const l of lines) {
      const sku = (l.sku ?? "").trim();
      const nm = (l.name ?? "").trim().toUpperCase();
      if (!nm) continue;

      let already =
        (sku && skuToIngId.has(sku)) ||
        nameToIngId.has(nm.toLowerCase()) ||
        normalizedToIngId.has(normalizeIngredientName(nm));
      // Fallback 1: prefix match — existing ingredient name is prefix of parsed name
      if (!already) {
        const nmLower = nm.toLowerCase();
        for (const [existingName, existingId] of nameToIngId) {
          if (nmLower.startsWith(existingName + " ") || existingName.startsWith(nmLower + " ")) {
            nameToIngId.set(nmLower, existingId);
            normalizedToIngId.set(normalizeIngredientName(nm), existingId);
            already = true;
            break;
          }
        }
      }
      // Fallback 2: base name match — strips weight/packaging (e.g. "BURRATA DE VACHE")
      if (!already) {
        const bn = baseProductName(nm);
        const matchId = bn.length >= 3 ? baseNameToIngId.get(bn) : undefined;
        if (matchId) {
          nameToIngId.set(nm.toLowerCase(), matchId);
          normalizedToIngId.set(normalizeIngredientName(nm), matchId);
          already = true;
        }
      }
      if (already) continue;

      const cat = (detectCategoryFromName(nm) ?? fallbackCategory) as Category;

      // piece_volume_ml : valeur parsée, ou 750ml par défaut pour les boissons/alcools
      let pieceVolumeMl: number | null = l.piece_volume_ml ?? null;
      if (pieceVolumeMl == null && l.unit === "pc" && (cat === "alcool_spiritueux" || cat === "boisson")) {
        pieceVolumeMl = 750;
      }

      const allergens = detectAllergensFromName(nm);

      // piece_weight_g : valeur parsée si unité pièce et pas de volume détecté
      let pieceWeightG: number | null = null;
      if (l.unit === "pc" && pieceVolumeMl == null) {
        pieceWeightG = l.piece_weight_g ?? extractWeightGFromName(nm);
      }

      // storage_zone : auto-détection basée sur la catégorie
      let storageZone: string | null = null;
      if (cat === "cremerie_fromage" || cat === "maree" || cat === "charcuterie_viande" || cat === "legumes_herbes" || cat === "fruit") {
        storageZone = "FRIGO";
      } else if (cat === "alcool_spiritueux") {
        storageZone = "CAVE A VIN";
      } else if (cat === "boisson") {
        storageZone = "BAR";
      }

      const ingRow: Record<string, unknown> = {
        user_id: userId,
        name: nm,
        import_name: nm, // clé stable pour les futurs imports — ne jamais modifier auto
        category: cat,
        allergens: allergens.length ? allergens : null,
        is_active: true,
        default_unit: defaultUnit,
        supplier: normalizedName,
        supplier_id: supplierId,
        default_supplier_id: supplierId,
        supplier_sku: sku || null,
        status: "to_check",
        status_note: statusNote,
        piece_volume_ml: pieceVolumeMl,
        piece_weight_g: pieceWeightG,
        storage_zone: storageZone,
      };
      if (etabId) ingRow.etablissement_id = etabId;
      // Always assign both establishments — user refines at validation
      ingRow.establishments = ["bellomio", "piccola"];
      toCreate.push(ingRow);
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
          // skip duplicate
        }
      }
      ingredientsCreated = created;
    }

    // 8. Re-fetch maps après création
    if (skus.length) {
      const skuQ2 = supabase
        .from("ingredients")
        .select("id,supplier_sku")
        .eq("user_id", userId)
        .eq("supplier_id", supplierId)
        .in("supplier_sku", skus);
      const { data: bySku2, error: eSku2 } = await skuQ2;

      if (eSku2) throw new Error(eSku2.message);
      for (const r of (bySku2 ?? []) as Array<{ id: string; supplier_sku: string | null }>) {
        const k = String(r.supplier_sku ?? "").trim();
        if (k) skuToIngId.set(k, r.id);
      }
    }

    // Re-fetch by name — use UPPERCASE names to match what was created in step 7
    const upperNames = names.map(n => n.toUpperCase());
    const allNames = [...new Set([...names, ...upperNames])];
    if (allNames.length) {
      const nameQ2 = supabase
        .from("ingredients")
        .select("id,name,import_name")
        .eq("user_id", userId)
        .in("name", allNames);
      const { data: byName2, error: eName2 } = await nameQ2;

      if (eName2) throw new Error(eName2.message);
      for (const r of (byName2 ?? []) as Array<{ id: string; name: string; import_name: string | null }>) {
        const primary = ((r.import_name ?? r.name) ?? "").trim();
        nameToIngId.set(primary.toLowerCase(), r.id);
        normalizedToIngId.set(normalizeIngredientName(primary), r.id);
      }
    }

    // 9. Construction offres + deactivate anciens + insert nouveaux
    const offerCandidates = lines
      .map((l) => {
        const sku = (l.sku ?? "").trim();
        const nm = (l.name ?? "").trim().toUpperCase();
        let ingId =
          (sku && skuToIngId.get(sku)) ||
          nameToIngId.get(nm.toLowerCase()) ||
          normalizedToIngId.get(normalizeIngredientName(nm)) ||
          null;
        // Fallback 1: prefix match
        if (!ingId) {
          const nmLower = nm.toLowerCase();
          for (const [existingName, existingId] of nameToIngId) {
            if (nmLower.startsWith(existingName + " ") || existingName.startsWith(nmLower + " ")) {
              ingId = existingId;
              break;
            }
          }
        }
        // Fallback 2: base name match (strips weight/packaging)
        if (!ingId) {
          const bn = baseProductName(nm);
          ingId = (bn.length >= 3 ? baseNameToIngId.get(bn) : undefined) ?? null;
        }

        const u = toOfferUnit(l.unit);
        const p = l.unit_price;

        if (!ingId || !u || !(p != null && Number.isFinite(p) && p > 0)) return null;

        // Detect pack from product name (e.g., "LAIT 1L X6", "BIERE 33CL X24")
        const packInfo = l.name ? extractPackFromName(l.name) : null;
        const volumeFromName = l.name ? extractVolumeFromName(l.name) : null;

        const offerRow: Record<string, unknown> = {
          user_id: userId,
          ingredient_id: ingId,
          supplier_id: supplierId,
          supplier_sku: l.sku,
          supplier_label: l.name,
          currency: "EUR",
          is_active: true,
          density_kg_per_l: null,
          establishment: "both",
        };

        if (packInfo && packInfo.count > 1 && l.total_price && l.total_price > 0) {
          // Pack detected — use pack_composed or pack_simple
          offerRow.price_kind = "pack_composed";
          offerRow.pack_price = p * (l.quantity ?? 1) > l.total_price ? l.total_price / (l.quantity ?? 1) : p;
          offerRow.price = offerRow.pack_price;
          offerRow.pack_count = packInfo.count;
          offerRow.unit_price = (offerRow.pack_price as number) / packInfo.count;
          if (packInfo.eachQty != null && packInfo.eachUnit) {
            offerRow.pack_each_qty = packInfo.eachQty;
            offerRow.pack_each_unit = packInfo.eachUnit === "cl" || packInfo.eachUnit === "ml" || packInfo.eachUnit === "l" ? "l" : "kg";
          } else {
            offerRow.pack_each_unit = "pc";
          }
          offerRow.piece_weight_g = l.piece_weight_g ?? null;
        } else {
          // Standard unit pricing
          offerRow.price_kind = "unit";
          offerRow.unit = u;
          offerRow.unit_price = p;
          offerRow.price = p;
          offerRow.piece_weight_g = l.unit === "pc" ? (l.piece_weight_g ?? null) : null;
        }

        // piece_volume_ml belongs on ingredients table, not supplier_offers
        delete offerRow.piece_volume_ml;
        if (etabId) offerRow.etablissement_id = etabId;
        return offerRow;
      })
      .filter(Boolean) as Array<Record<string, unknown>>;

    const offerByIngredient = new Map<string, Record<string, unknown>>();
    for (const o of offerCandidates) {
      offerByIngredient.set(String(o.ingredient_id), o);
    }

    const offerRows = Array.from(offerByIngredient.values());

    if (offerRows.length) {
      const ingredientIds = Array.from(new Set(offerRows.map((x) => String(x.ingredient_id))));

      // Deactivate previous offers for ALL ingredients (including validated ones)
      // Validation protects ingredient metadata, not prices — imports must always update prices
      if (ingredientIds.length) {
        const dPrev = await supabase
          .from("supplier_offers")
          .update({ is_active: false })
          .eq("supplier_id", supplierId)
          .in("ingredient_id", ingredientIds)
          .eq("is_active", true);

        if (dPrev.error) throw new Error(dPrev.error.message);
      }

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

    // 10. Ensure all matched ingredients have both establishments set
    {
      const allIngIds = Array.from(offerByIngredient.keys());
      if (allIngIds.length) {
        const { data: estabRows } = await supabase
          .from("ingredients")
          .select("id,establishments")
          .in("id", allIngIds);

        for (const row of (estabRows ?? []) as Array<{ id: string; establishments: string[] | null }>) {
          const current: string[] = row.establishments ?? [];
          const target = ["bellomio", "piccola"];
          const missing = target.filter((e) => !current.includes(e));
          if (missing.length > 0) {
            await supabase
              .from("ingredients")
              .update({ establishments: [...current, ...missing] })
              .eq("id", row.id);
          }
        }
      }
    }
  }

  return { supplierId, invoiceId, invoiceAlreadyImported, ingredientsCreated, offersInserted };
}

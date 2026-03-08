import { NextResponse } from "next/server";
import { pdfToText } from "@/lib/pdfToText";
import { createClient } from "@supabase/supabase-js";
import { detectCategoryFromName } from "@/lib/invoices/categoryDetector";
import { parseCarniatoInvoiceText, type ParsedInvoice } from "@/lib/invoices/carniato";

export const runtime = "nodejs";

function ddmmyyyyToIsoDate(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
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

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") ?? "preview");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Fichier manquant (field: file)." }, { status: 400 });
    }

    const name = file.name || "";
    if (!name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, error: "Seuls les .pdf sont supportés sur CARNIATO." }, { status: 400 });
    }

    const ab = await file.arrayBuffer();
    const bytes = new Uint8Array(ab);

    const text = await pdfToText(bytes);
    const payload: ParsedInvoice = parseCarniatoInvoiceText(text);

    const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anon = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
    });

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });

    const userId = auth?.user?.id ?? null;
    if (!userId) return NextResponse.json({ ok: false, error: "Non authentifié (Supabase user manquant)." }, { status: 401 });

    const supplierName = "CARNIATO";

    const { data: supRows, error: supErr } = await supabase
      .from("suppliers")
      .upsert({ user_id: userId, name: supplierName, is_active: true }, { onConflict: "user_id,name" })
      .select("id")
      .limit(1);

    if (supErr) throw new Error(supErr.message);

    const supplierId = (supRows?.[0]?.id as string | undefined) ?? null;
    if (!supplierId) throw new Error("Supplier CARNIATO: id manquant");

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
          source_file_name: name,
          raw_text: text,
          parsed_json: payload,
        })
        .select("id")
        .limit(1);

      if (invErr) throw new Error(invErr.message);

      invoiceId = (invRows?.[0]?.id as string | undefined) ?? null;
      if (!invoiceId) throw new Error("Insert invoice: id manquant");
    }

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

    if (mode !== "commit") {
      return NextResponse.json({
        ok: true,
        kind: "carniato",
        filename: name,
        bytes: bytes.byteLength,
        invoice: { id: invoiceId, already_imported: invoiceAlreadyImported },
        inserted: { supplier_id: supplierId, ingredients_upserted: 0, offers_inserted: 0 },
        parsed: payload,
      });
    }

    const { data: catRows, error: catErr } = await supabase
      .from("ingredients")
      .select("category")
      .eq("user_id", userId)
      .limit(1);

    if (catErr) throw new Error(catErr.message);
    const fallbackCategory = (catRows?.[0]?.category as string | undefined) ?? "autre";

    const statusNote = `import ${supplierName}${invoiceNumber ? " " + invoiceNumber : ""}${payload.invoice_date ? " " + payload.invoice_date : ""}`.trim();

    let ingCreated = 0;
    let offersInserted = 0;

    const lines = (payload.lines ?? []).filter((l) => (l.name ?? "").trim().length > 0);

    if (lines.length) {
      const skus = Array.from(new Set(lines.map((l) => (l.sku ?? "").trim()).filter((s) => s.length > 0)));
      const names = Array.from(new Set(lines.map((l) => (l.name ?? "").trim()).filter((s) => s.length > 0)));

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

      const nameToIngId = new Map<string, string>();
      if (names.length) {
        const { data: byName, error: eName } = await supabase
          .from("ingredients")
          .select("id,name")
          .eq("user_id", userId)
          .in("name", names);
        if (eName) throw new Error(eName.message);
        for (const r of (byName ?? []) as Array<{ id: string; name: string }>) {
          nameToIngId.set((r.name ?? "").trim().toLowerCase(), r.id);
        }
      }

      const toCreate: Array<Record<string, unknown>> = [];
      for (const l of lines) {
        const sku = (l.sku ?? "").trim();
        const nm = (l.name ?? "").trim();
        if (!nm) continue;
        const already = (sku && skuToIngId.has(sku)) || nameToIngId.has(nm.toLowerCase());
        if (already) continue;
        toCreate.push({
          user_id: userId,
          name: nm,
          category: (detectCategoryFromName(nm) ?? fallbackCategory) as import("@/types/ingredients").Category,
          allergens: null,
          is_active: true,
          default_unit: "g",
          supplier: supplierName,
          supplier_id: supplierId,
          default_supplier_id: supplierId,
          supplier_sku: sku || null,
          status: "to_check",
          status_note: statusNote,
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
          }
        }
        ingCreated = created;
      }

      // Reload IDs after creation
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
          nameToIngId.set((r.name ?? "").trim().toLowerCase(), r.id);
        }
      }

      const offerCandidates = lines
        .map((l) => {
          const sku = (l.sku ?? "").trim();
          const nm = (l.name ?? "").trim();
          const ingId = (sku && skuToIngId.get(sku)) || nameToIngId.get(nm.toLowerCase()) || null;
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
            piece_weight_g: null,
            density_kg_per_l: null,
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      const offerByIngredient = new Map<string, Record<string, unknown>>();
      for (const o of offerCandidates) offerByIngredient.set(String(o.ingredient_id), o);
      const offerRows = Array.from(offerByIngredient.values());

      if (offerRows.length) {
        const ingredientIds = Array.from(new Set(offerRows.map((x) => String(x.ingredient_id))));

        // Skip validated ingredients — don't touch their active offers
        const validatedIds = new Set<string>();
        const { data: stRows } = await supabase.from("ingredients").select("id").in("id", ingredientIds).eq("status", "validated");
        for (const r of (stRows ?? []) as Array<{ id: string }>) validatedIds.add(r.id);

        const mutableIds = ingredientIds.filter((id) => !validatedIds.has(id));
        if (mutableIds.length) {
          const dPrev = await supabase.from("supplier_offers").update({ is_active: false }).eq("supplier_id", supplierId).in("ingredient_id", mutableIds).eq("is_active", true);
          if (dPrev.error) throw new Error(dPrev.error.message);
        }

        for (const row of offerRows) {
          const ingId = String(row.ingredient_id);
          const isValidated = validatedIds.has(ingId);
          if (isValidated) row.is_active = false;

          let r = await supabase.from("supplier_offers").insert(row);
          if (r.error && (r.error as { code?: string }).code === "23505") {
            if (!isValidated) {
              await supabase.from("supplier_offers").update({ is_active: false }).eq("supplier_id", supplierId).eq("ingredient_id", ingId).eq("is_active", true);
            }
            r = await supabase.from("supplier_offers").insert(row);
          }
          if (r.error) throw new Error(r.error.message);
          offersInserted += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      kind: "carniato",
      filename: name,
      bytes: bytes.byteLength,
      invoice: { id: invoiceId, already_imported: invoiceAlreadyImported },
      inserted: { supplier_id: supplierId, ingredients_created: ingCreated, offers_inserted: offersInserted },
      parsed: payload,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e || "Erreur import");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { KitchenPdfDocument, type KitchenPdfData } from "@/lib/kitchenPdf";
import { photoToBase64 } from "@/lib/photoToBase64";
import fs from "fs";
import path from "path";
import { POLE_COLORS } from "@/lib/poleColors";
import { parseAllergens, mergeAllergens } from "@/lib/allergens";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function n2(v: unknown) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function readLogoBase64(): string | null {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo-ifratelli.png");
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

type KitchenRow = {
  id: string;
  name: string | null;
  category: string | null;
  yield_grams: number | null;
  portions_count: number | null;
  notes: string | null;
  procedure: string | null;
  photo_url: string | null;
  sell_price: number | null;
  establishments: string[] | null;
};

type LineRow = {
  ingredient_id: string;
  qty: number | null;
  unit: string | null;
  sort_order: number | null;
};

type IngRow = {
  id: string;
  name: string | null;
  cost_per_unit: number | null;
  allergens: unknown;
  supplier_id: string | null;
  rendement: number | null;
  source: string | null;
  recipe_id: string | null;
};

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const SUPABASE_ANON_KEY = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let etabId: string;
    try {
      ({ etabId } = await getEtablissement(req));
    } catch (e) {
      if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const body = (await req.json().catch(() => null)) as unknown;
    const b = (body && typeof body === "object") ? (body as Record<string, unknown>) : {};
    const kitchenId = String(b.kitchenId ?? b.recipeId ?? b.id ?? "").trim();
    if (!kitchenId) {
      return NextResponse.json({ message: "kitchenId manquant" }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });

    const { data: recipe, error: rErr } = await supabase
      .from("kitchen_recipes")
      .select("id,name,category,yield_grams,portions_count,notes,procedure,photo_url,sell_price,establishments")
      .eq("id", kitchenId)
      .eq("etablissement_id", etabId)
      .maybeSingle();

    if (rErr) return NextResponse.json({ message: rErr.message, details: rErr.details ?? null }, { status: 500 });
    if (!recipe) return NextResponse.json({ message: "Recette introuvable" }, { status: 404 });

    const rr = recipe as KitchenRow;

    const { data: ln, error: lErr } = await supabase
      .from("kitchen_recipe_lines")
      .select("ingredient_id,qty,unit,sort_order")
      .eq("recipe_id", kitchenId)
      .order("sort_order", { ascending: true });

    if (lErr) return NextResponse.json({ message: lErr.message, details: lErr.details ?? null }, { status: 500 });

    const lineRows = ((ln ?? []) as LineRow[]).slice();
    const ingredientIds = Array.from(new Set(lineRows.map((r) => String(r.ingredient_id || "")).filter(Boolean)));

    type IngMeta = {
      name: string | null;
      cpu: number;
      supplierId: string | null;
      rendement: number;
      isSubRecipe: boolean;
    };
    const ingMap = new Map<string, IngMeta>();
    const ingAllergens: string[][] = [];

    if (ingredientIds.length) {
      const { data: ings, error: iErr } = await supabase
        .from("ingredients")
        .select("id,name,cost_per_unit,allergens,supplier_id,rendement,source,recipe_id")
        .in("id", ingredientIds);

      if (iErr) return NextResponse.json({ message: iErr.message, details: iErr.details ?? null }, { status: 500 });

      for (const it of (ings ?? []) as IngRow[]) {
        ingMap.set(String(it.id), {
          name: it.name ?? null,
          cpu: n2(it.cost_per_unit),
          supplierId: it.supplier_id ?? null,
          rendement: it.rendement != null && it.rendement > 0 && it.rendement <= 1 ? it.rendement : 1,
          isSubRecipe: it.source === "recette_maison" || it.recipe_id != null,
        });
        ingAllergens.push(parseAllergens(it.allergens));
      }
    }

    // Resolve supplier names from supplier_ids
    const supplierIds = Array.from(
      new Set(
        Array.from(ingMap.values())
          .map((m) => m.supplierId)
          .filter((s): s is string => !!s)
      )
    );
    const supplierNameById: Record<string, string> = {};
    if (supplierIds.length) {
      const { data: sups } = await supabase
        .from("suppliers")
        .select("id,name")
        .in("id", supplierIds);
      for (const s of (sups ?? []) as { id: string; name: string }[]) {
        if (s.id && s.name) supplierNameById[s.id] = s.name;
      }
    }

    // Resolve establishment name
    let establishmentLabel: string | null = null;
    {
      const { data: etabRow } = await supabaseAdmin
        .from("etablissements")
        .select("nom")
        .eq("id", etabId)
        .maybeSingle();
      if (etabRow?.nom) establishmentLabel = etabRow.nom as string;
    }

    const rows = lineRows.map((r) => {
      const iid = String(r.ingredient_id || "");
      const ing = ingMap.get(iid);
      const qty = r.qty == null ? null : n2(r.qty);
      const unit = (r.unit ?? "g").toString();
      const cpu = ing?.cpu ?? 0;
      const cost = qty == null ? 0 : qty * cpu;
      const supplierName = ing?.supplierId ? (supplierNameById[ing.supplierId] ?? null) : null;
      return {
        name: ing?.name ?? "\u2014",
        qty,
        unit,
        cost,
        supplier: supplierName,
        rendement: ing?.rendement ?? 1,
        isSubRecipe: ing?.isSubRecipe ?? false,
      };
    });

    const yieldG = n2(rr.yield_grams);
    const portionsCount = rr.portions_count != null ? n2(rr.portions_count) : null;
    const totalCost = round2(rows.reduce((acc, r) => acc + n2(r.cost), 0));
    const costPerKg = yieldG > 0 ? round2(totalCost / (yieldG / 1000)) : null;
    const costPerPortion = portionsCount != null && portionsCount > 0 ? round2(totalCost / portionsCount) : null;

    // Generate a synthetic ref: FT-CUI-<short id>
    const CATEGORY_REF_PREFIXES: Record<string, string> = {
      plat_cuisine: "CUI",
      preparation: "PREP",
      entree: "ENT",
      accompagnement: "ACC",
      sauce: "SAU",
      dessert: "DES",
      cocktail: "COC",
      autre: "AUT",
    };
    const refPrefix = CATEGORY_REF_PREFIXES[rr.category ?? ""] ?? "CUI";
    const shortId = kitchenId.slice(0, 6).toUpperCase();
    const ref = `FT-${refPrefix}-${shortId}`;

    const exportedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    const logoBase64 = readLogoBase64();
    const photoUrl = rr.photo_url ? await photoToBase64(supabase, rr.photo_url) : null;

    const data: KitchenPdfData = {
      recipeName: (rr.name ?? "Recette").toString(),
      category: rr.category ?? null,
      costPerKg,
      costPerPortion,
      totalCost,
      portionsCount: portionsCount ?? null,
      yieldGrams: yieldG > 0 ? yieldG : null,
      sellPrice: rr.sell_price != null ? n2(rr.sell_price) : null,
      ref,
      establishment: establishmentLabel,
      lines: rows.map((r) => ({
        name: r.name ?? null,
        qty: r.qty == null ? null : round2(r.qty),
        unit: r.unit ?? null,
        supplier: r.supplier,
        rendement: r.rendement,
        isSubRecipe: r.isSubRecipe,
      })),
      notes: rr.notes ?? null,
      procedure: rr.procedure ?? null,
      exportedAt,
      logoBase64,
      photoUrl,
      accentColor: POLE_COLORS.cuisine,
      allergens: mergeAllergens(ingAllergens),
    };

    const documentElement = KitchenPdfDocument({ data }) as unknown as React.ReactElement<DocumentProps>;
    const pdfBuffer = await renderToBuffer(documentElement);

    const base = slugify(rr.name ?? "recette");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const filename = `cuisine-${base}-${ts}.pdf`;

    const pdfBody = new Uint8Array(pdfBuffer);

    return new NextResponse(pdfBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
    return NextResponse.json({ message: "Export PDF cuisine impossible", details: msg }, { status: 500 });
  }
}

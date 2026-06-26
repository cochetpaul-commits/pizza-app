import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import {
  KitchenSallePdfDocument,
  type KitchenSallePdfData,
  type SalleLine,
  type SalleFaqEntry,
} from "@/lib/kitchenSallePdf";
import { photoToBase64 } from "@/lib/photoToBase64";
import fs from "fs";
import path from "path";
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
  photo_url: string | null;
  sell_price: number | null;
  vat_rate: number | null;
  metadata: Record<string, unknown> | null;
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
  allergens: unknown;
  source: string | null;
  recipe_id: string | null;
};

function metaString(meta: Record<string, unknown> | null, key: string): string | null {
  if (!meta) return null;
  const v = meta[key];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseFaq(raw: string | null): SalleFaqEntry[] {
  if (!raw) return [];
  // Format attendu : une question puis une réponse, séparées par "|" sur la même ligne,
  // OU chaque entrée séparée par une ligne vide.
  // Ex.
  //   C'est épicé ? | Non, c'est doux.
  //   Les fruits de mer sont frais ? | Oui, livraison Mael 2x/semaine.
  const entries: SalleFaqEntry[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("|");
    if (idx === -1) continue;
    const question = trimmed.slice(0, idx).trim();
    const reponse = trimmed.slice(idx + 1).trim();
    if (question && reponse) entries.push({ question, reponse });
  }
  return entries;
}

function parseRegimesCsv(csv: string | null) {
  const tokens = new Set(
    (csv ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return {
    vegetarien: tokens.has("vegetarien"),
    vegan: tokens.has("vegan"),
    sans_gluten: tokens.has("sans_gluten"),
    sans_lactose: tokens.has("sans_lactose"),
    halal: tokens.has("halal"),
  };
}

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

    // 1. Charger la recette
    const { data: recipe, error: rErr } = await supabase
      .from("kitchen_recipes")
      .select("id,name,category,photo_url,sell_price,vat_rate,metadata")
      .eq("id", kitchenId)
      .eq("etablissement_id", etabId)
      .maybeSingle();

    if (rErr) return NextResponse.json({ message: rErr.message, details: rErr.details ?? null }, { status: 500 });
    if (!recipe) return NextResponse.json({ message: "Recette introuvable" }, { status: 404 });

    const rr = recipe as KitchenRow;

    // 2. Charger les lignes directes
    const { data: ln, error: lErr } = await supabase
      .from("kitchen_recipe_lines")
      .select("ingredient_id,qty,unit,sort_order")
      .eq("recipe_id", kitchenId)
      .order("sort_order", { ascending: true });

    if (lErr) return NextResponse.json({ message: lErr.message, details: lErr.details ?? null }, { status: 500 });

    const lineRows = ((ln ?? []) as LineRow[]).slice();
    const directIngredientIds = Array.from(
      new Set(lineRows.map((r) => String(r.ingredient_id || "")).filter(Boolean))
    );

    // 3. Charger les ingrédients directs
    const directIngMap = new Map<string, IngRow>();
    if (directIngredientIds.length) {
      const { data: ings, error: iErr } = await supabase
        .from("ingredients")
        .select("id,name,allergens,source,recipe_id")
        .in("id", directIngredientIds);
      if (iErr) return NextResponse.json({ message: iErr.message, details: iErr.details ?? null }, { status: 500 });
      for (const it of (ings ?? []) as IngRow[]) {
        directIngMap.set(String(it.id), it);
      }
    }

    // 4. Identifier les sous-recettes et charger leurs lignes + ingrédients
    const subRecipeIds = Array.from(
      new Set(
        Array.from(directIngMap.values())
          .filter((ing) => ing.source === "recette_maison" && ing.recipe_id)
          .map((ing) => String(ing.recipe_id))
      )
    );

    const subRecipeLines = new Map<string, LineRow[]>();
    const subRecipeIngMap = new Map<string, IngRow>();

    if (subRecipeIds.length) {
      const { data: subLines, error: sErr } = await supabase
        .from("kitchen_recipe_lines")
        .select("recipe_id,ingredient_id,qty,unit,sort_order")
        .in("recipe_id", subRecipeIds)
        .order("sort_order", { ascending: true });

      if (sErr) return NextResponse.json({ message: sErr.message, details: sErr.details ?? null }, { status: 500 });

      const rows = (subLines ?? []) as Array<LineRow & { recipe_id: string }>;
      for (const row of rows) {
        const key = String(row.recipe_id);
        const arr = subRecipeLines.get(key) ?? [];
        arr.push(row);
        subRecipeLines.set(key, arr);
      }

      const subIngIds = Array.from(
        new Set(rows.map((r) => String(r.ingredient_id || "")).filter(Boolean))
      );
      if (subIngIds.length) {
        const { data: subIngs, error: siErr } = await supabase
          .from("ingredients")
          .select("id,name,allergens,source,recipe_id")
          .in("id", subIngIds);
        if (siErr) return NextResponse.json({ message: siErr.message, details: siErr.details ?? null }, { status: 500 });
        for (const it of (subIngs ?? []) as IngRow[]) {
          subRecipeIngMap.set(String(it.id), it);
        }
      }
    }

    // 5. Établissement
    let establishmentLabel: string | null = null;
    {
      const { data: etabRow } = await supabaseAdmin
        .from("etablissements")
        .select("nom")
        .eq("id", etabId)
        .maybeSingle();
      if (etabRow?.nom) establishmentLabel = etabRow.nom as string;
    }

    // 6. Construction des lignes de composition + agrégation allergènes
    const allergenLists: string[][] = [];

    const compositionLines: SalleLine[] = lineRows.map((l) => {
      const ing = directIngMap.get(String(l.ingredient_id));
      const name = ing?.name ?? "Ingredient";
      allergenLists.push(parseAllergens(ing?.allergens));

      const isSubRecipe = !!ing && ing.source === "recette_maison" && !!ing.recipe_id;
      if (!isSubRecipe) {
        return { name, subIngredients: null };
      }

      const subLines = subRecipeLines.get(String(ing.recipe_id)) ?? [];
      const subNames: string[] = [];
      for (const sl of subLines) {
        const subIng = subRecipeIngMap.get(String(sl.ingredient_id));
        if (subIng?.name) {
          subNames.push(subIng.name);
          allergenLists.push(parseAllergens(subIng.allergens));
        }
      }
      return {
        name,
        subIngredients: subNames.length > 0 ? subNames : null,
      };
    });

    // 7. Métadonnées salle
    const meta = rr.metadata ?? null;
    const description = metaString(meta, "description_salle");
    const accords = {
      vin: metaString(meta, "accords_vin"),
      biere: metaString(meta, "accords_biere"),
      soft: metaString(meta, "accords_soft"),
    };
    const regimes = parseRegimesCsv(metaString(meta, "regimes_csv"));
    const faq = parseFaq(metaString(meta, "faq"));

    // 8. Prix TTC
    const sellPriceHT = rr.sell_price != null ? Number(rr.sell_price) : null;
    const vatRate = rr.vat_rate != null ? Number(rr.vat_rate) : 0.1;
    const sellPriceTTC = sellPriceHT != null && sellPriceHT > 0
      ? Math.round(sellPriceHT * (1 + vatRate) * 100) / 100
      : null;

    // 9. Référence
    const shortId = kitchenId.slice(0, 6).toUpperCase();
    const ref = `FT-SALLE-${shortId}`;

    const exportedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    const logoBase64 = readLogoBase64();
    const photoUrl = rr.photo_url ? await photoToBase64(supabase, rr.photo_url) : null;

    const data: KitchenSallePdfData = {
      recipeName: (rr.name ?? "Plat").toString(),
      ref,
      category: rr.category ?? null,
      sellPriceTTC,
      photoUrl,
      description,
      lines: compositionLines,
      allergens: mergeAllergens(allergenLists),
      accords,
      regimes,
      faq,
      exportedAt,
      logoBase64,
      establishment: establishmentLabel,
    };

    const documentElement = KitchenSallePdfDocument({ data }) as unknown as React.ReactElement<DocumentProps>;
    const pdfBuffer = await renderToBuffer(documentElement);

    const base = slugify(rr.name ?? "plat");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const filename = `salle-${base}-${ts}.pdf`;

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
    return NextResponse.json({ message: "Export PDF salle impossible", details: msg }, { status: 500 });
  }
}

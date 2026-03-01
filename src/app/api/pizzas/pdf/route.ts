import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { PizzaPdfDocument, type PizzaPdfData } from "@/lib/pizzaPdf";
import { photoToBase64 } from "@/lib/photoToBase64";
import fs from "fs";
import path from "path";
import { POLE_COLORS } from "@/lib/poleColors";

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
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

type PizzaRow = {
  id: string;
  name: string | null;
  notes: string | null;
  dough_recipe_id: string | null;
  photo_url: string | null;
};

type RecipeRow = { id: string; name: string | null; type: string | null };

type PiRow = {
  ingredient_id: string;
  stage: "pre" | "post";
  qty: number | null;
  unit: string | null;
  sort_order: number | null;
};

type IngRow = { id: string; name: string | null };

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const SUPABASE_ANON_KEY = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { pizzaId } = (await req.json()) as { pizzaId?: string };
    if (!pizzaId) {
      return NextResponse.json({ message: "pizzaId manquant" }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });

    const { data: pizza, error: pErr } = await supabase
      .from("pizza_recipes")
      .select("id,name,notes,dough_recipe_id,photo_url")
      .eq("id", pizzaId)
      .maybeSingle();

    if (pErr) return NextResponse.json({ message: "Pizza fetch error", details: pErr.message }, { status: 500 });
    if (!pizza) return NextResponse.json({ message: "Pizza introuvable" }, { status: 404 });

    const pizzaRow = pizza as PizzaRow;

    let doughName: string | null = null;
    let doughType: string | null = null;

    if (pizzaRow.dough_recipe_id) {
      const { data: rec, error: rErr } = await supabase
        .from("recipes")
        .select("id,name,type")
        .eq("id", pizzaRow.dough_recipe_id)
        .maybeSingle();

      if (!rErr && rec) {
        const rr = rec as RecipeRow;
        doughName = rr.name ?? null;
        doughType = rr.type ?? null;
      }
    }

    const { data: pi, error: piErr } = await supabase
      .from("pizza_ingredients")
      .select("ingredient_id,stage,qty,unit,sort_order")
      .eq("pizza_id", pizzaId)
      .order("stage", { ascending: true })
      .order("sort_order", { ascending: true });

    if (piErr) return NextResponse.json({ message: "Pizza ingredients error", details: piErr.message }, { status: 500 });

    const piRows = ((pi ?? []) as PiRow[]).slice();

    const ingredientIds = Array.from(new Set(piRows.map((r) => r.ingredient_id)));
    const ingMap = new Map<string, string | null>();

    if (ingredientIds.length) {
      const { data: ings, error: iErr } = await supabase.from("ingredients").select("id,name").in("id", ingredientIds);
      if (!iErr && ings) {
        for (const it of ings as IngRow[]) ingMap.set(it.id, it.name ?? null);
      }
    }

    const pre = piRows
      .filter((r) => r.stage === "pre")
      .map((r) => ({
        name: ingMap.get(r.ingredient_id) ?? null,
        qty: r.qty ?? null,
        unit: r.unit ?? null,
      }));

    const post = piRows
      .filter((r) => r.stage === "post")
      .map((r) => ({
        name: ingMap.get(r.ingredient_id) ?? null,
        qty: r.qty ?? null,
        unit: r.unit ?? null,
      }));

    const exportedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    const logoBase64 = readLogoBase64();

    // Photo en base64 — via SDK Storage (supporte pizza-photos et recipe-images)
    const photoUrl = pizzaRow.photo_url ? await photoToBase64(supabase, pizzaRow.photo_url) : null;

    const data: PizzaPdfData = {
      pizzaName: (pizzaRow.name ?? "Pizza").toString(),
      notes: pizzaRow.notes ?? null,
      doughRecipeName: doughName,
      doughRecipeType: doughType,
      pre,
      post,
      exportedAt,
      photoUrl,
      logoBase64,
      accentColor: POLE_COLORS.pizza,
    };

    const documentElement = PizzaPdfDocument({ data }) as unknown as React.ReactElement<DocumentProps>;
    const pdfBuffer = await renderToBuffer(documentElement);

    const base = slugify(pizzaRow.name ?? "pizza");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const filename = `pizza-${base}-${ts}.pdf`;

    const pdfBody = new Uint8Array(pdfBuffer);

    return new NextResponse(pdfBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ message: "PDF error", details: msg }, { status: 500 });
  }
}

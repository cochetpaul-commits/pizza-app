import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { KitchenPdfDocument, type KitchenPdfData } from "@/lib/kitchenPdf";
import fs from "fs";
import path from "path";

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
    const logoPath = path.join(process.cwd(), "public", "logo.png");
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
};

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const SUPABASE_ANON_KEY = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
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
      .select("id,name,category,yield_grams,portions_count,notes,procedure")
      .eq("id", kitchenId)
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

    const ingMap = new Map<string, { name: string | null; cpu: number }>();

    if (ingredientIds.length) {
      const { data: ings, error: iErr } = await supabase
        .from("ingredients")
        .select("id,name,cost_per_unit")
        .in("id", ingredientIds);

      if (iErr) return NextResponse.json({ message: iErr.message, details: iErr.details ?? null }, { status: 500 });

      for (const it of (ings ?? []) as IngRow[]) {
        ingMap.set(String(it.id), { name: it.name ?? null, cpu: n2(it.cost_per_unit) });
      }
    }

    const rows = lineRows.map((r) => {
      const iid = String(r.ingredient_id || "");
      const ing = ingMap.get(iid);
      const qty = r.qty == null ? null : n2(r.qty);
      const unit = (r.unit ?? "g").toString();
      const cpu = ing?.cpu ?? 0;
      const cost = qty == null ? 0 : qty * cpu;
      return { name: ing?.name ?? "—", qty, unit, cost };
    });

    const yieldG = n2(rr.yield_grams);
    const portionsCount = rr.portions_count != null ? n2(rr.portions_count) : null;
    const totalCost = round2(rows.reduce((acc, r) => acc + n2(r.cost), 0));
    const costPerKg = yieldG > 0 ? round2(totalCost / (yieldG / 1000)) : null;
    const costPerPortion = portionsCount != null && portionsCount > 0 ? round2(totalCost / portionsCount) : null;

    const exportedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    const logoBase64 = readLogoBase64();

    const data: KitchenPdfData = {
      recipeName: (rr.name ?? "Recette").toString(),
      category: rr.category ?? null,
      costPerKg,
      costPerPortion,
      totalCost,
      portionsCount: portionsCount ?? null,
      yieldGrams: yieldG > 0 ? yieldG : null,
      lines: rows.map((r) => ({
        name: r.name ?? null,
        qty: r.qty == null ? null : round2(r.qty),
        unit: r.unit ?? null,
      })),
      notes: rr.notes ?? null,
      procedure: rr.procedure ?? null,
      exportedAt,
      logoBase64,
      photoUrl: null,
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

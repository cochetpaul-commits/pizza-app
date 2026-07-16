import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

const POPINA_API_KEY = process.env.POPINA_API_KEY!;
const CATALOG_URL = "https://api.popina.com/v1/catalog";

type PopinaCatalogItem = {
  id: string;
  name: string;
  category: string;
  priceList?: { priceTypeName: string; unitPrice: number; taxRate: number }[];
  subCategories?: { name: string; id: string }[];
};

/** POST — sync catalogue Popina → popina_products */
export async function POST() {
  if (!POPINA_API_KEY) {
    return NextResponse.json({ error: "POPINA_API_KEY manquante" }, { status: 500 });
  }

  // 1. Fetch catalogue from Popina API
  const res = await fetch(CATALOG_URL, {
    headers: { Authorization: `Bearer ${POPINA_API_KEY}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Popina API ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const catalog: PopinaCatalogItem[] = await res.json();

  // 2. Deduplicate and map
  const seen = new Set<string>();
  const products: Record<string, unknown>[] = [];

  for (const p of catalog) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);

    const normal = p.priceList?.find((pl) => pl.priceTypeName === "Normal");
    const other = p.priceList?.find((pl) => pl.priceTypeName !== "Normal");

    products.push({
      popina_id: p.id,
      name: p.name || "(sans nom)",
      category: p.category || "",
      sub_category: p.subCategories?.[0]?.name || "",
      price_ttc: normal ? normal.unitPrice / 100 : 0,
      tva_rate: normal ? normal.taxRate / 10000 : 0,
      other_tariffs: other
        ? `${other.priceTypeName} ${(other.unitPrice / 100).toFixed(2)} €`
        : null,
      active: true,
    });
  }

  // 3. Upsert (preserves existing links)
  const supabase = sb();
  let upserted = 0;

  for (let i = 0; i < products.length; i += 50) {
    const batch = products.slice(i, i + 50);
    const { error } = await supabase
      .from("popina_products")
      .upsert(batch, { onConflict: "popina_id" });
    if (error) {
      return NextResponse.json({ error: `Upsert batch ${i}: ${error.message}` }, { status: 500 });
    }
    upserted += batch.length;
  }

  // 4. Deactivate products no longer in catalog
  const { data: existing } = await supabase
    .from("popina_products")
    .select("id, popina_id");

  const newIds = new Set(products.map((p) => p.popina_id as string));
  const removed = (existing ?? []).filter((e) => !newIds.has(e.popina_id));

  if (removed.length > 0) {
    await supabase
      .from("popina_products")
      .update({ active: false })
      .in("id", removed.map((r) => r.id));
  }

  return NextResponse.json({
    ok: true,
    fetched: catalog.length,
    upserted,
    deactivated: removed.length,
  });
}

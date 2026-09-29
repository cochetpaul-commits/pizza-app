import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { planifierSync, type ArticleCatalogue, type FicheExistante } from "@/lib/popinaCatalogueSync";

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

/**
 * POST — sync catalogue Popina → popina_products.
 *
 * Les fiches sont reconnues par identifiant Popina, puis par nom quand
 * l'identifiant a changé (Popina les regénère parfois tous) : les liens
 * recette / produit et les doses sont conservés. Voir src/lib/popinaCatalogueSync.ts.
 */
export async function POST() {
  if (!POPINA_API_KEY) {
    return NextResponse.json({ error: "POPINA_API_KEY manquante" }, { status: 500 });
  }

  // 1. Catalogue Popina
  const res = await fetch(CATALOG_URL, {
    headers: { Authorization: `Bearer ${POPINA_API_KEY}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Popina API ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const catalog: PopinaCatalogItem[] = await res.json();
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return NextResponse.json({ error: "Catalogue Popina vide : rien n'a été modifié" }, { status: 502 });
  }

  // 2. Dédoublonnage et mise en forme
  const seen = new Set<string>();
  const articles: ArticleCatalogue[] = [];

  for (const p of catalog) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);

    const normal = p.priceList?.find((pl) => pl.priceTypeName === "Normal");
    const other = p.priceList?.find((pl) => pl.priceTypeName !== "Normal");

    articles.push({
      popina_id: p.id,
      name: p.name || "(sans nom)",
      category: p.category || "",
      sub_category: p.subCategories?.[0]?.name || "",
      price_ttc: normal ? normal.unitPrice / 100 : 0,
      tva_rate: normal ? normal.taxRate / 10000 : 0,
      other_tariffs: other
        ? `${other.priceTypeName} ${(other.unitPrice / 100).toFixed(2)} €`
        : null,
    });
  }

  // 3. Fiches existantes et plan
  const supabase = sb();
  const { data: existing, error: errExisting } = await supabase
    .from("popina_products")
    .select("id, popina_id, name, active, linked_type, kitchen_recipe_id, ingredient_id");
  if (errExisting) {
    return NextResponse.json({ error: `Lecture des fiches : ${errExisting.message}` }, { status: 500 });
  }

  const fiches: FicheExistante[] = (existing ?? []).map((f) => ({
    id: f.id,
    popina_id: f.popina_id,
    name: f.name,
    active: !!f.active,
    liee: !!(f.linked_type || f.kitchen_recipe_id || f.ingredient_id),
  }));

  const plan = planifierSync(articles, fiches);
  if (plan.refus) {
    return NextResponse.json({ error: plan.refus }, { status: 409 });
  }

  // 4. Application : désactivations d'abord (libère les identifiants), puis mises à jour, puis insertions
  const now = new Date().toISOString();

  if (plan.desactivations.length > 0) {
    for (let i = 0; i < plan.desactivations.length; i += 150) {
      const { error } = await supabase
        .from("popina_products")
        .update({ active: false, updated_at: now })
        .in("id", plan.desactivations.slice(i, i + 150));
      if (error) return NextResponse.json({ error: `Désactivation : ${error.message}` }, { status: 500 });
    }
  }

  // Une fiche rapprochée par le nom prend un identifiant que porte peut-être encore une fiche
  // désactivée : on libère ces identifiants avant (suffixe « :ancien »).
  const idsRepris = new Set(plan.misesAJour.map((m) => m.valeurs.popina_id));
  const conflits = fiches.filter((f) => idsRepris.has(f.popina_id) && !plan.misesAJour.some((m) => m.id === f.id));
  for (const c of conflits) {
    const { error } = await supabase
      .from("popina_products")
      .update({ popina_id: `${c.popina_id}:ancien:${c.id.slice(0, 8)}`, active: false, updated_at: now })
      .eq("id", c.id);
    if (error) return NextResponse.json({ error: `Libération d'identifiant : ${error.message}` }, { status: 500 });
  }

  const misesAJour = await Promise.all(
    plan.misesAJour.map((m) =>
      supabase.from("popina_products").update({ ...m.valeurs, updated_at: now }).eq("id", m.id),
    ),
  );
  const errMaj = misesAJour.find((r) => r.error)?.error;
  if (errMaj) return NextResponse.json({ error: `Mise à jour : ${errMaj.message}` }, { status: 500 });

  for (let i = 0; i < plan.insertions.length; i += 50) {
    const { error } = await supabase.from("popina_products").insert(plan.insertions.slice(i, i + 50));
    if (error) return NextResponse.json({ error: `Insertion : ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    fetched: catalog.length,
    upserted: plan.misesAJour.length + plan.insertions.length,
    updated: plan.misesAJour.length,
    inserted: plan.insertions.length,
    matchedByName: plan.rapprochesParNom,
    deactivated: plan.desactivations.length,
  });
}

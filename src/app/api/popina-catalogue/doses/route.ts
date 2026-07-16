import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

/** GET — liste tous les mappings dose avec noms */
export async function GET() {
  const supabase = sb();

  const { data, error } = await supabase
    .from("popina_dose_map")
    .select(`
      id,
      dose,
      dose_unit,
      popina_product_id,
      ingredient_id,
      popina_products ( id, name, category, price_ttc ),
      ingredients ( id, name, category, purchase_unit, purchase_unit_label )
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** POST — créer un mapping dose */
export async function POST(req: NextRequest) {
  const { popina_product_id, ingredient_id, dose, dose_unit } = await req.json();

  if (!popina_product_id || !ingredient_id || !dose || !dose_unit) {
    return NextResponse.json({ error: "Champs requis: popina_product_id, ingredient_id, dose, dose_unit" }, { status: 400 });
  }

  const supabase = sb();

  const { data, error } = await supabase
    .from("popina_dose_map")
    .upsert(
      { popina_product_id, ingredient_id, dose, dose_unit },
      { onConflict: "popina_product_id,ingredient_id" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** DELETE — supprimer un mapping dose */
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const supabase = sb();
  const { error } = await supabase.from("popina_dose_map").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

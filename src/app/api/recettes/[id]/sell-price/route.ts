import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TABLE_MAP: Record<string, string> = {
  cuisine: "kitchen_recipes",
  pizza: "pizza_recipes",
  cocktail: "cocktails",
  empatement: "recipes",
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { sell_price, recipe_type } = body as { sell_price: number; recipe_type: string };

  const table = TABLE_MAP[recipe_type];
  if (!table) return NextResponse.json({ error: "Type invalide" }, { status: 400 });

  const { error } = await supabaseAdmin.from(table).update({ sell_price }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

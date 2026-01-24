"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Ingredient = { id: string; name: string };

export default function NewPrepRecipePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [error, setError] = useState<any>(null);

  const [name, setName] = useState("Pesto (à nommer)");
  const [pivotIngredientId, setPivotIngredientId] = useState<string>("");
  const [pivotUnit, setPivotUnit] = useState<"g" | "ml" | "pc">("g");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setError({ message: "NOT_LOGGED" });
        setLoading(false);
        return;
      }

      const { data, error: e1 } = await supabase.from("ingredients").select("id,name").eq("is_active", true).order("name");
      if (e1) {
        setError(e1);
        setLoading(false);
        return;
      }

      const list = (data ?? []) as Ingredient[];
      setIngredients(list);
      setPivotIngredientId(list?.[0]?.id ?? "");
      setLoading(false);
    };

    run();
  }, []);

  const create = async () => {
    setError(null);

    const n = name.trim();
    if (!n) return;
    if (!pivotIngredientId) return;

    const { data, error: e } = await supabase
      .from("prep_recipes")
      .insert({
        name: n,
        pivot_ingredient_id: pivotIngredientId,
        pivot_unit: pivotUnit,
      })
      .select("id")
      .single();

    if (e) {
      setError(e);
      return;
    }

    router.replace(`/prep/${data.id}`);
    router.refresh();
  };

  if (loading) {
    return (
      <main className="container">
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1 className="h1">Nouvelle recette pivot</h1>

      {error ? <pre className="errorBox">{JSON.stringify(error, null, 2)}</pre> : null}

      <div className="card" style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <label className="muted">Nom</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />

        <label className="muted">Ingrédient pivot</label>
        <select className="input" value={pivotIngredientId} onChange={(e) => setPivotIngredientId(e.target.value)}>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>

        <label className="muted">Unité pivot</label>
        <select className="input" value={pivotUnit} onChange={(e) => setPivotUnit(e.target.value as any)}>
          <option value="g">g</option>
          <option value="ml">ml</option>
          <option value="pc">pc</option>
        </select>

        <button className="btn btnPrimary" onClick={create}>
          Créer
        </button>

        <button className="btn" onClick={() => router.replace("/prep")}>
          Retour liste
        </button>
      </div>

      <p className="muted" style={{ marginTop: 12 }}>
        Après création, on rentre les lignes “ingrédients” avec des ratios par 1 unité de pivot.
      </p>
    </main>
  );
}
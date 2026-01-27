"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Ingredient } from "@/lib/types";

type KitchenRecipeRowDB = {
  id: string;
  name: string | null;
  yield_grams: number | null;
  portions_count: number | null;
  notes: string | null;
  procedure: string | null;
  output_ingredient_id: string | null;
  is_draft?: boolean | null;
};

type LineDB = {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  qty: number | null;
  unit: string | null;
  sort_order: number | null;
};

type LineUI = LineDB & {
  ingredient_name?: string;
  ingredient_cost_per_unit?: number | null;
};

function n2(v: unknown) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function round0(v: number) {
  return Math.round(v);
}

function fmtMoney(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtKg(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " €/kg";
}

function getObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function getString(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function getNumber(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function KitchenRecipeForm(props: { recipeId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(props.recipeId);
  const recipeId = props.recipeId ?? null;

  const [status, setStatus] = useState<"loading" | "NOT_LOGGED" | "ERROR" | "OK">("loading");
  const [error, setError] = useState<unknown>(null);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lines, setLines] = useState<LineUI[]>([]);

  const [form, setForm] = useState<{
    name: string;
    yield_grams: string;
    portions_count: string;
    notes: string;
    procedure: string;
    output_ingredient_id: string | null;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  const [savingIndex, setSavingIndex] = useState(false);

  const [newIngredientId, setNewIngredientId] = useState<string>("");
  const [newQty, setNewQty] = useState<string>("");
  const [newUnit, setNewUnit] = useState<"g" | "ml" | "pc">("g");
  const [adding, setAdding] = useState(false);

  const theme = {
    bg: "#f3eadc",
    card: "#efe2d3",
    text: "#2f3a33",
    muted: "#6f6a61",
    border: "#d9c7b6",
    primary: "#c97a5a",
    primaryHover: "#b86a4c",
    primaryText: "#fff",
  };

  const yieldGramsNum = useMemo(() => {
    const n = Number(String(form?.yield_grams ?? "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [form?.yield_grams]);

  const portionsNum = useMemo(() => {
    const n = Number(String(form?.portions_count ?? "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [form?.portions_count]);

  const computed = useMemo(() => {
    const rows = (lines ?? [])
      .slice()
      .sort((a, b) => n2(a.sort_order) - n2(b.sort_order))
      .map((l) => {
        const qty = n2(l.qty);
        const cpu = l.ingredient_cost_per_unit ?? null;
        const cost = cpu != null ? cpu * qty : 0;
        return { ...l, qty, cpu, cost };
      });

    const missing = rows.some((r) => r.cpu == null);
    const totalCost = rows.reduce((acc, r) => acc + n2((r as any).cost), 0);
    const costPerKg = yieldGramsNum > 0 ? totalCost / (yieldGramsNum / 1000) : 0;
    const costPerPortion = portionsNum > 0 ? totalCost / portionsNum : 0;

    return { rows, missing, totalCost: round2(totalCost), costPerKg, costPerPortion };
  }, [lines, yieldGramsNum, portionsNum]);

  const card = {
    background: theme.card,
    border: `1px solid ${theme.border}`,
    borderRadius: 16,
    padding: 16,
  } as const;

  const input = {
    width: "100%",
    height: 44,
    borderRadius: 12,
    border: `1px solid ${theme.border}`,
    padding: "0 12px",
    fontSize: 16,
    background: "#fff",
    color: theme.text,
  } as const;

  const btn = {
    height: 44,
    padding: "0 14px",
    borderRadius: 12,
    border: `1px solid ${theme.border}`,
    background: "#fff",
    color: theme.text,
    fontWeight: 900 as const,
    cursor: "pointer",
  };

  const btnPrimary = {
    ...btn,
    background: theme.primary,
    border: `1px solid ${theme.primary}`,
    color: theme.primaryText,
  };

  const load = async () => {
    setStatus("loading");
    setError(null);

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      setStatus("ERROR");
      setError(authErr);
      return;
    }
    if (!auth.user) {
      setStatus("NOT_LOGGED");
      return;
    }

    const { data: ing, error: ingErr } = await supabase
      .from("ingredients")
      .select("id,name,category,allergens,is_active,cost_per_unit")
      .order("name", { ascending: true });

    if (ingErr) {
      setStatus("ERROR");
      setError(ingErr);
      return;
    }

    const ingList = (ing ?? []) as Ingredient[];
    setIngredients(ingList);

    if (!isEdit) {
      setForm({
        name: "",
        yield_grams: "1000",
        portions_count: "1",
        notes: "",
        procedure: "",
        output_ingredient_id: null,
      });
      setLines([]);
      setNewIngredientId(ingList[0]?.id ?? "");
      setStatus("OK");
      return;
    }

    if (!recipeId) {
      setStatus("ERROR");
      setError({ message: "recipeId manquant" });
      return;
    }

    const { data: r, error: rErr } = await supabase
      .from("kitchen_recipes")
      .select("id,name,yield_grams,portions_count,notes,procedure,output_ingredient_id,is_draft")
      .eq("id", recipeId)
      .maybeSingle();

    if (rErr) {
      setStatus("ERROR");
      setError(rErr);
      return;
    }
    if (!r) {
      setStatus("ERROR");
      setError({ message: "Fiche introuvable (0 rows)" });
      return;
    }

    const rr = r as KitchenRecipeRowDB;

    setForm({
      name: String(rr.name ?? ""),
      yield_grams: String(rr.yield_grams ?? 1000),
      portions_count: String(rr.portions_count ?? 1),
      notes: String(rr.notes ?? ""),
      procedure: String(rr.procedure ?? ""),
      output_ingredient_id: rr.output_ingredient_id ?? null,
    });

    const { data: ln, error: lErr } = await supabase
      .from("kitchen_recipe_lines")
      .select("id,recipe_id,ingredient_id,qty,unit,sort_order,ingredients(name,cost_per_unit)")
      .eq("recipe_id", recipeId)
      .order("sort_order", { ascending: true });

    if (lErr) {
      setStatus("ERROR");
      setError(lErr);
      return;
    }

    const mapped: LineUI[] = (ln ?? []).map((raw) => {
      const row = getObj(raw) ?? {};
      const ingObj = getObj(row["ingredients"]) ?? {};

      return {
        id: getString(row["id"]),
        recipe_id: getString(row["recipe_id"]),
        ingredient_id: getString(row["ingredient_id"]),
        qty: getNumber(row["qty"]),
        unit: getString(row["unit"], "g"),
        sort_order: getNumber(row["sort_order"], 0),
        ingredient_name: getString(ingObj["name"]),
        ingredient_cost_per_unit: typeof ingObj["cost_per_unit"] === "number" ? (ingObj["cost_per_unit"] as number) : null,
      };
    });

    setLines(mapped);

    const first = ingList[0]?.id ?? "";
    setNewIngredientId(first);

    setStatus("OK");
  };

  useEffect(() => {
    void load();
  }, [recipeId, isEdit]);

  const save = async () => {
    if (!form) return;
    if (saving) return;

    setSaveError(null);
    setSaveOk(false);

    const nm = form.name.trim();
    if (!nm) {
      setSaveError({ message: "Nom obligatoire" });
      return;
    }

    const yg = yieldGramsNum;
    const pc = portionsNum;

    if (yg <= 0) {
      setSaveError({ message: "Rendement (g) invalide" });
      return;
    }

    if (pc <= 0) {
      setSaveError({ message: "Nombre de portions invalide" });
      return;
    }

    setSaving(true);

    let id = recipeId;

    const payload = {
      name: nm,
      yield_grams: Math.round(yg),
      portions_count: Math.round(pc),
      notes: form.notes?.trim() || null,
      procedure: form.procedure?.trim() || null,
      output_ingredient_id: form.output_ingredient_id ?? null,
      updated_at: new Date().toISOString(),
      is_draft: false,
    };

    if (!id) {
      const { data, error: insErr } = await supabase.from("kitchen_recipes").insert(payload).select("id").single();
      if (insErr) {
        setSaving(false);
        setSaveError(insErr);
        return;
      }
      id = (data as { id: string }).id;
    } else {
      const { error: updErr } = await supabase.from("kitchen_recipes").update(payload).eq("id", id);
      if (updErr) {
        setSaving(false);
        setSaveError(updErr);
        return;
      }
    }

    setSaving(false);
    setSaveOk(true);
    setTimeout(() => setSaveOk(false), 900);

    if (!recipeId) {
      router.replace(`/kitchen/${id}`);
    }
  };

  const addLine = async () => {
    if (!form) return;
    if (!newIngredientId) return;

    const qty = Number(String(newQty).replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) return;

    setAdding(true);

    try {
      const id = recipeId;
      if (!id) {
        setSaveError({ message: "Impossible d’ajouter une ligne avant création. Passe par /kitchen/new." });
        return;
      }

      const nextSort = (lines?.length ? Math.max(...lines.map((l) => n2(l.sort_order))) : -1) + 1;

      const { data, error: e } = await supabase
        .from("kitchen_recipe_lines")
        .insert({
          recipe_id: id,
          ingredient_id: newIngredientId,
          qty,
          unit: newUnit,
          sort_order: nextSort,
        })
        .select("id,recipe_id,ingredient_id,qty,unit,sort_order,ingredients(name,cost_per_unit)")
        .single();

      if (e) throw e;

      const row = getObj(data) ?? {};
      const ingObj = getObj(row["ingredients"]) ?? {};

      const added: LineUI = {
        id: getString(row["id"]),
        recipe_id: getString(row["recipe_id"]),
        ingredient_id: getString(row["ingredient_id"]),
        qty: getNumber(row["qty"]),
        unit: getString(row["unit"], "g"),
        sort_order: getNumber(row["sort_order"], nextSort),
        ingredient_name: getString(ingObj["name"]),
        ingredient_cost_per_unit: typeof ingObj["cost_per_unit"] === "number" ? (ingObj["cost_per_unit"] as number) : null,
      };

      setLines((p) => [...(p ?? []), added]);
      setNewQty("");
    } catch (err) {
      setSaveError({ message: "Erreur ajout ligne", details: err });
    } finally {
      setAdding(false);
    }
  };

  const delLine = async (lineId: string) => {
    const ok = window.confirm("Supprimer cette ligne ?");
    if (!ok) return;

    const { error: e } = await supabase.from("kitchen_recipe_lines").delete().eq("id", lineId);
    if (e) {
      setSaveError(e);
      return;
    }
    setLines((p) => (p ?? []).filter((x) => x.id !== lineId));
  };

  const saveAsIngredient = async () => {
    if (!form) return;
    if (!recipeId) {
      setSaveError({ message: "Sauvegarde d’abord la fiche avant enregistrement dans l’index." });
      return;
    }
    if (savingIndex) return;

    setSavingIndex(true);
    setSaveError(null);

    try {
      if (computed.missing) throw new Error("Un ou plusieurs ingrédients n’ont pas de prix (cost_per_unit manquant).");
      if (yieldGramsNum <= 0) throw new Error("Rendement (g) invalide.");
      if (computed.totalCost <= 0) throw new Error("Coût total invalide.");

      const totalCost = round2(computed.totalCost);
      const totalWeight = round0(yieldGramsNum);

      const name = (form.name.trim() || "Recette cuisine").slice(0, 120);

      const ingredientPayload = {
        name,
        category: "autre",
        is_active: true,
        default_unit: "g",
        purchase_price: totalCost,
        purchase_unit: totalWeight,
        purchase_unit_label: "g",
        purchase_unit_name: "kg",
        updated_at: new Date().toISOString(),
      };

      if (form.output_ingredient_id) {
        const { error: eUpd } = await supabase.from("ingredients").update(ingredientPayload).eq("id", form.output_ingredient_id);
        if (eUpd) throw eUpd;
        return;
      }

      const { data: ins, error: eIns } = await supabase.from("ingredients").insert(ingredientPayload).select("id").single();
      if (eIns) throw eIns;

      const newId = getString(getObj(ins)?.["id"]);
      if (!newId) throw new Error("ID ingrédient manquant après création");

      const { error: eBind } = await supabase
        .from("kitchen_recipes")
        .update({ output_ingredient_id: newId, updated_at: new Date().toISOString() })
        .eq("id", recipeId);

      if (eBind) throw eBind;

      setForm((p) => (p ? { ...p, output_ingredient_id: newId } : p));
    } catch (e: any) {
      setSaveError({ message: "Index impossible", details: String(e?.message ?? e) });
    } finally {
      setSavingIndex(false);
    }
  };

  if (status === "loading") {
    return (
      <main style={{ background: theme.bg, minHeight: "100vh", padding: 16, color: theme.text }}>
        <div style={{ maxWidth: 980, margin: "0 auto", color: theme.muted }}>Chargement…</div>
      </main>
    );
  }

  if (status === "NOT_LOGGED") {
    return (
      <main style={{ background: theme.bg, minHeight: "100vh", padding: 16, color: theme.text }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ color: theme.muted }}>NOT_LOGGED</div>
          <Link
            href="/login"
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 12,
              background: theme.primary,
              color: theme.primaryText,
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Aller sur /login
          </Link>
        </div>
      </main>
    );
  }

  if (status === "ERROR" || !form) {
    return (
      <main style={{ background: theme.bg, minHeight: "100vh", padding: 16, color: theme.text }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <Link href="/kitchen" style={{ color: theme.muted, textDecoration: "none", fontWeight: 900 }}>
            ← Retour
          </Link>
          <h1 style={{ marginTop: 14, marginBottom: 10 }}>Erreur</h1>
          <pre style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 12, padding: 12, overflow: "auto" }}>
            {JSON.stringify(error, null, 2)}
          </pre>
        </div>
      </main>
    );
  }

  return (
    <main style={{ background: theme.bg, minHeight: "100vh", padding: 16, color: theme.text }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <Link href="/kitchen" style={{ color: theme.muted, textDecoration: "none", fontWeight: 900 }}>
            Accueil
          </Link>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" onClick={saveAsIngredient} disabled={savingIndex || saving || !isEdit} style={btn}>
              {savingIndex ? "Index…" : form.output_ingredient_id ? "MAJ index" : "Index"}
            </button>

            <button type="button" onClick={save} disabled={saving} style={btnPrimary}>
              {saving ? "Sauvegarde…" : saveOk ? "OK" : "Sauvegarder"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: -0.4 }}>Fiche cuisine</h1>
          <div style={{ color: theme.muted, marginTop: 4 }}>Ingrédients + rendement + portions + notes + procédé</div>
        </div>

        {saveError ? (
          <pre style={{ marginTop: 12, background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 12, padding: 12, overflow: "auto" }}>
            {JSON.stringify(saveError, null, 2)}
          </pre>
        ) : null}

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ fontWeight: 950, fontSize: 22, textAlign: "center" }}>{form.name.trim() ? form.name.trim() : "Recette"}</div>
          <div style={{ color: theme.muted, textAlign: "center", marginTop: 6, fontSize: 13 }}>
            Rendement: {yieldGramsNum || 0} g · Portions: {portionsNum || 0}
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
          <div style={card}>
            <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Nom</div>
            <input style={{ ...input, fontSize: 20, fontWeight: 950 }} value={form.name} onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Rendement (g)</div>
                <input
                  style={{ ...input, textAlign: "center", fontWeight: 950 }}
                  inputMode="decimal"
                  value={form.yield_grams}
                  onChange={(e) => setForm((p) => (p ? { ...p, yield_grams: e.target.value } : p))}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Portions</div>
                <input
                  style={{ ...input, textAlign: "center", fontWeight: 950 }}
                  inputMode="numeric"
                  value={form.portions_count}
                  onChange={(e) => setForm((p) => (p ? { ...p, portions_count: e.target.value } : p))}
                />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900 }}>Coût total</div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 2 }}>{fmtMoney(computed.totalCost)}</div>
                {computed.missing ? <div style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>Prix manquant sur un ingrédient</div> : null}
              </div>

              <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900 }}>Coût / kg</div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 2 }}>{fmtKg(yieldGramsNum > 0 ? computed.costPerKg : 0)}</div>
                <div style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>Coût / portion: {fmtMoney(portionsNum > 0 ? computed.costPerPortion : 0)}</div>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Ajouter une ligne</div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Ingrédient</div>
                <select style={input} value={newIngredientId} onChange={(e) => setNewIngredientId(e.target.value)}>
                  {ingredients.map((i) => (
                    <option key={(i as any).id} value={(i as any).id}>
                      {(i as any).name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Qté</div>
                <input style={{ ...input, textAlign: "center", fontWeight: 950 }} inputMode="decimal" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
              </div>

              <div>
                <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Unité</div>
                <select style={input} value={newUnit} onChange={(e) => setNewUnit(e.target.value as any)}>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="pc">pc</option>
                </select>
              </div>

              <button type="button" onClick={addLine} disabled={adding || saving} style={btnPrimary}>
                {adding ? "Ajout…" : "Ajouter"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Composition</div>
            <div style={{ color: theme.muted, fontSize: 12, fontWeight: 900 }}>{computed.rows.length} ligne(s)</div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {computed.rows.map((r: any) => (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "12px 10px",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 950 }}>{r.ingredient_name ?? "—"}</div>

                <div style={{ textAlign: "right", fontWeight: 950 }}>
                  {round0(r.qty)} <span style={{ color: theme.muted, fontWeight: 900 }}>{r.unit}</span>
                </div>

                <div style={{ textAlign: "right", fontWeight: 950 }}>{fmtMoney(n2(r.cost))}</div>

                <button type="button" onClick={() => delLine(r.id)} style={btn}>
                  Supprimer
                </button>
              </div>
            ))}

            {computed.rows.length === 0 ? <div style={{ color: theme.muted, fontWeight: 900 }}>Aucune ligne</div> : null}
          </div>
        </div>

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ fontSize: 16, fontWeight: 950 }}>Notes</div>
          <textarea
            style={{ ...input, height: "auto", minHeight: 110, padding: 12, lineHeight: 1.4, marginTop: 10, resize: "vertical", fontWeight: 700 }}
            value={form.notes}
            onChange={(e) => setForm((p) => (p ? { ...p, notes: e.target.value } : p))}
          />
        </div>

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ fontSize: 16, fontWeight: 950 }}>Procédé</div>
          <textarea
            style={{ ...input, height: "auto", minHeight: 160, padding: 12, lineHeight: 1.4, marginTop: 10, resize: "vertical", fontWeight: 700 }}
            value={form.procedure}
            onChange={(e) => setForm((p) => (p ? { ...p, procedure: e.target.value } : p))}
          />
        </div>

        <div style={{ height: 28 }} />
      </div>
    </main>
  );
}
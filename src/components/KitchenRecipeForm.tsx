"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Ingredient } from "@/lib/types";

type KitchenRecipeRowDB = {
  id: string;
  user_id: string;
  name: string | null;
  yield_grams: number | null;
  portions_count: number | null;
  notes: string | null;
  procedure: string | null;
  output_ingredient_id: string | null;
  is_active: boolean | null;
  is_draft: boolean | null;
};

type LineUI = {
  id: string; // DB id ou "tmp-..."
  recipe_id: string; // vide si pas encore créé
  ingredient_id: string;
  qty: number;
  unit: "g" | "ml" | "pc";
  sort_order: number;
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

function tmpId() {
  return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function KitchenRecipeForm(props: { recipeId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(props.recipeId);
  const recipeId = props.recipeId ?? null;

  const [status, setStatus] = useState<"loading" | "NOT_LOGGED" | "ERROR" | "OK">("loading");
  const [error, setError] = useState<unknown>(null);

  const [uid, setUid] = useState<string | null>(null);

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
    setSaveError(null);

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

    setUid(auth.user.id);

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
    setNewIngredientId(ingList[0]?.id ?? "");

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
      .select("id,user_id,name,yield_grams,portions_count,notes,procedure,output_ingredient_id,is_active,is_draft")
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
      .select("id,recipe_id,ingredient_id,qty,unit,sort_order")
      .eq("recipe_id", recipeId)
      .order("sort_order", { ascending: true });

    if (lErr) {
      setStatus("ERROR");
      setError(lErr);
      return;
    }

    const mapped: LineUI[] = (ln ?? []).map((raw: any) => {
      const ingRow = ingList.find((x: any) => x.id === raw.ingredient_id);
      return {
        id: String(raw.id),
        recipe_id: String(raw.recipe_id),
        ingredient_id: String(raw.ingredient_id),
        qty: n2(raw.qty),
        unit: (String(raw.unit || "g") as any) === "ml" ? "ml" : (String(raw.unit || "g") as any) === "pc" ? "pc" : "g",
        sort_order: n2(raw.sort_order),
        ingredient_name: String((ingRow as any)?.name ?? ""),
        ingredient_cost_per_unit: typeof (ingRow as any)?.cost_per_unit === "number" ? ((ingRow as any).cost_per_unit as number) : null,
      };
    });

    setLines(mapped);
    setStatus("OK");
  };

  useEffect(() => {
    void load();
  }, [recipeId, isEdit]);

  const addLineLocal = () => {
    if (!form) return;
    if (!newIngredientId) return;

    const qty = Number(String(newQty).replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) return;

    const ingRow = ingredients.find((x: any) => x.id === newIngredientId);
    const nextSort = (lines?.length ? Math.max(...lines.map((l) => n2(l.sort_order))) : -1) + 1;

    const row: LineUI = {
      id: tmpId(),
      recipe_id: recipeId ?? "",
      ingredient_id: newIngredientId,
      qty,
      unit: newUnit,
      sort_order: nextSort,
      ingredient_name: String((ingRow as any)?.name ?? ""),
      ingredient_cost_per_unit: typeof (ingRow as any)?.cost_per_unit === "number" ? ((ingRow as any).cost_per_unit as number) : null,
    };

    setLines((p) => [...(p ?? []), row]);
    setNewQty("");
  };

  const delLine = async (lineId: string) => {
    const ok = window.confirm("Supprimer cette ligne ?");
    if (!ok) return;
    setLines((p) => (p ?? []).filter((x) => x.id !== lineId));
  };

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

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      setSaveError(authErr);
      return;
    }
    if (!auth.user) {
      setSaveError({ message: "NOT_LOGGED" });
      return;
    }

    setSaving(true);

    let id = recipeId;

    const recipePayload: any = {
      name: nm,
      yield_grams: round0(yg),
      portions_count: round0(pc),
      notes: form.notes?.trim() || null,
      procedure: form.procedure?.trim() || null,
      output_ingredient_id: form.output_ingredient_id ?? null,
      updated_at: new Date().toISOString(),
      is_active: true,
      is_draft: false,
    };

    if (!id) {
      recipePayload.user_id = auth.user.id;
      const { data, error: insErr } = await supabase.from("kitchen_recipes").insert(recipePayload).select("id").single();
      if (insErr) {
        setSaving(false);
        setSaveError(insErr);
        return;
      }
      id = (data as any)?.id as string;
      if (!id) {
        setSaving(false);
        setSaveError({ message: "ID manquant après création" });
        return;
      }
    } else {
      const { error: updErr } = await supabase.from("kitchen_recipes").update(recipePayload).eq("id", id);
      if (updErr) {
        setSaving(false);
        setSaveError(updErr);
        return;
      }
    }

    const { error: delErr } = await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", id);
    if (delErr) {
      setSaving(false);
      setSaveError(delErr);
      return;
    }

    const cleaned = (lines ?? [])
      .slice()
      .filter((l) => l.ingredient_id && n2(l.qty) > 0)
      .sort((a, b) => n2(a.sort_order) - n2(b.sort_order))
      .map((l, idx) => ({
        recipe_id: id,
        ingredient_id: l.ingredient_id,
        qty: n2(l.qty),
        unit: l.unit,
        sort_order: idx,
      }));

    if (cleaned.length) {
      const { error: insLinesErr } = await supabase.from("kitchen_recipe_lines").insert(cleaned);
      if (insLinesErr) {
        setSaving(false);
        setSaveError(insLinesErr);
        return;
      }
    }

    setSaving(false);
    setSaveOk(true);
    setTimeout(() => setSaveOk(false), 900);

    if (!recipeId) {
  router.replace(`/kitchen/${id}`);
  router.refresh();
  setTimeout(() => {
    if (window.location.pathname.includes("/kitchen/new")) window.location.assign(`/kitchen/${id}`);
  }, 50);
}
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

      const ingredientPayload: any = {
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

      const newId = String((ins as any)?.id ?? "");
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
            <input
              style={{ ...input, fontSize: 20, fontWeight: 950 }}
              value={form.name}
              onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))}
            />

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
                  {ingredients.map((i: any) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
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

              <button
                type="button"
                onClick={() => {
                  if (adding || saving) return;
                  setAdding(true);
                  try {
                    addLineLocal();
                  } finally {
                    setAdding(false);
                  }
                }}
                disabled={adding || saving}
                style={btnPrimary}
              >
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
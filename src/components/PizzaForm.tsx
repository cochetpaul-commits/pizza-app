"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PizzaIngredientList from "@/components/PizzaIngredientList";
import type { Ingredient, PizzaIngredientRow, UnitType } from "@/lib/types";

type DoughRecipeRow = {
  id: string;
  name: string | null;
  type: string | null;
  total_cost: number | null;
  yield_grams: number | null;
  ball_weight: number | null;
};

type PizzaRowDB = {
  id: string;
  name: string | null;
  dough_recipe_id: string | null;
  notes: string | null;
  photo_url: string | null;
  is_draft?: boolean | null;
};

type PizzaIngredientDBRow = {
  id: string;
  pizza_id: string;
  ingredient_id: string;
  stage: "pre" | "post";
  qty: number | null;
  unit: string | null;
  sort_order: number | null;
};

function n2(v: unknown) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function normalizeUnit(u: unknown): UnitType {
  const s = String(u ?? "").trim();
  const allowed: UnitType[] = ["g", "ml", "pcs", "pinch", "dash"];
  return allowed.includes(s as UnitType) ? (s as UnitType) : "g";
}

function normalizeRows(all: PizzaIngredientRow[]) {
  const cleaned: PizzaIngredientRow[] = all
    .filter((r) => r.ingredient_id)
    .map((r) => {
      const qty: number | "" =
        r.qty === ""
          ? ""
          : typeof r.qty === "number"
          ? r.qty
          : (() => {
              const n = Number(String(r.qty).replace(",", "."));
              return Number.isFinite(n) ? n : "";
            })();

      return {
        ...r,
        qty,
        unit: normalizeUnit(r.unit),
        sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 0,
      } as PizzaIngredientRow;
    });

  const out: PizzaIngredientRow[] = [];
  (["pre", "post"] as const).forEach((stage) => {
    const stageRows = cleaned
      .filter((r) => r.stage === stage)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    stageRows.forEach((r, i) => out.push({ ...r, sort_order: i }));
  });

  return out;
}

function validateRows(rows: PizzaIngredientRow[]) {
  const seen = new Set<string>();

  for (const r of rows) {
    if (!r.ingredient_id) return { ok: false as const, message: "Ingrédient manquant dans une ligne." };
    const qty = typeof r.qty === "number" ? r.qty : NaN;
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false as const, message: "Quantité invalide (doit être > 0)." };
    if (!r.unit) return { ok: false as const, message: "Unité manquante." };

    const k = `${r.stage}:${r.ingredient_id}`;
    if (seen.has(k)) return { ok: false as const, message: "Doublon ingrédient dans la même section (avant/après four)." };
    seen.add(k);
  }

  return { ok: true as const };
}

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default function PizzaForm(props: { pizzaId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(props.pizzaId);
  const pizzaId = props.pizzaId ?? null;

  const [status, setStatus] = useState<"loading" | "NOT_LOGGED" | "ERROR" | "OK">("loading");
  const [error, setError] = useState<unknown>(null);

  const [recipes, setRecipes] = useState<DoughRecipeRow[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [rows, setRows] = useState<PizzaIngredientRow[]>([]);

  const [form, setForm] = useState<{
    name: string;
    dough_recipe_id: string;
    notes: string;
    photo_url: string;
  } | null>(null);

  const [ballWeightG, setBallWeightG] = useState<string>("264");

  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

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

  const rowsCount = useMemo(() => {
    const pre = rows.filter((r) => r.stage === "pre").length;
    const post = rows.filter((r) => r.stage === "post").length;
    return { pre, post, total: pre + post };
  }, [rows]);

  const dough = useMemo(() => {
    const id = form?.dough_recipe_id || "";
    return recipes.find((r) => r.id === id) ?? null;
  }, [recipes, form?.dough_recipe_id]);

  const ballWeightNum = useMemo(() => {
    const n = Number(String(ballWeightG).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [ballWeightG]);

  const costs = useMemo(() => {
    const toppings = rows.reduce((acc, r) => {
      if (!r.ingredient_id) return acc;
      const ing = ingredients.find((x) => x.id === r.ingredient_id);
      const cpu = n2((ing as any)?.cost_per_unit);
      const qty = typeof r.qty === "number" ? r.qty : n2(r.qty);
      return acc + qty * cpu;
    }, 0);

    const totalCost = n2(dough?.total_cost);
    const yieldGrams = n2(dough?.yield_grams);
    const doughCpuG = yieldGrams > 0 ? totalCost / yieldGrams : 0;
    const doughCost = ballWeightNum > 0 ? doughCpuG * ballWeightNum : 0;

    return {
      toppings: round2(toppings),
      dough: round2(doughCost),
      total: round2(toppings + doughCost),
      doughCpuG: doughCpuG,
    };
  }, [rows, ingredients, dough, ballWeightNum]);

  useEffect(() => {
    const run = async () => {
      setStatus("loading");
      setError(null);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setStatus("NOT_LOGGED");
        return;
      }

      const { data: recs, error: recErr } = await supabase
        .from("recipes")
        .select("id,name,type,total_cost,yield_grams,ball_weight")
        .order("created_at", { ascending: false });

      if (recErr) {
        setStatus("ERROR");
        setError(recErr);
        return;
      }
      setRecipes((recs ?? []) as DoughRecipeRow[]);

      const { data: ing, error: ingErr } = await supabase
        .from("ingredients")
        .select("id,name,category,allergens,is_active,cost_per_unit")
        .order("name", { ascending: true });

      if (ingErr) {
        setStatus("ERROR");
        setError(ingErr);
        return;
      }
      setIngredients((ing ?? []) as Ingredient[]);

      if (!isEdit) {
        setForm({ name: "", dough_recipe_id: "", notes: "", photo_url: "" });
        setRows([]);
        setPhotoPreview(null);
        setBallWeightG("264");
        setStatus("OK");
        return;
      }

      if (!pizzaId) {
        setStatus("ERROR");
        setError({ message: "pizzaId manquant" });
        return;
      }

      const { data: pizza, error: pizzaErr } = await supabase
        .from("pizza_recipes")
        .select("id,name,dough_recipe_id,notes,photo_url,is_draft")
        .eq("id", pizzaId)
        .maybeSingle();

      if (pizzaErr) {
        setStatus("ERROR");
        setError(pizzaErr);
        return;
      }
      if (!pizza) {
        setStatus("ERROR");
        setError({ message: "Fiche introuvable (0 rows)" });
        return;
      }

      const { data: pi, error: piErr } = await supabase
        .from("pizza_ingredients")
        .select("id,pizza_id,ingredient_id,stage,qty,unit,sort_order")
        .eq("pizza_id", pizzaId)
        .order("stage", { ascending: true })
        .order("sort_order", { ascending: true });

      if (piErr) {
        setStatus("ERROR");
        setError(piErr);
        return;
      }

      const p = pizza as PizzaRowDB;

      setForm({
        name: String(p.name ?? ""),
        dough_recipe_id: String(p.dough_recipe_id ?? ""),
        notes: String(p.notes ?? ""),
        photo_url: String(p.photo_url ?? ""),
      });

      setPhotoPreview(p.photo_url ?? null);

      const dbRows = (pi ?? []) as PizzaIngredientDBRow[];

      const uiRows: PizzaIngredientRow[] = dbRows.map((r) => ({
        id: r.id,
        ingredient_id: r.ingredient_id,
        qty: typeof r.qty === "number" && Number.isFinite(r.qty) ? r.qty : "",
        unit: normalizeUnit(r.unit),
        stage: r.stage === "post" ? "post" : "pre",
        sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 0,
      }));

      setRows(uiRows);
      setStatus("OK");
    };

    run();
  }, [pizzaId, isEdit]);

  useEffect(() => {
    if (!form?.dough_recipe_id) return;
    const r = recipes.find((x) => x.id === form.dough_recipe_id);
    if (!r) return;
    const bw = n2(r.ball_weight);
    if (bw > 0) setBallWeightG(String(Math.round(bw)));
  }, [form?.dough_recipe_id, recipes]);

  async function uploadPhoto(file: File) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("NOT_LOGGED");

    const uid = auth.user.id;
    const baseName = slugify(form?.name?.trim() || "pizza");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    const folder = pizzaId ? pizzaId : `tmp-${ts}`;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${uid}/${folder}/${ts}-${baseName}.${ext}`;

    setPhotoUploading(true);

    const { error: upErr } = await supabase.storage
      .from("pizza-photos")
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });

    if (upErr) {
      setPhotoUploading(false);
      throw new Error(upErr.message);
    }

    const { data: pub } = supabase.storage.from("pizza-photos").getPublicUrl(path);
    setPhotoUploading(false);

    return pub.publicUrl;
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const f = e.target.files?.[0];
      if (!f) return;

      const local = URL.createObjectURL(f);
      setPhotoPreview(local);

      const url = await uploadPhoto(f);

      URL.revokeObjectURL(local);
      setPhotoPreview(url);

      setForm((p) => (p ? { ...p, photo_url: url } : p));
    } catch {
      setSaveError({ message: "Upload photo impossible" });
      setPhotoPreview(form?.photo_url || null);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearPhoto() {
    setPhotoPreview(null);
    setForm((p) => (p ? { ...p, photo_url: "" } : p));
  }

  const exportPdf = async () => {
    try {
      if (!pizzaId) {
        setSaveError({ message: "Sauvegarde d’abord la pizza avant export PDF." });
        return;
      }

      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Token manquant (session)");

      const res = await fetch("/api/pizzas/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pizzaId }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.message ? `${j.message}${j.details ? ` — ${j.details}` : ""}` : `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "pizza.pdf";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
    } catch {
      setSaveError({ message: "Export PDF impossible" });
    }
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

    setSaving(true);

    const cleaned = normalizeRows(rows);
    const v = validateRows(cleaned);
    if (!v.ok) {
      setSaving(false);
      setSaveError({ message: v.message });
      return;
    }

    let id = pizzaId;

    const payload = {
  name: nm,
  dough_recipe_id: form.dough_recipe_id ? form.dough_recipe_id : null,
  notes: form.notes?.trim() || null,
  photo_url: form.photo_url?.trim() || null,
  is_draft: false,
  updated_at: new Date().toISOString(),
};

    if (!id) {
      const { data, error: insErr } = await supabase.from("pizza_recipes").insert(payload).select("id").single();
      if (insErr) {
        setSaving(false);
        setSaveError(insErr);
        return;
      }
      id = (data as { id: string }).id;
    } else {
      const { error: updErr } = await supabase.from("pizza_recipes").update(payload).eq("id", id);
      if (updErr) {
        setSaving(false);
        setSaveError(updErr);
        return;
      }
    }

    const { error: delErr } = await supabase.from("pizza_ingredients").delete().eq("pizza_id", id);
    if (delErr) {
      setSaving(false);
      setSaveError(delErr);
      return;
    }

    if (cleaned.length) {
      const toInsert = cleaned.map((r) => ({
        pizza_id: id,
        ingredient_id: r.ingredient_id!,
        stage: r.stage,
        qty: r.qty as number,
        unit: r.unit,
        sort_order: r.sort_order ?? 0,
      }));

      const { error: piInsErr } = await supabase.from("pizza_ingredients").insert(toInsert);
      if (piInsErr) {
        setSaving(false);
        setSaveError(piInsErr);
        return;
      }
    }

    setSaving(false);
    setSaveOk(true);
    setTimeout(() => setSaveOk(false), 900);

    if (!pizzaId) {
      router.replace(`/pizzas/${id}`);
    }
  };

  const del = async () => {
    if (!pizzaId) return;
    const ok = window.confirm("Supprimer cette fiche pizza ?");
    if (!ok) return;

    setSaving(true);
    const { error: delErr } = await supabase.from("pizza_recipes").delete().eq("id", pizzaId);
    setSaving(false);

    if (delErr) {
      setSaveError(delErr);
      return;
    }

    router.replace("/pizzas");
  };

  if (status === "loading") {
    return (
      <main style={{ background: theme.bg, minHeight: "100vh", padding: 16, color: theme.text }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ color: theme.muted }}>Chargement…</div>
        </div>
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

  if (status === "ERROR") {
    return (
      <main style={{ background: theme.bg, minHeight: "100vh", padding: 16, color: theme.text }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <Link href="/pizzas" style={{ color: theme.muted, textDecoration: "none" }}>
            ← Retour
          </Link>
          <h1 style={{ marginTop: 14, marginBottom: 10 }}>Erreur</h1>
          <pre
            style={{
              background: "#fff",
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              padding: 12,
              overflow: "auto",
            }}
          >
            {JSON.stringify(error, null, 2)}
          </pre>
        </div>
      </main>
    );
  }

  if (!form) {
    return (
      <main style={{ background: theme.bg, minHeight: "100vh", padding: 16, color: theme.text }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ color: theme.muted }}>Chargement…</div>
        </div>
      </main>
    );
  }

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

  return (
    <main style={{ background: theme.bg, minHeight: "100vh", padding: 16, color: theme.text }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <Link href="/pizzas" style={{ color: theme.muted, textDecoration: "none", fontWeight: 900 }}>
            Accueil
          </Link>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {isEdit ? (
              <button type="button" onClick={exportPdf} disabled={saving} style={btn}>
                PDF
              </button>
            ) : null}

            {isEdit ? (
              <button type="button" onClick={del} disabled={saving} style={btn}>
                Supprimer
              </button>
            ) : null}

            <button type="button" onClick={save} disabled={saving} style={btnPrimary}>
              {saving ? "Sauvegarde…" : saveOk ? "OK" : "Sauvegarder"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: -0.4 }}>Fiche pizza</h1>
          <div style={{ color: theme.muted, marginTop: 4 }}>Empâtement + ingrédients + notes</div>
        </div>

        {saveError ? (
          <pre
            style={{
              marginTop: 12,
              background: "#fff",
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              padding: 12,
              overflow: "auto",
            }}
          >
            {JSON.stringify(saveError, null, 2)}
          </pre>
        ) : null}

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ fontWeight: 950, fontSize: 22, textAlign: "center" }}>
            {form.name.trim() ? form.name.trim() : "Pizza (à nommer)"}
          </div>
          <div style={{ color: theme.muted, textAlign: "center", marginTop: 6, fontSize: 13 }}>
            {rowsCount.pre} avant four · {rowsCount.post} après four · total {rowsCount.total}
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
          <div style={card}>
            <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Nom de la pizza</div>
            <input
              style={{ ...input, fontSize: 20, fontWeight: 950 }}
              placeholder="Ex : Margherita / Regina / Burrata…"
              value={form.name}
              onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10, marginTop: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Empâtement</div>
                <select
                  style={input}
                  value={form.dough_recipe_id || ""}
                  onChange={(e) => setForm((p) => (p ? { ...p, dough_recipe_id: e.target.value } : p))}
                >
                  <option value="">Aucun</option>
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {String(r.name ?? "—")} ({String(r.type ?? "—")})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Poids pâton (g)</div>
                <input
                  style={{ ...input, textAlign: "center", fontWeight: 950 }}
                  inputMode="decimal"
                  value={ballWeightG}
                  onChange={(e) => setBallWeightG(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900 }}>Coût empâtement</div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 2 }}>{fmtMoney(costs.dough)}</div>
              </div>

              <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900 }}>Coût total</div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 2 }}>{fmtMoney(costs.total)}</div>
                <div style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>Toppings: {fmtMoney(costs.toppings)}</div>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Photo</div>

            <div
              style={{
                border: `1px dashed ${theme.border}`,
                borderRadius: 16,
                height: 260,
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {photoPreview ? (
                <img src={photoPreview} alt="pizza" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ color: theme.muted, fontWeight: 900 }}>Clique pour ajouter une photo</div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} disabled={photoUploading} />
              <button
                type="button"
                onClick={clearPhoto}
                disabled={photoUploading || (!form.photo_url && !photoPreview)}
                style={btn}
              >
                Retirer
              </button>
              {photoUploading ? <span style={{ color: theme.muted, fontWeight: 900 }}>Upload…</span> : null}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Avant four</div>
            <div style={{ color: theme.muted, fontSize: 12, fontWeight: 900 }}>Ajoute ingrédients + quantités + unité</div>
          </div>
          <div style={{ marginTop: 10 }}>
            <PizzaIngredientList stage="pre" ingredients={ingredients} rows={rows} onChange={setRows} />
          </div>
        </div>

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Après four</div>
            <div style={{ color: theme.muted, fontSize: 12, fontWeight: 900 }}>Finition / sortie de four</div>
          </div>
          <div style={{ marginTop: 10 }}>
            <PizzaIngredientList stage="post" ingredients={ingredients} rows={rows} onChange={setRows} />
          </div>
        </div>

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ fontSize: 16, fontWeight: 950 }}>Note technique</div>
          <textarea
            style={{
              ...input,
              height: "auto",
              minHeight: 140,
              padding: 12,
              lineHeight: 1.4,
              marginTop: 10,
              resize: "vertical",
              fontWeight: 700,
            }}
            placeholder="Procédé, organisation, cuisson, gestes, finitions…"
            value={form.notes}
            onChange={(e) => setForm((p) => (p ? { ...p, notes: e.target.value } : p))}
          />
        </div>

        <div style={{ height: 28 }} />
      </div>
    </main>
  );
}
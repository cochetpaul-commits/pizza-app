"use client";
import { offerRowToCpu } from "@/lib/offerPricing";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PizzaIngredientList from "@/components/PizzaIngredientList";
import type { Ingredient, PizzaIngredientRow, UnitType } from "@/lib/types";
import { SmartSelect, type SmartSelectOption } from "@/components/SmartSelect";
import { TopNav } from "@/components/TopNav";

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
  const x = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function fmtMoney(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtPct1(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
}

function fmtKg2(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €/kg";
}

function normalizeUnit(u: unknown): UnitType {
  const s = String(u ?? "").trim().toLowerCase();
  if (s === "pc") return "pcs";
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
  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, { g?: number; ml?: number; pcs?: number }>>({});
  const [supplierByIngredient, setSupplierByIngredient] = useState<Record<string, string | null>>({});
  const [offerMetaByIngredient, setOfferMetaByIngredient] = useState<Record<string, { density_kg_per_l?: number | null; piece_weight_g?: number | null }>>({});

  const [form, setForm] = useState<{
    name: string;
    dough_recipe_id: string;
    notes: string;
    photo_url: string;
  } | null>(null);

  const [ballWeightG, setBallWeightG] = useState<string>("264");

  const [vatRate, setVatRate] = useState<string>("10");
  const [marginRate, setMarginRate] = useState<string>("75");

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

  const ballWeightNum = useMemo(() => {
    const n = Number(String(ballWeightG).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [ballWeightG]);

  const dough = useMemo(() => {
    const id = form?.dough_recipe_id || "";
    return recipes.find((r) => r.id === id) ?? null;
  }, [recipes, form?.dough_recipe_id]);

  const doughBadge = useMemo(() => {
    if (!dough) return null;

    const totalCost = n2(dough.total_cost);
    const yieldGrams = n2(dough.yield_grams);
    const ballW = n2(dough.ball_weight);

    const costPerKg = yieldGrams > 0 && totalCost > 0 ? totalCost / (yieldGrams / 1000) : 0;
    const costPerBall = ballW > 0 && costPerKg > 0 ? costPerKg * (ballW / 1000) : 0;

    if (costPerKg <= 0) return null;
    return { costPerKg, costPerBall };
  }, [dough]);

    const vatOptions = useMemo<SmartSelectOption[]>(
    () => [
      { id: "5.5", name: "TVA 5,5 %", category: "TVA", rightBottom: "5,5" },
      { id: "10", name: "TVA 10 %", category: "TVA", rightBottom: "10" },
      { id: "20", name: "TVA 20 %", category: "TVA", rightBottom: "20" },
    ],
    []
  );

  const doughOptions = useMemo<SmartSelectOption[]>(() => {
    return (recipes ?? []).map((r) => {
      const totalCost = n2(r.total_cost);
      const yieldGrams = n2(r.yield_grams);

      const costPerKg = yieldGrams > 0 && totalCost > 0 ? totalCost / (yieldGrams / 1000) : 0;
      const costPerBall = costPerKg > 0 && ballWeightNum > 0 ? costPerKg * (ballWeightNum / 1000) : 0;

      const typeLabel = String(r.type ?? "—");
      const top = costPerBall > 0 ? `${typeLabel} • ${fmtMoney(costPerBall)}/pâton` : typeLabel;

      return {
        id: String(r.id),
        name: String(r.name ?? "—"),
        category: typeLabel,
        rightTop: top,
        rightBottom: costPerKg > 0 ? fmtKg2(costPerKg) : "prix manquant",
      };
    });
  }, [recipes, ballWeightNum]);
  const ingredientWeightGrams = useMemo(() => {
    return rows.reduce((acc, r) => {
      if (!r.ingredient_id) return acc;
      const u = normalizeUnit(r.unit);
      if (u !== "g") return acc;
      const qty = typeof r.qty === "number" ? r.qty : n2(r.qty);
      return acc + n2(qty);
    }, 0);
  }, [rows]);

  const vatPct = useMemo(() => {
    const n = Number(String(vatRate).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [vatRate]);

  const marginPct = useMemo(() => {
    const n = Number(String(marginRate).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [marginRate]);

   const costs = useMemo(() => {
    const toppings = rows.reduce((acc, r) => {
      if (!r.ingredient_id) return acc;

      const ing = ingredients.find((x) => x.id === r.ingredient_id) ?? null;
      const cpuObj = r.ingredient_id ? priceByIngredient[r.ingredient_id] : undefined;

      const u = normalizeUnit(r.unit);
      const cpuFromOffers = u === "g" ? cpuObj?.g : u === "ml" ? cpuObj?.ml : u === "pcs" ? cpuObj?.pcs : undefined;
      const cpuFromIndex = ing?.cost_per_unit ?? null;

      const cpu = n2(cpuFromOffers ?? cpuFromIndex);
      const qty = typeof r.qty === "number" ? r.qty : n2(r.qty);

      return acc + qty * cpu;
    }, 0);

    const totalCost = n2(dough?.total_cost);
    const yieldGrams = n2(dough?.yield_grams);
   const doughCostPerKg =
  dough && "cost_per_kg" in dough
    ? n2((dough as { cost_per_kg?: number | null }).cost_per_kg)
    : 0;
    const doughCpuG = doughCostPerKg > 0 ? doughCostPerKg / 1000 : yieldGrams > 0 ? totalCost / yieldGrams : 0;
    const doughCost = ballWeightNum > 0 ? doughCpuG * ballWeightNum : 0;

    return {
      toppings: round2(toppings),
      dough: round2(doughCost),
      total: round2(toppings + doughCost),
      doughCpuG,
    };
  }, [rows, ingredients, priceByIngredient, dough, ballWeightNum]);

  const weightTotalGrams = useMemo(() => {
    const w = n2(ballWeightNum) + n2(ingredientWeightGrams);
    return w > 0 ? w : 0;
  }, [ballWeightNum, ingredientWeightGrams]);

  const costPerKg = useMemo(() => {
    if (weightTotalGrams <= 0) return 0;
    return costs.total / (weightTotalGrams / 1000);
  }, [costs.total, weightTotalGrams]);

  const pricing = useMemo(() => {
    const m = Math.min(Math.max(marginPct, 0), 99.9) / 100;
    const v = Math.min(Math.max(vatPct, 0), 100) / 100;

    const pvHT = costs.total > 0 && m < 1 ? costs.total / (1 - m) : 0;
    const pvTTC = pvHT > 0 ? pvHT * (1 + v) : 0;

    return { pvHT, pvTTC, vatPct, marginPct };
  }, [costs.total, vatPct, marginPct]);

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
 
      const { data: offers, error: offErr } = await supabase
  .from("v_latest_offers")
  .select("ingredient_id, supplier_id, unit, unit_price, pack_price, pack_total_qty, pack_unit, pack_count, pack_each_qty, pack_each_unit, density_kg_per_l, piece_weight_g");

if (offErr) {
  setStatus("ERROR");
  setError(offErr);
  return;
}

const supplierMap: Record<string, string> = {
  B347: "METRO",
  "0074": "MAEL",
  B86F: "B86F",
  CD44: "CD44",
};

const priceMap: Record<string, { g?: number; ml?: number; pcs?: number }> = {};
const metaMap: Record<string, { density_kg_per_l?: number | null; piece_weight_g?: number | null }> = {};
const supplierByIngredient: Record<string, string | null> = {};

(offers ?? []).forEach((o: unknown) => {
  const oo = typeof o === "object" && o ? (o as Record<string, unknown>) : {};

  const id = String(oo["ingredient_id"] ?? "");
  if (!id) return;

  const cpu = offerRowToCpu(oo);
  if (!priceMap[id]) priceMap[id] = {};
  priceMap[id] = { ...priceMap[id], ...cpu };

  const densityVal = oo["density_kg_per_l"];
  const pieceVal = oo["piece_weight_g"];
  const density = typeof densityVal === "number" ? densityVal : null;
  const pieceG = typeof pieceVal === "number" ? pieceVal : null;
  metaMap[id] = { density_kg_per_l: density, piece_weight_g: pieceG };

  const supplierId = String(oo["supplier_id"] ?? "");
  const code = supplierId ? supplierId.slice(0, 4).toUpperCase() : "";
  supplierByIngredient[id] = code ? (supplierMap[code] ?? code) : null;
});

setPriceByIngredient(priceMap);
setOfferMetaByIngredient(metaMap);
setSupplierByIngredient(supplierByIngredient);

      if (!isEdit) {
        setForm({ name: "", dough_recipe_id: "", notes: "", photo_url: "" });
        setRows([]);
        setPhotoPreview(null);
        setBallWeightG("264");
        setVatRate("10");
        setMarginRate("75");
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
        setSaveError({ message: "Sauvegarde d'abord la pizza avant export PDF." });
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

    if (!form.dough_recipe_id) {
      setSaveError({ message: "Empâtement obligatoire" });
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
      dough_recipe_id: form.dough_recipe_id,
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
      <main className="container">
        <TopNav title="Pizza" subtitle="Chargement..." backHref="/pizzas" backLabel="Fiches pizza" />
        <p className="muted">Chargement...</p>
      </main>
    );
  }

  if (status === "NOT_LOGGED") {
    return (
      <main className="container">
        <TopNav title="Pizza" backHref="/pizzas" backLabel="Fiches pizza" />
        <p className="muted">NOT_LOGGED</p>
        <Link className="btn btnPrimary" href="/login" style={{ marginTop: 12, display: "inline-block" }}>
          Aller sur /login
        </Link>
      </main>
    );
  }

  if (status === "ERROR") {
    return (
      <main className="container">
        <TopNav title="Erreur" backHref="/pizzas" backLabel="Fiches pizza" />
        <pre className="code" style={{ marginTop: 12 }}>{JSON.stringify(error, null, 2)}</pre>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="container">
        <TopNav title="Pizza" subtitle="Chargement..." backHref="/pizzas" backLabel="Fiches pizza" />
        <p className="muted">Chargement...</p>
      </main>
    );
  }

  const pageTitle = isEdit ? (form.name.trim() || "Pizza") : "Nouvelle pizza";
  const pageSubtitle = isEdit ? "Fiche pizza" : "Non sauvegardee";

  return (
    <main className="container">
      <TopNav
        title={pageTitle}
        subtitle={pageSubtitle}
        backHref="/pizzas"
        backLabel="Fiches pizza"
        right={
          <>
            <button
              className="btn btnPrimary"
              type="button"
              onClick={save}
              disabled={saving || !form.dough_recipe_id || !form.name.trim()}
            >
              {saving ? "Sauvegarde..." : saveOk ? "OK" : "Sauvegarder"}
            </button>
            {isEdit && (
              <button className="btn" type="button" onClick={exportPdf} disabled={saving}>
                PDF
              </button>
            )}
            {isEdit && (
              <button className="btn btnDanger" type="button" onClick={del} disabled={saving}>
                Supprimer
              </button>
            )}
          </>
        }
      />

      {saveError ? (
        <pre className="code" style={{ marginTop: 10 }}>{JSON.stringify(saveError, null, 2)}</pre>
      ) : null}

      {/* 1. Nom */}
      <div style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 6 }}>Nom de la pizza</div>
        <input
          className="input"
          value={form.name}
          onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))}
          placeholder="Ex : Margherita / Regina / Burrata..."
          style={{ fontSize: 20, fontWeight: 950 }}
        />
      </div>

      {/* 2. Empatement + Poids paton */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12, alignItems: "end" }}>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Empatement</div>
            <SmartSelect
              options={doughOptions}
              value={form.dough_recipe_id || ""}
              onChange={(v) => setForm((p) => (p ? { ...p, dough_recipe_id: v } : p))}
              placeholder="Selectionnez un empatement..."
              inputStyle={{ width: "100%" }}
            />
            {doughBadge && (
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                {fmtKg2(doughBadge.costPerKg)} {"\u2022"} {fmtMoney(doughBadge.costPerBall)}/paton
              </div>
            )}
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Poids paton (g)</div>
            <input
              className="input"
              inputMode="decimal"
              value={ballWeightG}
              onChange={(e) => setBallWeightG(e.target.value)}
              style={{ textAlign: "center", fontWeight: 950 }}
            />
          </div>
        </div>
      </div>

      {/* 3. Avant four */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 950 }}>Avant four</div>
          <div className="muted" style={{ fontSize: 12 }}>{rowsCount.pre} ingredient(s)</div>
        </div>
        <PizzaIngredientList
          stage="pre"
          ingredients={ingredients}
          rows={rows}
          onChange={setRows}
          priceByIngredient={priceByIngredient}
          offerMetaByIngredient={offerMetaByIngredient}
          supplierByIngredient={supplierByIngredient}
        />
      </div>

      {/* 4. Apres four */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 950 }}>Apres four</div>
          <div className="muted" style={{ fontSize: 12 }}>{rowsCount.post} ingredient(s)</div>
        </div>
        <PizzaIngredientList
          stage="post"
          ingredients={ingredients}
          rows={rows}
          onChange={setRows}
          priceByIngredient={priceByIngredient}
          offerMetaByIngredient={offerMetaByIngredient}
          supplierByIngredient={supplierByIngredient}
        />
      </div>

      {/* 5. Pricing */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 10 }}>Pricing</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div className="muted" style={{ marginBottom: 6, fontSize: 12 }}>TVA vente</div>
            <SmartSelect
              options={vatOptions}
              value={vatRate}
              onChange={(v) => setVatRate(v)}
              placeholder="TVA..."
              inputStyle={{ width: "100%" }}
            />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6, fontSize: 12 }}>Marge (taux de marque %)</div>
            <input
              className="input"
              inputMode="decimal"
              value={marginRate}
              onChange={(e) => setMarginRate(e.target.value)}
              style={{ textAlign: "center", fontWeight: 950 }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
          <div className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>Cout total</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtMoney(costs.total)}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              Pate {fmtMoney(costs.dough)} + garniture {fmtMoney(costs.toppings)}
            </div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>Cout / kg</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtKg2(costPerKg)}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{Math.round(weightTotalGrams)} g total</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>Prix conseille HT</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtMoney(pricing.pvHT)}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Marge {fmtPct1(pricing.marginPct)}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>Prix conseille TTC</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtMoney(pricing.pvTTC)}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>TVA {fmtPct1(pricing.vatPct)}</div>
          </div>
        </div>
      </div>

      {/* 6. Note technique */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 8 }}>Note technique</div>
        <textarea
          className="input"
          value={form.notes}
          onChange={(e) => setForm((p) => (p ? { ...p, notes: e.target.value } : p))}
          placeholder="Procede, organisation, cuisson, gestes, finitions..."
          rows={5}
          style={{ resize: "vertical", lineHeight: 1.35, height: "auto" }}
        />
      </div>

      {/* 7. Photo (pour PDF uniquement) */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 8 }}>Photo (pour export PDF uniquement)</div>
        <div
          style={{
            border: "1px dashed #ccc",
            borderRadius: 12,
            height: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
            background: "#fafafa",
          }}
        >
          {photoPreview ? (
            <Image
              src={photoPreview}
              alt="pizza"
              fill
              sizes="(max-width: 980px) 100vw, 480px"
              style={{ objectFit: "contain" }}
            />
          ) : (
            <span className="muted">Aucune photo</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} disabled={photoUploading} />
          <button
            className="btn"
            type="button"
            onClick={clearPhoto}
            disabled={photoUploading || (!form.photo_url && !photoPreview)}
          >
            Retirer
          </button>
          {photoUploading ? <span className="muted">Upload...</span> : null}
        </div>
      </div>

      <div style={{ height: 28 }} />
    </main>
  );
}

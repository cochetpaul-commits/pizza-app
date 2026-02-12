"use client";
import { offerToCpu } from "@/lib/offerPricing";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Ingredient } from "@/lib/types";

type VatRate = 0.055 | 0.1 | 0.2;

const VAT_OPTIONS: Array<{ label: string; value: VatRate }> = [
  { label: "5,5%", value: 0.055 },
  { label: "10%", value: 0.1 },
  { label: "20%", value: 0.2 },
];

function toVatRate(v: unknown): VatRate {
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (n === 0.055) return 0.055;
  if (n === 0.1) return 0.1;
  if (n === 0.2) return 0.2;
  return 0.1;
}

type KitchenRecipeRowDB = {
  id: string;
  user_id: string;
  name: string | null;
  category: string | null;
  yield_grams: number | null;
  portions_count: number | null;
  vat_rate: number | null;
  margin_rate: number | null;
  notes: string | null;
  procedure: string | null;
  output_ingredient_id: string | null;
  is_active: boolean | null;
  is_draft: boolean | null;
};

type Unit = "g" | "ml" | "pc";

type LineUI = {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  qty: number;
  unit: Unit;
  sort_order: number;
  ingredient_name?: string;
  ingredient_cost_per_unit?: number | null;
};
type PgError = { code?: string; message?: string };

type LatestOffer = {
  ingredient_id?: unknown;
  unit?: unknown;
  unit_price?: unknown;
};

type DbLine = {
  id?: unknown;
  recipe_id?: unknown;
  ingredient_id?: unknown;
  qty?: unknown;
  unit?: unknown;
  sort_order?: unknown;
};

type ComputedLine = LineUI & {
  cpu: number | null;
  cost: number;
};

function getObj(v: unknown) {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}
function getString(v: unknown, fallback = "") {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  const t = s.trim();
  return t ? t : fallback;
}
function getNumber(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function n2(v: unknown) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}
function round0(v: number) {
  return Math.round(v);
}
function round2(v: number) {
  return Math.round(v * 100) / 100;
}
function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}
function fmtMoney2(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
function fmtKg3(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " €/kg";
}
function fmtPct1(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
}
function tmpId() {
  return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function parsePositiveNumber(s: string) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function displayQtyInputValue(qty: number) {
  const n = n2(qty);
  return n > 0 ? String(n) : "";
}

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "preparation", label: "Préparation" },
  { value: "plat_cuisine", label: "Plat cuisiné" },
  { value: "dessert", label: "Dessert" },
  { value: "autre", label: "Autre" },
];

export default function KitchenRecipeForm(props: { recipeId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(props.recipeId);
  const recipeId = props.recipeId ?? null;

  const [status, setStatus] = useState<"loading" | "NOT_LOGGED" | "ERROR" | "OK">("loading");
  const [error, setError] = useState<unknown>(null);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, { g?: number; ml?: number; pcs?: number }>>({});
  const [lines, setLines] = useState<LineUI[]>([]);

  const [form, setForm] = useState<{
    name: string;
    category: string;
    yield_grams: string;
    portions_count: string;
    vat_rate: VatRate;
    margin_rate: string;
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
  const [newUnit, setNewUnit] = useState<Unit>("g");

  const theme = {
    bg: "#f3eadc",
    card: "#efe2d3",
    text: "#2f3a33",
    muted: "#6f6a61",
    border: "#d9c7b6",
    primary: "#c97a5a",
    primaryText: "#fff",
    warnBg: "#fff6e8",
    warnBorder: "#f2d4a7",
  };

  const card = {
    background: theme.card,
    border: `1px solid ${theme.border}`,
    borderRadius: 16,
    padding: 14,
  } as const;

  const input = {
    width: "100%",
    height: 40,
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    padding: "0 10px",
    fontSize: 15,
    background: "#fff",
    color: theme.text,
  } as const;

  const btn = {
    height: 40,
    padding: "0 12px",
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: "#fff",
    color: theme.text,
    fontWeight: 900 as const,
    cursor: "pointer",
  } as const;

  const btnPrimary = {
    ...btn,
    background: theme.primary,
    border: `1px solid ${theme.primary}`,
    color: theme.primaryText,
  } as const;

  const metricBox = {
    background: "#fff",
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
    padding: 10,
    minHeight: 78,
  } as const;

  const yieldGramsNum = useMemo(() => {
    const n = Number(String(form?.yield_grams ?? "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [form?.yield_grams]);

  const portionsNum = useMemo(() => {
    const n = Number(String(form?.portions_count ?? "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [form?.portions_count]);

  const vatPct = useMemo(() => {
  const r = toVatRate(form?.vat_rate);
  return r * 100;
}, [form?.vat_rate]);

  const marginPct = useMemo(() => {
    const n = Number(String(form?.margin_rate ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [form?.margin_rate]);

  const ingredientWeightGrams = useMemo(() => {
    return (lines ?? []).reduce((acc, l) => {
      if (l.unit !== "g") return acc;
      return acc + n2(l.qty);
    }, 0);
  }, [lines]);

  const yieldTooHigh = ingredientWeightGrams > 0 && yieldGramsNum > ingredientWeightGrams;

  const lossPercent = useMemo(() => {
    if (ingredientWeightGrams <= 0 || yieldGramsNum <= 0) return null;
    if (yieldTooHigh) return null;
    return (1 - yieldGramsNum / ingredientWeightGrams) * 100;
  }, [ingredientWeightGrams, yieldGramsNum, yieldTooHigh]);

  const computed = useMemo(() => {
    const rows: ComputedLine[] = (lines ?? [])
      .slice()
      .sort((a, b) => n2(a.sort_order) - n2(b.sort_order))
      .map((l) => {
        const qty = n2(l.qty);
        const cpu = typeof l.ingredient_cost_per_unit === "number" ? l.ingredient_cost_per_unit : null;
        const cost = cpu != null ? cpu * qty : 0;
        return { ...l, qty, cpu, cost };
      });

    const missing = rows.some((r) => r.cpu == null);
    const totalCost = rows.reduce((acc, r) => acc + n2(r.cost), 0);

    const costPerKg = yieldGramsNum > 0 ? totalCost / (yieldGramsNum / 1000) : 0;
    const costPerPortion = portionsNum > 0 ? totalCost / portionsNum : 0;

    return {
      rows,
      missing,
      totalCost: round2(totalCost),
      costPerKg,
      costPerPortion,
    };
  }, [lines, yieldGramsNum, portionsNum]);
  const pricing = useMemo(() => {
    const m = Math.min(Math.max(marginPct, 0), 99.9) / 100;
    const v = Math.min(Math.max(vatPct, 0), 100) / 100;

    const pvPortionHT = computed.costPerPortion > 0 && m < 1 ? computed.costPerPortion / (1 - m) : 0;
    const pvPortionTTC = pvPortionHT > 0 ? pvPortionHT * (1 + v) : 0;

    const pvKgHT = computed.costPerKg > 0 && m < 1 ? computed.costPerKg / (1 - m) : 0;
    const pvKgTTC = pvKgHT > 0 ? pvKgHT * (1 + v) : 0;

    return {
      portionHT: pvPortionHT,
      portionTTC: pvPortionTTC,
      kgHT: pvKgHT,
      kgTTC: pvKgTTC,
      vatPct,
      marginPct,
    };
  }, [computed.costPerPortion, computed.costPerKg, vatPct, marginPct]);

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

    const { data: offers, error: offErr } = await supabase
      .from("v_latest_offers")
      .select("ingredient_id, unit, unit_price");

    if (offErr) {
      setStatus("ERROR");
      setError(offErr);
      return;
    }

    const priceMapCpu: Record<string, { g?: number; ml?: number; pcs?: number }> = {};

    (offers ?? []).forEach((o: unknown) => {
      const row = getObj(o) as LatestOffer | null;
      const iid = getString(row?.ingredient_id, "");
      if (!iid) return;

      const unit = getString(row?.unit, "");
      const unitPrice = getNumber(row?.unit_price, 0);

      const cpu = offerToCpu(unit, unitPrice);
      if (!priceMapCpu[iid]) priceMapCpu[iid] = {};
      priceMapCpu[iid] = { ...priceMapCpu[iid], ...cpu };
    });

    setPriceByIngredient(priceMapCpu);


    if (!isEdit) {
      setForm({
        name: "",
        category: "plat_cuisine",
        yield_grams: "1000",
        portions_count: "1",
        vat_rate: 0.1,
        margin_rate: "60",
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
      .select("id,user_id,name,category,yield_grams,portions_count,vat_rate,margin_rate,notes,procedure,output_ingredient_id,is_active,is_draft")
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
      category: String(rr.category ?? "plat_cuisine"),
      yield_grams: String(rr.yield_grams ?? 1000),
      portions_count: String(rr.portions_count ?? 1),
      vat_rate: toVatRate(rr.vat_rate),
      margin_rate: String(rr.margin_rate ?? 60),
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

    const pickCpu = (iid: string, unit: Unit, fallbackCostPerUnit: unknown) => {
      const m = priceMapCpu[iid];
      const fromOffers = unit === "ml" ? m?.ml : unit === "pc" ? m?.pcs : m?.g;
      const cpuOffer = typeof fromOffers === "number" ? fromOffers : null;
      if (cpuOffer != null) return cpuOffer;

      const fb = typeof fallbackCostPerUnit === "number" ? fallbackCostPerUnit : getNumber(fallbackCostPerUnit, 0);
      return fb > 0 ? fb : null;
    };

    const mapped: LineUI[] = (ln ?? []).map((raw: unknown) => {
      const row = getObj(raw) as DbLine | null;

      const lineIngredientId = getString(row?.ingredient_id, "");
      const ingRow = ingList.find((x) => x.id === lineIngredientId) ?? null;

      const unitRaw = getString(row?.unit, "g").toLowerCase();
      const unit: Unit = unitRaw === "ml" ? "ml" : unitRaw === "pc" ? "pc" : "g";

      const fallbackCpu = getObj(ingRow)?.["cost_per_unit"];

      return {
        id: getString(row?.id, tmpId()),
        recipe_id: getString(row?.recipe_id, recipeId ?? ""),
        ingredient_id: lineIngredientId,
        qty: n2(row?.qty),
        unit,
        sort_order: n2(row?.sort_order),
        ingredient_name: getString(getObj(ingRow)?.["name"], ""),
        ingredient_cost_per_unit: pickCpu(lineIngredientId, unit, fallbackCpu),
      };
    });

    setLines(mapped);
    setStatus("OK");
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (cancelled) return;
      await load();
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [recipeId, isEdit]);
  const updateLine = (id: string, patch: Partial<LineUI>) => {
    setLines((prev) => (prev ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const addLineLocal = () => {
    if (!form) return;
    if (!newIngredientId) return;

    const qty = parsePositiveNumber(newQty);
    if (qty == null) return;

    const ingRow = ingredients.find((x) => x.id === newIngredientId) ?? null;
    const nextSort = (lines?.length ? Math.max(...lines.map((l) => n2(l.sort_order))) : -1) + 1;

    const row: LineUI = {
      id: tmpId(),
      recipe_id: recipeId ?? "",
      ingredient_id: newIngredientId,
      qty,
      unit: newUnit,
      sort_order: nextSort,
      ingredient_name: String(ingRow?.name ?? ""),
            ingredient_cost_per_unit: (() => {
        const m = priceByIngredient[String(newIngredientId)];
        const u = String(newUnit ?? "g").toLowerCase();
        const fromOffers = u === "ml" ? m?.ml : u === "pc" || u === "pcs" ? m?.pcs : m?.g;
        if (typeof fromOffers === "number") return fromOffers;

        const fb = getObj(ingRow)?.["cost_per_unit"];
        const fbNum = typeof fb === "number" ? fb : getNumber(fb, 0);
        return fbNum > 0 ? fbNum : null;
      })(),
    };

    setLines((p) => [...(p ?? []), row]);
    setNewQty("");
  };

  const delLine = (lineId: string) => {
    const ok = window.confirm("Supprimer cette ligne ?");
    if (!ok) return;
    setLines((p) => (p ?? []).filter((x) => x.id !== lineId));
  };

  const exportPdf = async () => {
    try {
      if (!recipeId) {
        setSaveError({ message: "PDF: sauvegarde d’abord la recette (il faut un ID)." });
        return;
      }

      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Token manquant (session)");

      const res = await fetch("/api/kitchen/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipeId: recipeId }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.message ? `${j.message}${j.details ? ` — ${j.details}` : ""}` : `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "recette-cuisine.pdf";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
    } catch (e: unknown) {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  setSaveError({ message: "Export PDF cuisine impossible", details: msg });
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

    if (yieldGramsNum <= 0) {
      setSaveError({ message: "Rendement (g) invalide" });
      return;
    }
    if (portionsNum <= 0) {
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

    const recipePayload: Record<string, unknown> = {
      name: nm,
      category: form.category || "plat_cuisine",
      yield_grams: round0(yieldGramsNum),
      portions_count: round0(portionsNum),
      vat_rate: form.vat_rate,
      margin_rate: round2(marginPct),
      notes: form.notes?.trim() || null,
      procedure: form.procedure?.trim() || null,
      output_ingredient_id: form.output_ingredient_id ?? null,
      updated_at: new Date().toISOString(),
      is_active: true,
      is_draft: false,
    };

    if (!id) {
      recipePayload.user_id = auth.user.id;
      const { data, error: insErr } = await supabase.from("kitchen_recipes").insert(recipePayload).select("id").single<{ id: string }>();
      if (insErr) {
        setSaving(false);
        setSaveError(insErr);
        return;
      }
      id = data?.id;
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

      const ingredientPayload: Record<string, unknown> = {
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

      const bindToRecipe = async (ingredientId: string) => {
        const { error: eBind } = await supabase
          .from("kitchen_recipes")
          .update({ output_ingredient_id: ingredientId, updated_at: new Date().toISOString() })
          .eq("id", recipeId);
        if (eBind) throw eBind;
        setForm((p) => (p ? { ...p, output_ingredient_id: ingredientId } : p));
      };

      if (form.output_ingredient_id) {
        const { error: eUpd } = await supabase.from("ingredients").update(ingredientPayload).eq("id", form.output_ingredient_id);
        if (eUpd) throw eUpd;
        return;
      }

      const { data: ins, error: eIns } = await supabase.from("ingredients").insert(ingredientPayload).select("id").single();

      if (eIns) {
        const pgCode = (eIns as PgError | null)?.code;
        const msg = String((eIns as PgError | null)?.message ?? "");
        if (pgCode === "23505" || msg.includes("duplicate key")) {
          const { data: existing, error: eFind } = await supabase.from("ingredients").select("id").eq("name", name).maybeSingle();
          if (eFind) throw eFind;
          const existingId = getString(getObj(existing)?.["id"], "");
          if (!existingId) throw eIns;

          const { error: eUpd2 } = await supabase.from("ingredients").update(ingredientPayload).eq("id", existingId);
          if (eUpd2) throw eUpd2;

          await bindToRecipe(existingId);
          return;
        }
        throw eIns;
      }

      const newId = getString(getObj(ins)?.["id"], "");
      if (!newId) throw new Error("ID ingrédient manquant après création");

      await bindToRecipe(newId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
      setSaveError({ message: "Index impossible", details: msg });
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
          <Link href="/" style={{ color: theme.muted, textDecoration: "none", fontWeight: 900 }}>
            Accueil
          </Link>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" onClick={exportPdf} disabled={saving || !isEdit} style={btn}>
              PDF
            </button>

            <button type="button" onClick={saveAsIngredient} disabled={savingIndex || saving || !isEdit} style={btn}>
              {savingIndex ? "Index…" : form.output_ingredient_id ? "MAJ index" : "Index"}
            </button>

            <button type="button" onClick={save} disabled={saving} style={btnPrimary}>
              {saving ? "Sauvegarde…" : saveOk ? "OK" : "Sauvegarder"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <h1 style={{ margin: 0, fontSize: 30, letterSpacing: -0.4 }}>Fiche cuisine</h1>
          <div style={{ color: theme.muted, marginTop: 4 }}>Ingrédients + rendement + portions + TVA + marge + prix</div>
        </div>

        {saveError ? (
          <pre style={{ marginTop: 12, background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 12, padding: 12, overflow: "auto" }}>
            {JSON.stringify(saveError, null, 2)}
          </pre>
        ) : null}

        {yieldTooHigh ? (
          <div
            style={{
              marginTop: 12,
              background: theme.warnBg,
              border: `1px solid ${theme.warnBorder}`,
              borderRadius: 12,
              padding: 12,
              fontWeight: 800,
            }}
          >
            {`Rendement (${round0(yieldGramsNum)} g) supérieur au poids ingrédients en g (${round0(
              ingredientWeightGrams
            )} g). Vérifie la saisie.`}
          </div>
        ) : null}

        <div style={{ marginTop: 12, ...card }}>
          <div style={{ fontWeight: 950, fontSize: 20, textAlign: "center" }}>{form.name.trim() ? form.name.trim() : "Recette"}</div>
          <div style={{ color: theme.muted, textAlign: "center", marginTop: 6, fontSize: 13 }}>
            Rendement: {yieldGramsNum || 0} g · Portions: {portionsNum || 0}
          </div>
        </div>

        <div style={{ marginTop: 12, ...card }}>
          <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Nom recette</div>
          <input
            style={{ ...input, height: 42, fontSize: 18, fontWeight: 950 }}
            placeholder="Ex: Lasagne bolognaise"
            value={form.name}
            onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))}
          />

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Catégorie</div>
              <select style={input} value={form.category} onChange={(e) => setForm((p) => (p ? { ...p, category: e.target.value } : p))}>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Rendement final mesuré (g)</div>
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

          <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              style={{ ...btn, height: 34 }}
              onClick={() => {
                const v = Math.round(ingredientWeightGrams);
                setForm((p) => (p ? { ...p, yield_grams: v > 0 ? String(v) : p.yield_grams } : p));
              }}
              disabled={ingredientWeightGrams <= 0}
            >
              = Poids ingrédients
            </button>
            <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800 }}>Pèse en fin de recette pour un coût/kg juste.</div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
            <div style={metricBox}>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900 }}>Poids ingrédients (g)</div>
              <div style={{ fontSize: 22, fontWeight: 950, marginTop: 2 }}>{round0(ingredientWeightGrams).toLocaleString("fr-FR")} g</div>
              <div style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>Somme des lignes en “g”</div>
            </div>

            <div style={metricBox}>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900 }}>Perte (%)</div>
              <div style={{ fontSize: 22, fontWeight: 950, marginTop: 2 }}>{lossPercent == null ? "—" : fmtPct1(lossPercent)}</div>
              <div style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>Rendement / ingrédients</div>
            </div>

            <div style={metricBox}>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900 }}>Coût total</div>
              <div style={{ fontSize: 22, fontWeight: 950, marginTop: 2 }}>{fmtMoney2(computed.totalCost)}</div>
              {computed.missing ? <div style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>Prix manquant</div> : <div style={{ height: 16 }} />}
            </div>

            <div style={metricBox}>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900 }}>Coût / kg</div>
              <div style={{ fontSize: 22, fontWeight: 950, marginTop: 2 }}>{fmtKg3(yieldGramsNum > 0 ? computed.costPerKg : 0)}</div>
              <div style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>Coût/portion: {fmtMoney2(portionsNum > 0 ? computed.costPerPortion : 0)}</div>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
            <div style={metricBox}>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 6 }}>TVA vente (%)</div>
              <select
  style={{ ...input, height: 40, fontWeight: 950 }}
  value={String(form.vat_rate)}
  onChange={(e) => setForm((p) => (p ? { ...p, vat_rate: toVatRate(e.target.value) } : p))}
>
  {VAT_OPTIONS.map((o) => (
    <option key={o.value} value={String(o.value)}>
      {o.label.replace("%", "").replace(".", ",")}
    </option>
  ))}
</select>
            </div>

            <div style={metricBox}>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 6 }}>Marge (taux de marque %)</div>
              <input
                style={{ ...input, height: 40, textAlign: "center", fontWeight: 950 }}
                inputMode="decimal"
                value={form.margin_rate}
                onChange={(e) => setForm((p) => (p ? { ...p, margin_rate: e.target.value } : p))}
              />
              <div style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>PV HT = Coût / (1 - marge)</div>
            </div>

            <div style={metricBox}>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900 }}>Prix conseillé portion TTC</div>
              <div style={{ fontSize: 22, fontWeight: 950, marginTop: 2 }}>{fmtMoney2(pricing.portionTTC)}</div>
              <div style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                TVA: {fmtPct1(pricing.vatPct)} · Marge: {fmtPct1(pricing.marginPct)}
              </div>
            </div>

            <div style={metricBox}>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900 }}>Prix conseillé / kg TTC</div>
              <div style={{ fontSize: 22, fontWeight: 950, marginTop: 2 }}>
                {round3(pricing.kgTTC).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/kg
              </div>
              <div style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                TVA: {fmtPct1(pricing.vatPct)} · Marge: {fmtPct1(pricing.marginPct)}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Ingrédient</div>
              <select style={input} value={newIngredientId} onChange={(e) => setNewIngredientId(e.target.value)}>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Qté</div>
              <input
                style={{ ...input, textAlign: "center", fontWeight: 950 }}
                inputMode="decimal"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: theme.muted, fontWeight: 900, marginBottom: 8 }}>Unité</div>
              <select style={input} value={newUnit} onChange={(e) => setNewUnit(e.target.value as Unit)}>
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="pc">pc</option>
              </select>
            </div>

            <button type="button" onClick={addLineLocal} disabled={saving} style={btnPrimary}>
              Ajouter
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Composition</div>
            <div style={{ color: theme.muted, fontSize: 12, fontWeight: 900 }}>{computed.rows.length} ligne(s)</div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {computed.rows.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 110px 90px 110px auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 10px",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 950 }}>{r.ingredient_name ?? "—"}</div>

                <input
                  style={{ ...input, height: 36, textAlign: "center", fontWeight: 950 }}
                  inputMode="decimal"
                  value={displayQtyInputValue(r.qty)}
                  onChange={(e) => {
                    const v = parsePositiveNumber(e.target.value);
                    updateLine(r.id, { qty: v == null ? 0 : v });
                  }}
                />

                <select
                  style={{ ...input, height: 36, padding: "0 10px", fontWeight: 950 }}
                  value={(r.unit ?? "g") as Unit}
                  onChange={(e) => updateLine(r.id, { unit: e.target.value as Unit })}
                >
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="pc">pc</option>
                </select>

                <div style={{ textAlign: "right", fontWeight: 950 }}>{fmtMoney2(n2(r.cost))}</div>

                <button type="button" onClick={() => delLine(r.id)} style={btn}>
                  Supprimer
                </button>
              </div>
            ))}

            {computed.rows.length === 0 ? <div style={{ color: theme.muted, fontWeight: 900 }}>Aucune ligne</div> : null}
          </div>
        </div>

        <div style={{ marginTop: 12, ...card }}>
          <div style={{ fontSize: 16, fontWeight: 950 }}>Notes</div>
          <textarea
            style={{ ...input, height: "auto", minHeight: 110, padding: 12, lineHeight: 1.4, marginTop: 10, resize: "vertical", fontWeight: 700 }}
            value={form.notes}
            onChange={(e) => setForm((p) => (p ? { ...p, notes: e.target.value } : p))}
          />
        </div>

        <div style={{ marginTop: 12, ...card }}>
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

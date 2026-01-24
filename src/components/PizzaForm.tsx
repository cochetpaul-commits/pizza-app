"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PizzaIngredientList from "@/components/PizzaIngredientList";
import type { Ingredient, PizzaIngredientRow, UnitType } from "@/lib/types";

type RecipeRow = { id: string; name: string; type: string };

type PizzaIngredientDBRow = {
  id: string;
  pizza_id: string;
  ingredient_id: string;
  stage: "pre" | "post";
  qty: number | null;
  unit: string | null;
  sort_order: number | null;
};

type PizzaRowDB = {
  id: string;
  name: string | null;
  dough_recipe_id: string | null;
  notes: string | null;
  photo_url: string | null;
};

function normalizeUnit(u: unknown): UnitType {
  const s = String(u ?? "").trim();
  // UnitType = "g" | "ml" | "pcs" | "pinch" | "dash"
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
              const n = Number(r.qty);
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
  for (const r of rows) {
    if (!r.ingredient_id) return { ok: false as const, message: "Ingrédient manquant dans une ligne." };
    const qty = typeof r.qty === "number" ? r.qty : NaN;
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false as const, message: "Quantité invalide (doit être > 0)." };
    if (!r.unit) return { ok: false as const, message: "Unité manquante." };
  }

  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${r.stage}:${r.ingredient_id}`;
    if (seen.has(k)) return { ok: false as const, message: "Doublon ingrédient dans la même section (avant/après four)." };
    seen.add(k);
  }

  return { ok: true as const };
}

function safeMessage(e: unknown) {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as { message?: unknown }).message ?? "Erreur");
  return "Erreur";
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

  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [rows, setRows] = useState<PizzaIngredientRow[]>([]);

  const [form, setForm] = useState<{
    name: string;
    dough_recipe_id: string;
    notes: string;
    photo_url: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const rowsCount = useMemo(() => {
    const pre = rows.filter((r) => r.stage === "pre").length;
    const post = rows.filter((r) => r.stage === "post").length;
    return { pre, post, total: pre + post };
  }, [rows]);

  useEffect(() => {
    const run = async () => {
      setStatus("loading");
      setError(null);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setStatus("NOT_LOGGED");
        return;
      }

      // 1) Empâtements
      const { data: recs, error: recErr } = await supabase
        .from("recipes")
        .select("id,name,type")
        .order("created_at", { ascending: false });

      if (recErr) {
        setStatus("ERROR");
        setError(recErr);
        return;
      }
      setRecipes((recs ?? []) as RecipeRow[]);

      // 2) Référentiel ingrédients
      const { data: ing, error: ingErr } = await supabase
        .from("ingredients")
        .select("id,name,category,allergens,is_active")
        .order("name", { ascending: true });

      if (ingErr) {
        setStatus("ERROR");
        setError(ingErr);
        return;
      }
      setIngredients((ing ?? []) as Ingredient[]);

      // 3) Mode CREATE
      if (!isEdit) {
        setForm({ name: "", dough_recipe_id: "", notes: "", photo_url: "" });
        setRows([]);
        setPhotoPreview(null);
        setStatus("OK");
        return;
      }

      // 4) Mode EDIT
      if (!pizzaId) {
        setStatus("ERROR");
        setError({ message: "pizzaId manquant" });
        return;
      }

      const { data: pizza, error: pizzaErr } = await supabase
        .from("pizza_recipes")
        .select("id,name,dough_recipe_id,notes,photo_url")
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pizzaId, isEdit]);

  const goBackHref = "/pizzas";

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
    } catch (err) {
      setSaveError({ message: "Upload photo impossible", details: safeMessage(err) });
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
    } catch (e) {
      setSaveError({ message: "Export PDF impossible", details: safeMessage(e) });
    }
  };

  const save = async () => {
    if (!form) return;

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
    };

    // A) CREATE ou UPDATE pizza_recipes
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

    // B) Ingrédients : delete + insert
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
        qty: r.qty as number, // safe: validateRows => number > 0
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
      router.push(`/pizzas/${id}`);
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

    router.push(goBackHref);
  };

  if (status === "loading") {
    return (
      <main className="container">
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  if (status === "NOT_LOGGED") {
    return (
      <main className="container">
        <p className="muted">NOT_LOGGED</p>
        <Link className="btn btnPrimary" href="/login">
          Aller sur /login
        </Link>
      </main>
    );
  }

  if (status === "ERROR") {
    return (
      <main className="container">
        <Link className="muted" href={goBackHref}>
          ← Retour
        </Link>
        <h1 className="h1" style={{ marginTop: 14 }}>
          Erreur
        </h1>
        <pre className="code">{JSON.stringify(error, null, 2)}</pre>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="container">
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  return (
    <main className="container">
      <Link className="muted" href={goBackHref}>
        ← Retour
      </Link>

      <div className="topbar" style={{ marginTop: 14, alignItems: "center" }}>
        <div>
          <h1 className="h1">{isEdit ? form.name || "Pizza" : "Créer une pizza"}</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            Fiche technique : empâtement + ingrédients avant/après four + grammages, puis notes.
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            Ingrédients : {rowsCount.pre} avant four, {rowsCount.post} après four (total {rowsCount.total})
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn btnPrimary" onClick={save} disabled={saving}>
            {saving ? "Sauvegarde…" : saveOk ? "OK" : "Sauvegarder"}
          </button>

          <button className="btn" onClick={exportPdf} disabled={saving || !isEdit}>
            Télécharger (PDF)
          </button>

          {isEdit ? (
            <button className="btn" onClick={del} disabled={saving}>
              Supprimer
            </button>
          ) : null}
        </div>
      </div>

      {saveError ? (
        <pre className="code" style={{ marginTop: 12 }}>
          {JSON.stringify(saveError, null, 2)}
        </pre>
      ) : null}

      {/* ORDRE UX FIGÉ */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="muted">Nom de la pizza</div>
        <input
          className="input"
          style={{ marginTop: 8 }}
          placeholder="Ex : Margherita / Regina / Burrata…"
          value={form.name}
          onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))}
        />

        <div className="muted" style={{ marginTop: 12 }}>
          Empâtement (optionnel)
        </div>
        <select
          className="input"
          style={{ marginTop: 8 }}
          value={form.dough_recipe_id || ""}
          onChange={(e) => setForm((p) => (p ? { ...p, dough_recipe_id: e.target.value } : p))}
        >
          <option value="">Aucun</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.type})
            </option>
          ))}
        </select>

        <div className="muted" style={{ marginTop: 12 }}>
          Photo (optionnel)
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} disabled={photoUploading} />

          <button
            className="btn"
            type="button"
            onClick={clearPhoto}
            disabled={photoUploading || (!form.photo_url && !photoPreview)}
          >
            Supprimer la photo
          </button>

          {photoUploading ? <span className="muted">Upload…</span> : null}
        </div>

        {photoPreview ? (
          <div style={{ marginTop: 10 }}>
            <img
              src={photoPreview}
              alt="preview"
              style={{ width: 220, height: 220, objectFit: "cover", borderRadius: 12, border: "1px solid #e5e7eb" }}
            />
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
        <PizzaIngredientList title="Ingrédients avant four" stage="pre" ingredients={ingredients} rows={rows} onChange={setRows} />
        <PizzaIngredientList
          title="Ingrédients après cuisson / sortie de four"
          stage="post"
          ingredients={ingredients}
          rows={rows}
          onChange={setRows}
        />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="muted">Notes / Procédé</div>
        <textarea
          className="input"
          style={{ marginTop: 8, minHeight: 120 }}
          placeholder="Organisation, cuisson, gestes, finitions (ex: jambon après four)…"
          value={form.notes}
          onChange={(e) => setForm((p) => (p ? { ...p, notes: e.target.value } : p))}
        />
      </div>
    </main>
  );
}
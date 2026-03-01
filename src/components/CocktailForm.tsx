"use client";

import { offerRowToCpu } from "@/lib/offerPricing";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { SmartSelect, type SmartSelectOption } from "@/components/SmartSelect";
import { formatLiquidQty } from "@/lib/formatUnit";

/* ── types ────────────────────────────────────────────────────── */

type IngRow = {
  id: string;
  name: string | null;
  piece_volume_ml: number | null;
};

type CocktailDB = {
  id: string;
  user_id: string;
  name: string | null;
  type: string | null;
  glass: string | null;
  garnish: string | null;
  steps: string | null;
  sell_price: number | null;
  image_url: string | null;
};

type LineDB = {
  id: string;
  cocktail_id: string;
  ingredient_id: string;
  qty: number | null;
  unit: string | null;
  sort_order: number | null;
};

type CocktailUnit = "cl" | "ml" | "pc" | "g";

type LineUI = {
  id: string;
  ingredient_id: string;
  qty: string;
  unit: CocktailUnit;
  sort_order: number;
  ingredient_name: string;
  cost: number | null;
};

type Form = {
  name: string;
  type: string;
  glass: string;
  garnish: string;
  steps: string;
  sell_price: string;
  image_url: string;
};

type PgError = { code?: string; message?: string; details?: string };

/* ── helpers ──────────────────────────────────────────────────── */

function n2(v: unknown) {
  const x = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function tmpId() {
  return `tmp-${Math.random().toString(36).slice(2)}`;
}

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseQty(s: string): number | null {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ── constants ────────────────────────────────────────────────── */

const TYPE_OPTIONS = [
  { value: "", label: "— type —" },
  { value: "long_drink", label: "Long drink" },
  { value: "short_drink", label: "Short drink" },
  { value: "shot", label: "Shot" },
  { value: "mocktail", label: "Mocktail" },
  { value: "signature", label: "Signature" },
];

const GLASS_OPTIONS = [
  { value: "", label: "— verre —" },
  { value: "tumbler", label: "Tumbler" },
  { value: "coupe", label: "Coupe" },
  { value: "flute", label: "Flûte" },
  { value: "highball", label: "Highball" },
  { value: "martini", label: "Martini" },
  { value: "autre", label: "Autre" },
];

const UNIT_OPTIONS: { value: CocktailUnit; label: string }[] = [
  { value: "cl", label: "cl" },
  { value: "ml", label: "ml" },
  { value: "pc", label: "pce" },
  { value: "g", label: "g" },
];

/* ── component ────────────────────────────────────────────────── */

export default function CocktailForm({ cocktailId }: { cocktailId?: string }) {
  const router = useRouter();
  const isEdit = !!cocktailId;

  const [status, setStatus] = useState<"loading" | "OK" | "ERROR">("loading");
  const [error, setError] = useState<unknown>(null);

  const [form, setForm] = useState<Form>({
    name: "",
    type: "",
    glass: "",
    garnish: "",
    steps: "",
    sell_price: "",
    image_url: "",
  });
  const [lines, setLines] = useState<LineUI[]>([]);

  const [ingredients, setIngredients] = useState<IngRow[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, { ml?: number; g?: number; pcs?: number }>>({});

  const [newIngId, setNewIngId] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState<CocktailUnit>("cl");

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState<PgError | null>(null);

  /* ── pricing ──────────────────────────────────────────────── */

  const ingByVol = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const i of ingredients) m.set(i.id, i.piece_volume_ml ?? null);
    return m;
  }, [ingredients]);

  function computeLineCost(iid: string, qty: number, unit: CocktailUnit): number | null {
    const cpu = priceMap[iid];
    if (!cpu) return null;

    let cpuMl = cpu.ml;
    if (cpuMl == null && cpu.pcs != null) {
      const pvm = ingByVol.get(iid) ?? null;
      if (pvm != null && pvm > 0) cpuMl = cpu.pcs / pvm;
    }

    if (unit === "cl" && cpuMl != null) return round2(qty * 10 * cpuMl);
    if (unit === "ml" && cpuMl != null) return round2(qty * cpuMl);
    if (unit === "g" && cpu.g != null) return round2(qty * cpu.g);
    if (unit === "pc" && cpu.pcs != null) return round2(qty * cpu.pcs);
    return null;
  }

  const totalCost = useMemo(() => {
    const sum = lines.reduce((acc, l) => {
      const q = parseQty(l.qty);
      if (q == null) return acc;
      return acc + n2(computeLineCost(l.ingredient_id, q, l.unit));
    }, 0);
    return round2(sum);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, priceMap, ingByVol]);

  /* ── ingredient options ───────────────────────────────────── */

  const ingOptions: SmartSelectOption[] = useMemo(
    () => ingredients.map((i) => ({ id: i.id, name: i.name ?? "" })),
    [ingredients]
  );

  /* ── load ─────────────────────────────────────────────────── */

  const load = async () => {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      setStatus("ERROR");
      setError(authErr ?? { message: "NOT_LOGGED" });
      return;
    }

    const { data: ings, error: iErr } = await supabase
      .from("ingredients")
      .select("id,name,piece_volume_ml")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (iErr) { setStatus("ERROR"); setError(iErr); return; }
    const ingList = (ings ?? []) as IngRow[];
    setIngredients(ingList);

    const { data: offers } = await supabase.from("v_latest_offers").select("*");
    const pm: Record<string, { ml?: number; g?: number; pcs?: number }> = {};
    for (const o of (offers ?? []) as Record<string, unknown>[]) {
      const iid = String(o["ingredient_id"] ?? "");
      if (iid) pm[iid] = offerRowToCpu(o);
    }
    setPriceMap(pm);

    if (!isEdit) { setStatus("OK"); return; }

    const { data: cocktail, error: cErr } = await supabase
      .from("cocktails")
      .select("id,user_id,name,type,glass,garnish,steps,sell_price,image_url")
      .eq("id", cocktailId)
      .maybeSingle();

    if (cErr) { setStatus("ERROR"); setError(cErr); return; }
    if (!cocktail) { setStatus("ERROR"); setError({ message: "Cocktail introuvable" }); return; }

    const c = cocktail as CocktailDB;
    setForm({
      name: c.name ?? "",
      type: c.type ?? "",
      glass: c.glass ?? "",
      garnish: c.garnish ?? "",
      steps: c.steps ?? "",
      sell_price: c.sell_price != null ? String(c.sell_price) : "",
      image_url: c.image_url ?? "",
    });
    setPhotoPreview(c.image_url ?? null);

    const { data: ln, error: lErr } = await supabase
      .from("cocktail_ingredients")
      .select("id,cocktail_id,ingredient_id,qty,unit,sort_order")
      .eq("cocktail_id", cocktailId)
      .order("sort_order", { ascending: true });

    if (lErr) { setStatus("ERROR"); setError(lErr); return; }

    const mapped: LineUI[] = ((ln ?? []) as LineDB[]).map((row) => {
      const unitRaw = (row.unit ?? "cl").toLowerCase() as CocktailUnit;
      const unit: CocktailUnit = ["cl", "ml", "pc", "g"].includes(unitRaw) ? unitRaw : "cl";
      const qty = row.qty != null ? n2(row.qty) : 0;
      const ingRow = ingList.find((x) => x.id === row.ingredient_id);
      return {
        id: row.id,
        ingredient_id: row.ingredient_id,
        qty: String(qty),
        unit,
        sort_order: n2(row.sort_order),
        ingredient_name: ingRow?.name ?? "",
        cost: computeLineCost(row.ingredient_id, qty, unit),
      };
    });

    setLines(mapped);
    setStatus("OK");
  };

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await load(); })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cocktailId, isEdit]);

  /* ── line actions ─────────────────────────────────────────── */

  const addLine = () => {
    if (!newIngId) return;
    const q = parseQty(newQty);
    if (q == null) return;

    const ingRow = ingredients.find((x) => x.id === newIngId);
    const nextSort = lines.length ? Math.max(...lines.map((l) => l.sort_order)) + 1 : 0;

    setLines((p) => [
      ...p,
      {
        id: tmpId(),
        ingredient_id: newIngId,
        qty: String(q),
        unit: newUnit,
        sort_order: nextSort,
        ingredient_name: ingRow?.name ?? "",
        cost: computeLineCost(newIngId, q, newUnit),
      },
    ]);
    setNewQty("");
    setNewIngId("");
  };

  const updateLine = (id: string, patch: Partial<LineUI>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...patch };
        const q = parseQty(updated.qty);
        updated.cost = q != null ? computeLineCost(updated.ingredient_id, q, updated.unit) : null;
        return updated;
      })
    );
  };

  const delLine = (id: string) => {
    if (!window.confirm("Supprimer cette ligne ?")) return;
    setLines((p) => p.filter((l) => l.id !== id));
  };

  /* ── photo ────────────────────────────────────────────────── */

  async function uploadPhoto(file: File) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("NOT_LOGGED");

    const uid = auth.user.id;
    const baseName = slugify(form.name.trim() || "cocktail");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const folder = cocktailId ? cocktailId : `tmp-${ts}`;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const storagePath = `${uid}/${folder}/${ts}-${baseName}.${ext}`;

    setPhotoUploading(true);
    const { error: upErr } = await supabase.storage
      .from("recipe-images")
      .upload(storagePath, file, { upsert: true, contentType: file.type || "image/jpeg" });

    if (upErr) {
      setPhotoUploading(false);
      throw new Error(upErr.message);
    }

    const { data: pub } = supabase.storage.from("recipe-images").getPublicUrl(storagePath);
    setPhotoUploading(false);
    return pub.publicUrl;
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError(null);
    try {
      const f = e.target.files?.[0];
      if (!f) return;
      const local = URL.createObjectURL(f);
      setPhotoPreview(local);
      const url = await uploadPhoto(f);
      URL.revokeObjectURL(local);
      setPhotoPreview(url);
      setForm((p) => ({ ...p, image_url: url }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPhotoError(`Upload échoué : ${msg}`);
      setPhotoPreview(form.image_url || null);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearPhoto() {
    setPhotoPreview(null);
    setPhotoError(null);
    setForm((p) => ({ ...p, image_url: "" }));
  }

  /* ── PDF export ───────────────────────────────────────────── */

  const exportPdf = async () => {
    try {
      if (!cocktailId) {
        setSaveError({ message: "PDF : sauvegarde d'abord le cocktail." });
        return;
      }
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Token manquant");

      const res = await fetch("/api/cocktails/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cocktailId }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.message ?? `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "cocktail.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveError({ message: "Export PDF impossible", details: msg });
    }
  };

  /* ── save ─────────────────────────────────────────────────── */

  const save = async () => {
    if (saving) return;
    setSaveError(null);
    setSaveOk(false);

    const nm = form.name.trim();
    if (!nm) { setSaveError({ message: "Nom obligatoire" }); return; }

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) { setSaveError(authErr ?? { message: "NOT_LOGGED" }); return; }

    setSaving(true);

    const sp = parseQty(form.sell_price);
    const payload: Record<string, unknown> = {
      name: nm,
      type: form.type || null,
      glass: form.glass || null,
      garnish: form.garnish.trim() || null,
      steps: form.steps.trim() || null,
      sell_price: sp,
      image_url: form.image_url.trim() || null,
      total_cost: totalCost > 0 ? totalCost : null,
      updated_at: new Date().toISOString(),
      is_draft: false,
    };

    let id = cocktailId;

    if (!id) {
      payload.user_id = auth.user.id;
      const { data, error: insErr } = await supabase
        .from("cocktails").insert(payload).select("id").single<{ id: string }>();
      if (insErr) { setSaving(false); setSaveError(insErr); return; }
      id = data?.id;
      if (!id) { setSaving(false); setSaveError({ message: "ID manquant après création" }); return; }
    } else {
      const { error: updErr } = await supabase.from("cocktails").update(payload).eq("id", id);
      if (updErr) { setSaving(false); setSaveError(updErr); return; }
    }

    const { error: delErr } = await supabase.from("cocktail_ingredients").delete().eq("cocktail_id", id);
    if (delErr) { setSaving(false); setSaveError(delErr); return; }

    const cleaned = lines
      .filter((l) => l.ingredient_id && parseQty(l.qty) != null)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l, idx) => ({
        cocktail_id: id,
        ingredient_id: l.ingredient_id,
        qty: parseQty(l.qty),
        unit: l.unit,
        sort_order: idx,
      }));

    if (cleaned.length) {
      const { error: insLinesErr } = await supabase.from("cocktail_ingredients").insert(cleaned);
      if (insLinesErr) { setSaving(false); setSaveError(insLinesErr); return; }
    }

    setSaving(false);
    setSaveOk(true);
    setTimeout(() => setSaveOk(false), 900);
    if (!cocktailId) router.replace(`/cocktails/${id}`);
  };

  /* ── render ───────────────────────────────────────────────── */

  if (status === "loading") {
    return <main className="container"><p className="muted">Chargement…</p></main>;
  }

  if (status === "ERROR") {
    return (
      <main className="container">
        <pre className="errorBox">{JSON.stringify(error, null, 2)}</pre>
      </main>
    );
  }

  const sellPriceNum = parseQty(form.sell_price);
  const margin =
    totalCost > 0 && sellPriceNum != null && sellPriceNum > totalCost
      ? round2(((sellPriceNum - totalCost) / sellPriceNum) * 100)
      : null;

  return (
    <main className="container">
      {/* NAV */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <Link href="/cocktails" style={{ fontSize: 13, opacity: 0.6 }}>← Cocktails</Link>
        <Link href="/" style={{ fontSize: 13, opacity: 0.6 }}>Accueil</Link>
      </div>

      <h1 style={{ margin: "0 0 16px", fontSize: 36, fontWeight: 800 }}>
        {isEdit ? (form.name || "Cocktail") : "Nouveau cocktail"}
      </h1>

      {/* 1. NOM + TYPE + VERRE + PRIX */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="label">Nom *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nom du cocktail"
            />
          </div>

          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Verre</label>
            <select className="input" value={form.glass} onChange={(e) => setForm((p) => ({ ...p, glass: e.target.value }))}>
              {GLASS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Prix de vente (€)</label>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              value={form.sell_price}
              onChange={(e) => setForm((p) => ({ ...p, sell_price: e.target.value }))}
              placeholder="ex: 12"
              style={{ MozAppearance: "textfield" } as React.CSSProperties}
            />
          </div>
        </div>
      </div>

      {/* 2. COMPOSITION */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="cardTitle">Composition</div>

        {lines.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "3fr 100px 70px 90px auto",
              gap: 6,
              padding: "4px 0",
              fontSize: 11, fontWeight: 700, color: "#777",
              textTransform: "uppercase", letterSpacing: 0.4,
              borderBottom: "1px solid #ddd", marginBottom: 4,
            }}>
              <div>Ingrédient</div>
              <div style={{ textAlign: "right" }}>Quantité</div>
              <div style={{ textAlign: "right" }}>Unité</div>
              <div style={{ textAlign: "right" }}>Coût</div>
              <div />
            </div>

            {lines.map((l) => {
              const q = parseQty(l.qty);
              const fmtQ = q != null ? formatLiquidQty(q, l.unit === "pc" || l.unit === "g" ? l.unit : l.unit) : l.qty;
              return (
                <div key={l.id} style={{
                  display: "grid",
                  gridTemplateColumns: "3fr 100px 70px 90px auto",
                  gap: 6, alignItems: "center",
                  padding: "4px 0", borderBottom: "1px solid #f0f0f0",
                }}>
                  <div style={{ fontSize: 13 }}>{l.ingredient_name || <span className="muted">—</span>}</div>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={l.qty}
                    onChange={(e) => updateLine(l.id, { qty: e.target.value })}
                    placeholder={fmtQ}
                    style={{ textAlign: "right", padding: "4px 6px", fontSize: 13 }}
                  />
                  <select
                    className="input"
                    value={l.unit}
                    onChange={(e) => updateLine(l.id, { unit: e.target.value as CocktailUnit })}
                    style={{ padding: "4px 6px", fontSize: 13 }}
                  >
                    {UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div style={{ textAlign: "right", fontSize: 13, color: l.cost != null ? "#1a1a1a" : "#ccc" }}>
                    {l.cost != null ? `${fmtMoney(l.cost)} €` : "—"}
                  </div>
                  <button
                    className="btn btnDanger" type="button" onClick={() => delLine(l.id)}
                    style={{ padding: "3px 10px", fontSize: 12 }}
                  >×</button>
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8, fontWeight: 700, fontSize: 14 }}>
              <span className="muted">Coût matière</span>
              <span>{totalCost > 0 ? `${fmtMoney(totalCost)} €` : "—"}</span>
              {margin != null && (
                <span className="muted" style={{ fontWeight: 400 }}>· marge {fmtMoney(margin)} %</span>
              )}
            </div>
          </div>
        )}

        {/* Ajouter une ligne */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 3, minWidth: 160 }}>
            <label className="label" style={{ fontSize: 11 }}>Ingrédient</label>
            <SmartSelect options={ingOptions} value={newIngId} onChange={setNewIngId} placeholder="Chercher…" menuMax={10} />
          </div>
          <div style={{ width: 80 }}>
            <label className="label" style={{ fontSize: 11 }}>Quantité</label>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLine()}
              placeholder="4"
              style={{ textAlign: "right" }}
            />
          </div>
          <div style={{ width: 70 }}>
            <label className="label" style={{ fontSize: 11 }}>Unité</label>
            <select className="input" value={newUnit} onChange={(e) => setNewUnit(e.target.value as CocktailUnit)}>
              {UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button className="btn btnPrimary" type="button" onClick={addLine} style={{ alignSelf: "flex-end" }}>
            Ajouter
          </button>
        </div>

        {newIngId && (() => {
          const q = parseQty(newQty);
          if (q == null) return null;
          const c = computeLineCost(newIngId, q, newUnit);
          const fmtQ = formatLiquidQty(q, newUnit === "pc" || newUnit === "g" ? newUnit : newUnit);
          if (c == null) return <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Pas de prix ({fmtQ})</div>;
          return <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Coût estimé : {fmtMoney(c)} € pour {fmtQ}</div>;
        })()}
      </div>

      {/* 3. PHOTO */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="cardTitle">Photo</div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {photoPreview ? (
            <Image
              src={photoPreview}
              alt="Photo cocktail"
              width={120}
              height={120}
              style={{ borderRadius: 8, objectFit: "cover", border: "1px solid #ccc" }}
              unoptimized
            />
          ) : (
            <div style={{
              width: 120, height: 120, borderRadius: 8,
              border: "1px dashed #ccc", background: "#f5f5f5",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, color: "#999",
            }}>Photo</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} disabled={photoUploading} />
            {photoPreview ? (
              <button className="btn btnDanger" type="button" onClick={clearPhoto} disabled={photoUploading}>
                Supprimer photo
              </button>
            ) : null}
            {photoUploading && <span className="muted">Upload en cours…</span>}
            {photoError && <span style={{ color: "red", fontSize: 12 }}>{photoError}</span>}
          </div>
        </div>
      </div>

      {/* 4. PROCÉDÉ + GARNITURE */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="label">Procédé / étapes</label>
            <textarea
              className="input"
              rows={4}
              value={form.steps}
              onChange={(e) => setForm((p) => ({ ...p, steps: e.target.value }))}
              placeholder="Décris les étapes de préparation…"
              style={{ resize: "vertical" }}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="label">Garniture</label>
            <input
              className="input"
              value={form.garnish}
              onChange={(e) => setForm((p) => ({ ...p, garnish: e.target.value }))}
              placeholder="ex: rondelle citron, feuille menthe…"
            />
          </div>
        </div>
      </div>

      {/* ACTIONS */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btnPrimary" type="button" onClick={save} disabled={saving}>
          {saving ? "Enregistrement…" : isEdit ? "Mettre à jour" : "Créer le cocktail"}
        </button>
        {isEdit && (
          <button className="btn" type="button" onClick={exportPdf}>
            Exporter PDF
          </button>
        )}
        {saveOk && <span style={{ color: "green", fontWeight: 600 }}>✓ Enregistré</span>}
        {saveError && (
          <div className="errorBox" style={{ marginTop: 0 }}>
            {saveError.message}{saveError.details ? ` — ${saveError.details}` : ""}
          </div>
        )}
      </div>
    </main>
  );
}

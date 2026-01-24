"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { calculerPate } from "@/lib/pateEngine";
import { TopNav } from "@/components/TopNav";
import PercentStepper from "@/components/PercentStepper";
import NumberStepper from "@/components/NumberStepper";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
type DoughType = "direct" | "biga" | "focaccia";
type FlourMixItem = { name: string; percent: number };

type Recipe = {
  id: string;
  name: string;
  type: string;
  hydration_total: number;
  salt_percent: number;
  honey_percent: number | null;
  oil_percent: number | null;
  yeast_percent?: number | null;
  biga_yeast_percent?: number | null;
  flour_mix?: any;
  procedure?: string | null;
  created_at: string;
  user_id: string;
  [key: string]: any;
};

function toNumSafe(v: string, fallback: number) {
  if (v === "" || v === "-" || v === "." || v === "-.") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalize2To100(a: number, b: number) {
  const total = a + b;
  if (!Number.isFinite(total) || total <= 0) return { a: 100, b: 0, total: 100 };
  if (Math.abs(total - 100) < 1e-9) return { a, b, total: 100 };
  const aNorm = Math.round((a / total) * 100);
  const bNorm = 100 - aNorm;
  return { a: aNorm, b: bNorm, total: 100 };
}

export default function RecipePage() {
  const params = useParams();
  const id = (params?.id as string) || "";
  const router = useRouter();
  const [state, setState] = useState<{
    status: "loading" | "NOT_LOGGED" | "OK" | "ERROR";
    recipe?: Recipe;
    error?: any;
  }>({ status: "loading" });

  // PROD INPUTS (modifiables via steppers)
  const [nbPatons, setNbPatons] = useState<number>(150);
  const [poidsPaton, setPoidsPaton] = useState<number>(264);

  // FORM (strings pour éviter crash en saisie)
  const [form, setForm] = useState<{
    name: string;
    type: DoughType;
    hydration_total: string;
    salt_percent: string;
    honey_percent: string;
    oil_percent: string;
    yeast_ui: string;

    flourA_name: string;
    flourA_percent: string;
    flourB_name: string;
    flourB_percent: string;

    // ✅ nouveau champ
    procedure: string;
  } | null>(null);

  const [saveState, setSaveState] = useState<{ saving: boolean; error?: any; ok?: boolean }>({
    saving: false,
  });

  const [pdfState, setPdfState] = useState<{ exporting: boolean; error?: any; ok?: boolean }>({
    exporting: false,
  });

  // PARSING (toujours appelé)
  const parsed = useMemo(() => {
    const hydration = clamp(toNumSafe(form?.hydration_total ?? "", 65), 0, 120);
    const salt = clamp(toNumSafe(form?.salt_percent ?? "", 2), 0, 10);
    const honey = clamp(toNumSafe(form?.honey_percent ?? "", 0), 0, 20);
    const oil = clamp(toNumSafe(form?.oil_percent ?? "", 0), 0, 20);
    const yeastUi = clamp(toNumSafe(form?.yeast_ui ?? "", 0), 0, 10);

    const aPctRaw = clamp(toNumSafe(form?.flourA_percent ?? "", 80), 0, 100);
    const bPctRaw = clamp(toNumSafe(form?.flourB_percent ?? "", 20), 0, 100);
    const norm = normalize2To100(aPctRaw, bPctRaw);

    const flourMix: FlourMixItem[] = [
      { name: (form?.flourA_name ?? "").trim() || "Farine A", percent: norm.a },
      { name: (form?.flourB_name ?? "").trim() || "Farine B", percent: norm.b },
    ];

    return {
      hydration,
      salt,
      honey,
      oil,
      yeastUi,
      flourMix,
      flourMixTotalRaw: aPctRaw + bPctRaw,
      flourMixNorm: norm,
    };
  }, [
    form?.hydration_total,
    form?.salt_percent,
    form?.honey_percent,
    form?.oil_percent,
    form?.yeast_ui,
    form?.flourA_name,
    form?.flourA_percent,
    form?.flourB_name,
    form?.flourB_percent,
  ]);

  const isBiga = (form?.type ?? "direct") === "biga";

  // CALCUL (toujours appelé)
  const result = useMemo(() => {
    if (!form) {
      return {
        totals: { flour_total_g: 0, water_g: 0, salt_g: 0, honey_g: 0, oil_g: 0, yeast_g: 0 },
        phases: [],
        warnings: [],
      } as any;
    }

    return calculerPate({
      type: (form.type ?? "direct") as any,
      nbPatons,
      poidsPaton,
      recipe: isBiga
        ? {
            hydration_total: parsed.hydration,
            salt_percent: parsed.salt,
            honey_percent: parsed.honey,
            oil_percent: parsed.oil,
            biga_yeast_percent: parsed.yeastUi,
            yeast_percent: 0,
          }
        : {
            hydration_total: parsed.hydration,
            salt_percent: parsed.salt,
            honey_percent: parsed.honey,
            oil_percent: parsed.oil,
            yeast_percent: parsed.yeastUi,
            biga_yeast_percent: 0,
          },
      flourMix: parsed.flourMix,
    });
  }, [
    form,
    form?.type,
    nbPatons,
    poidsPaton,
    isBiga,
    parsed.hydration,
    parsed.salt,
    parsed.honey,
    parsed.oil,
    parsed.yeastUi,
    parsed.flourMix,
  ]);

  // LOAD
  useEffect(() => {
    const run = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setState({ status: "NOT_LOGGED" });
        return;
      }

      if (!id || !isUuid(id)) {
  setState({
    status: "ERROR",
    error: { message: "ID invalide (UUID attendu)" },
  });
  return;
}

            const { data: recipe, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        setState({ status: "ERROR", error });
        return;
      }

      if (!recipe) {
        setState({
          status: "ERROR",
          error: { message: "Empâtement introuvable" },
        });
        return;
      }
      const rr = recipe as Recipe;

      const mix = Array.isArray(rr.flour_mix) ? rr.flour_mix : [];
      const a = mix[0] ?? { name: "Tipo 00", percent: 80 };
      const b = mix[1] ?? { name: "Tipo 1", percent: 20 };

      const type: DoughType =
        rr.type === "direct" || rr.type === "biga" || rr.type === "focaccia" ? (rr.type as DoughType) : "direct";

      const yeastUi =
        type === "biga"
          ? String((rr as any).biga_yeast_percent ?? 0)
          : String((rr as any).yeast_percent ?? 0);

      setForm({
        name: String(rr.name ?? ""),
        type,
        hydration_total: String(rr.hydration_total ?? 65),
        salt_percent: String(rr.salt_percent ?? 2),
        honey_percent: String(rr.honey_percent ?? 0),
        oil_percent: String(rr.oil_percent ?? 0),
        yeast_ui: yeastUi,
        flourA_name: String(a.name ?? "Tipo 00"),
        flourA_percent: String(a.percent ?? 80),
        flourB_name: String(b.name ?? "Tipo 1"),
        flourB_percent: String(b.percent ?? 20),

        // ✅ procedure depuis DB
        procedure: String(rr.procedure ?? ""),
      });

      setState({ status: "OK", recipe: rr });
    };

    run();
    }, [id, router]);
  // SAVE
  const saveRecipe = async () => {
    if (!form?.name || !form.name.trim()) {
      setSaveState({
        saving: false,
        error: { message: "Le nom de l’empâtement est obligatoire" },
      });
      return;
    }

    setSaveState({ saving: true, error: null, ok: false });

    const hydration = clamp(toNumSafe(form.hydration_total, 65), 0, 120);
    const salt = clamp(toNumSafe(form.salt_percent, 2), 0, 10);
    const honey = clamp(toNumSafe(form.honey_percent, 0), 0, 20);
    const oil = clamp(toNumSafe(form.oil_percent, 0), 0, 20);
    const yeastUi = clamp(toNumSafe(form.yeast_ui, 0), 0, 10);

    const aPctRaw = clamp(toNumSafe(form.flourA_percent, 80), 0, 100);
    const bPctRaw = clamp(toNumSafe(form.flourB_percent, 20), 0, 100);
    const norm = normalize2To100(aPctRaw, bPctRaw);

    const flour_mix: FlourMixItem[] = [
      { name: form.flourA_name.trim() || "Farine A", percent: norm.a },
      { name: form.flourB_name.trim() || "Farine B", percent: norm.b },
    ];

    const payload: any = {
      name: (form.name ?? "").trim() || "Sans nom",
      type: form.type,

      hydration_total: hydration,
      salt_percent: salt,
      honey_percent: honey,
      oil_percent: oil,

      flour_mix,

      // 🔴 OBLIGATOIRE (DB NOT NULL)
      balls_count: nbPatons,
      ball_weight: poidsPaton,

      // ✅ nouveau champ
      procedure: (form.procedure ?? "").toString(),
    };

    if (form.type === "biga") {
      payload.biga_yeast_percent = yeastUi;
      payload.yeast_percent = 0;
    } else {
      payload.yeast_percent = yeastUi;
      payload.biga_yeast_percent = 0;
    }

    const { error } = await supabase.from("recipes").update(payload).eq("id", id);
    if (error) {
      setSaveState({ saving: false, error });
      return;
    }

    setSaveState({ saving: false, ok: true });
    setTimeout(() => setSaveState((p) => ({ ...p, ok: false })), 1200);
  };

  // EXPORT PDF
  const exportPdf = async () => {
    try {
      if (!id) return;
      setPdfState({ exporting: true, error: null, ok: false });

      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);

      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Session invalide (token manquant)");

      const res = await fetch("/api/recipes/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipeId: id,
          nbPatons,
          poidsPaton,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt ? `HTTP ${res.status} — ${txt}` : `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || `empatement-${id}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);

      setPdfState({ exporting: false, ok: true });
      setTimeout(() => setPdfState((p) => ({ ...p, ok: false })), 900);
    } catch (e: any) {
      setPdfState({
        exporting: false,
        error: { message: "Export PDF impossible", details: String(e?.message ?? e) },
      });
    }
  };

  // UI STATES
  if (state.status === "loading") {
    return (
      <main className="container">
        <TopNav title="Empâtement" subtitle="Chargement…" backHref="/recipes" backLabel="Liste empâtements" />
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  if (state.status === "NOT_LOGGED") {
    return (
      <main className="container">
        <TopNav title="Empâtement" subtitle="Connexion requise" />
        <p className="muted">NOT_LOGGED</p>
      </main>
    );
  }

  if (state.status === "ERROR") {
    return (
      <main className="container">
        <TopNav title="Empâtement" subtitle="Erreur" backHref="/recipes" backLabel="Liste empâtements" />
        <pre className="code">{JSON.stringify(state.error, null, 2)}</pre>
      </main>
    );
  }

  const r = state.recipe!;
  if (!form) {
    return (
      <main className="container">
        <TopNav title={r?.name ?? "Empâtement"} subtitle="Chargement…" backHref="/recipes" backLabel="Liste empâtements" />
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  return (
    <main className="container">
      <TopNav
        title={r.name}
        subtitle={`${form.type} • créée le ${new Date(r.created_at).toLocaleString()}`}
        backHref="/recipes"
        backLabel="Liste empâtements"
        right={
          <>
            <button className="btn btnPrimary" type="button" onClick={saveRecipe} disabled={saveState.saving || pdfState.exporting}>
              {saveState.saving ? "Sauvegarde…" : saveState.ok ? "OK" : "Sauvegarder"}
            </button>

            <button className="btn" type="button" onClick={exportPdf} disabled={saveState.saving || pdfState.exporting}>
              {pdfState.exporting ? "PDF…" : pdfState.ok ? "OK" : "Télécharger (PDF)"}
            </button>
          </>
        }
      />

      {/* N. pâtons + grammage */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "end" }}>
        <NumberStepper label="N. pâtons" value={nbPatons} onChange={(n) => setNbPatons(Math.max(1, n))} step={1} min={1} max={5000} />
        <NumberStepper label="Grammage pâton" value={poidsPaton} onChange={(n) => setPoidsPaton(Math.max(1, n))} step={1} min={1} max={2000} suffix="g" />
      </div>

      {/* Nom */}
      <div style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 6 }}>
          Nom de l’empâtement
        </div>
        <input
          className="input"
          value={form.name ?? ""}
          onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))}
          placeholder="Ex : Biga hiver 65%"
          style={{ fontSize: 17, fontWeight: 600, color: "#ffffff" }}
        />
      </div>

      {/* ✅ Procédure */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 8 }}>
          Procédure (protocole)
        </div>

        <textarea
          className="input"
          value={form.procedure ?? ""}
          onChange={(e) => setForm((p) => (p ? { ...p, procedure: e.target.value } : p))}
          placeholder="Ex : Eau froide 4°C. Mettre farine + eau au pétrin vitesse 1 (3 min), puis sel, puis vitesse 2 (6 min)…"
          rows={6}
          style={{ resize: "vertical", lineHeight: 1.35 }}
        />
        <p className="muted" style={{ marginTop: 8 }}>
          Conseil : court, actionnable, 6–10 lignes max.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        {saveState.error ? (
          <pre className="code" style={{ marginTop: 10 }}>
            {JSON.stringify(saveState.error, null, 2)}
          </pre>
        ) : null}

        {pdfState.error ? (
          <pre className="code" style={{ marginTop: 10 }}>
            {JSON.stringify(pdfState.error, null, 2)}
          </pre>
        ) : null}

        {/* TYPE */}
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            Type
          </div>
          <select className="input" value={form.type ?? "direct"} onChange={(e) => setForm((p) => (p ? { ...p, type: e.target.value as DoughType } : p))}>
            <option value="direct">direct</option>
            <option value="biga">biga</option>
            <option value="focaccia">focaccia</option>
          </select>
        </div>

        {/* POURCENTAGES */}
        <div style={{ marginTop: 12 }}>
          <PercentStepper label="Hydratation" value={form.hydration_total ?? ""} onChange={(v) => setForm((p) => (p ? { ...p, hydration_total: v } : p))} step={0.5} min={0} max={120} suffix="%" />
          <PercentStepper label="Sel" value={form.salt_percent ?? ""} onChange={(v) => setForm((p) => (p ? { ...p, salt_percent: v } : p))} step={0.1} min={0} max={10} suffix="%" />
          <PercentStepper label="Miel" value={form.honey_percent ?? ""} onChange={(v) => setForm((p) => (p ? { ...p, honey_percent: v } : p))} step={0.1} min={0} max={20} suffix="%" />
          <PercentStepper label="Huile" value={form.oil_percent ?? ""} onChange={(v) => setForm((p) => (p ? { ...p, oil_percent: v } : p))} step={0.1} min={0} max={20} suffix="%" />
          <PercentStepper label={isBiga ? "Levure (phase 2)" : "Levure"} value={form.yeast_ui ?? ""} onChange={(v) => setForm((p) => (p ? { ...p, yeast_ui: v } : p))} step={0.05} min={0} max={10} suffix="%" />
        </div>

        {/* MIX FARINES */}
        <div style={{ marginTop: 14 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            Mix farines (2)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 260px 1.2fr 260px", gap: 12, alignItems: "center" }}>
            <input className="input" value={form.flourA_name ?? ""} onChange={(e) => setForm((p) => (p ? { ...p, flourA_name: e.target.value } : p))} placeholder="Nom farine A" />
            <NumberStepper value={clamp(toNumSafe(form.flourA_percent ?? "", 80), 0, 100)} onChange={(n) => setForm((p) => (p ? { ...p, flourA_percent: String(n) } : p))} step={1} min={0} max={100} suffix="%" />

            <input className="input" value={form.flourB_name ?? ""} onChange={(e) => setForm((p) => (p ? { ...p, flourB_name: e.target.value } : p))} placeholder="Nom farine B" />
            <NumberStepper value={clamp(toNumSafe(form.flourB_percent ?? "", 20), 0, 100)} onChange={(n) => setForm((p) => (p ? { ...p, flourB_percent: String(n) } : p))} step={1} min={0} max={100} suffix="%" />
          </div>

          <p className="muted" style={{ marginTop: 8 }}>
            Total saisi : {Math.round(parsed.flourMixTotalRaw * 100) / 100}% • Total utilisé : {parsed.flourMixNorm.total}%
          </p>
        </div>
      </div>

      {/* DIRECT/FOCACCIA */}
      {!isBiga && (
        <div style={{ marginTop: 20 }}>
          <h2 className="h2">Quantités</h2>

          {result.warnings?.length > 0 && <pre className="code">{JSON.stringify(result.warnings, null, 2)}</pre>}

          <div className="kv" style={{ marginTop: 10 }}>
            <div className="kvItem">
              <span className="kvKey">Farine</span>
              <span className="kvVal">{result.totals.flour_total_g} g</span>
            </div>
            <div className="kvItem">
              <span className="kvKey">Eau</span>
              <span className="kvVal">{result.totals.water_g} g</span>
            </div>
            <div className="kvItem">
              <span className="kvKey">Sel</span>
              <span className="kvVal">{result.totals.salt_g} g</span>
            </div>
            <div className="kvItem">
              <span className="kvKey">Miel</span>
              <span className="kvVal">{result.totals.honey_g} g</span>
            </div>
            <div className="kvItem">
              <span className="kvKey">Huile</span>
              <span className="kvVal">{result.totals.oil_g} g</span>
            </div>
            <div className="kvItem">
              <span className="kvKey">Levure</span>
              <span className="kvVal">{result.totals.yeast_g} g</span>
            </div>
          </div>
        </div>
      )}

      {/* BIGA */}
      {isBiga && (
        <div style={{ marginTop: 20 }}>
          <h2 className="h2">Phases</h2>

          {result.warnings?.length > 0 && <pre className="code">{JSON.stringify(result.warnings, null, 2)}</pre>}

          {Array.isArray(result.phases) && result.phases.length > 0 ? (
            <div className="grid" style={{ marginTop: 10 }}>
              {result.phases.map((p: any, idx: number) => (
                <div key={idx} className="card">
                  <p className="cardTitle">{p.name}</p>

                  <div className="kv" style={{ marginTop: 10 }}>
                    <div className="kvItem">
                      <span className="kvKey">Farine</span>
                      <span className="kvVal">{p.flour_g} g</span>
                    </div>
                    <div className="kvItem">
                      <span className="kvKey">Eau</span>
                      <span className="kvVal">{p.water_g} g</span>
                    </div>

                    {p.yeast_g > 0 && (
                      <div className="kvItem">
                        <span className="kvKey">Levure</span>
                        <span className="kvVal">{p.yeast_g} g</span>
                      </div>
                    )}

                    {p.salt_g > 0 && (
                      <div className="kvItem">
                        <span className="kvKey">Sel</span>
                        <span className="kvVal">{p.salt_g} g</span>
                      </div>
                    )}

                    {p.honey_g > 0 && (
                      <div className="kvItem">
                        <span className="kvKey">Miel</span>
                        <span className="kvVal">{p.honey_g} g</span>
                      </div>
                    )}

                    {p.oil_g > 0 && (
                      <div className="kvItem">
                        <span className="kvKey">Huile</span>
                        <span className="kvVal">{p.oil_g} g</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ marginTop: 10 }}>
              <p className="muted" style={{ margin: 0 }}>
                Phases non disponibles.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

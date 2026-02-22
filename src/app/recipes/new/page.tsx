"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type DoughType = "direct" | "biga" | "focaccia";
type PgError = { code?: string; message?: string };
type InsertedId = { id: string };

function makeAutoName() {
  const suffix = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `Empâtement ${suffix}`;
}

const defaultProcedure = `Eau : 4°C
Ordre : farine → 80% eau → frasage V1 3 min → ajout sel → V2 6 min → ajout huile 1 min
Température pâte cible : 22–23°C
Pointage : 20 min
Boulage : 264 g
Bac : huilé léger / fermé
Maturation : 24 h à 4°C
Remise T° : 2 h
Cuisson : __`;

export default function NewRecipePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [type, setType] = useState<DoughType>("biga");
  const [ballsCount, setBallsCount] = useState(150);
  const [ballWeight, setBallWeight] = useState(264);
  const [procedure, setProcedure] = useState(defaultProcedure);

  const [state, setState] = useState<{ creating: boolean; error: string | null }>({ creating: false, error: null });

  const canCreate = useMemo(() => {
    return !state.creating && ballsCount > 0 && ballWeight > 0;
  }, [state.creating, ballsCount, ballWeight]);

  const create = async () => {
    if (!canCreate) return;

    try {
      setState({ creating: true, error: null });

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_LOGGED");

      const flour_mix = [
        { name: "Tipo 00", percent: 80 },
        { name: "Tipo 1", percent: 20 },
      ];

      const payload: Record<string, unknown> = {
        name: (name ?? "").trim() || makeAutoName(),
        type,

        hydration_total: 65,
        salt_percent: 2,
        honey_percent: 0,
        oil_percent: 0,
        flour_mix,

        yeast_percent: 0,
        biga_yeast_percent: 0,

        balls_count: Math.max(1, Math.round(ballsCount)),
        ball_weight: Math.max(1, Math.round(ballWeight)),

        procedure: (procedure ?? "").toString(),

        user_id: auth.user.id,
      };

      let { data, error: insertErr } = await supabase.from("recipes").insert(payload).select("id").single<InsertedId>();

      if (insertErr && (insertErr as PgError).code === "23505") {
        const retryPayload: Record<string, unknown> = { ...payload, name: makeAutoName() };
        const retry = await supabase.from("recipes").insert(retryPayload).select("id").single<InsertedId>();
        data = retry.data;
        insertErr = retry.error;
      }

      if (insertErr) throw insertErr;

      const newId = data?.id;
      if (!newId) throw new Error("ID manquant après création");

      router.replace(`/recipes/${newId}`);
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Erreur création";
      setState({ creating: false, error: msg });
    }
  };

  return (
    <main className="container">
      <h1 className="h1">Nouvel empâtement</h1>

      {state.error ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800 }}>Erreur</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {state.error}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 6 }}>
          Nom (optionnel)
        </div>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Biga hiver 65%" style={{ fontSize: 17, fontWeight: 600 }} />
        <div className="muted" style={{ marginTop: 6 }}>
          Si vide : un nom simple sera généré.
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 8 }}>
          Type
        </div>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as DoughType)}>
          <option value="direct">direct</option>
          <option value="biga">biga</option>
          <option value="focaccia">focaccia</option>
        </select>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>
              N. pâtons
            </div>
            <input className="input" inputMode="numeric" value={String(ballsCount)} onChange={(e) => setBallsCount(Number(e.target.value || 0))} />
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>
              Grammage pâton (g)
            </div>
            <input className="input" inputMode="numeric" value={String(ballWeight)} onChange={(e) => setBallWeight(Number(e.target.value || 0))} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 8 }}>
          Procédure (protocole)
        </div>
        <textarea className="input" value={procedure} onChange={(e) => setProcedure(e.target.value)} rows={6} style={{ resize: "vertical", lineHeight: 1.35 }} />
        <p className="muted" style={{ marginTop: 8 }}>
          Conseil : court, actionnable, 6–10 lignes max.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn" type="button" onClick={() => router.replace("/recipes")} disabled={state.creating}>
          Retour liste empâtements
        </button>

        <button className="btn btnPrimary" type="button" onClick={create} disabled={!canCreate}>
          {state.creating ? "Création…" : "Créer"}
        </button>
      </div>
    </main>
  );
}
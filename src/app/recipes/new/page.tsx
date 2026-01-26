"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type DoughType = "direct" | "biga" | "focaccia";

function makeAutoName() {
  const now = new Date();
  const d = now.toLocaleDateString("fr-FR");
  const t = now.toLocaleTimeString("fr-FR").slice(0, 5).replace(":", "h");
  const suffix = Math.random().toString(16).slice(2, 6).toUpperCase(); // 4 chars
  return `Empâtement ${d} ${t} ${suffix}`;
}

export default function NewRecipePage() {
  const router = useRouter();

  const didRunRef = useRef(false);
  const [state, setState] = useState<{
    status: "CREATING" | "ERROR";
    error?: any;
    createdId?: string;
  }>({ status: "CREATING" });

  useEffect(() => {
    // IMPORTANT: en dev, React Strict Mode peut exécuter l'effet 2 fois.
    // Ce guard empêche le double insert + navigation bancale.
    if (didRunRef.current) return;
    didRunRef.current = true;

    const run = async () => {
      try {
        setState({ status: "CREATING" });

        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("NOT_LOGGED");

        const flour_mix = [
          { name: "Tipo 00", percent: 80 },
          { name: "Tipo 1", percent: 20 },
        ];

        const type: DoughType = "biga";

        const defaultProcedure = `Eau : 4°C
Ordre : farine → 80% eau → frasage V1 3 min → ajout sel → V2 6 min → ajout huile 1 min
Température pâte cible : 22–23°C
Pointage : 20 min
Boulage : 264 g
Bac : huilé léger / fermé
Maturation : 24 h à 4°C
Remise T° : 2 h
Cuisson : __`;

        const basePayload: any = {
          // IMPORTANT : nom unique (contrainte DB)
          name: makeAutoName(),
          type,

          hydration_total: 65,
          salt_percent: 2,
          honey_percent: 0,
          oil_percent: 0,
          flour_mix,

          // DB yeast_percent NOT NULL
          yeast_percent: 0,
          biga_yeast_percent: 0,

          // DB NOT NULL
          balls_count: 150,
          ball_weight: 264,

          // DB procedure NOT NULL (si tu as appliqué le SQL)
          procedure: defaultProcedure,

          // Si la colonne existe
          user_id: auth.user.id,
        };

        // 1er essai
        let { data, error: insertErr } = await supabase.from("recipes").insert(basePayload).select("id").single();

        // Si collision unique -> 2e essai avec un autre nom
        if (insertErr && (insertErr as any).code === "23505") {
          const retryPayload = { ...basePayload, name: makeAutoName() };
          const retry = await supabase.from("recipes").insert(retryPayload).select("id").single();
          data = retry.data;
          insertErr = retry.error;
        }

        if (insertErr) throw insertErr;
        const newId = (data as any)?.id as string | undefined;
        if (!newId) throw new Error("ID manquant après création");

        // stocke l'id (utile si on doit afficher un fallback)
        setState({ status: "CREATING", createdId: newId });

        // Navigation "soft" + fallback "hard" si le routeur ne bouge pas
        router.replace(`/recipes/${newId}`);
        router.refresh();

        // Fallback: si après 800ms on est toujours là, on force la navigation.
        window.setTimeout(() => {
          // Si on est encore sur /recipes/new, on force.
          if (window.location.pathname.includes("/recipes/new")) {
            window.location.assign(`/recipes/${newId}`);
          }
        }, 800);
      } catch (e: any) {
        setState({
          status: "ERROR",
          error: { message: e?.message ?? "Erreur création", details: e },
        });
      }
    };

    run();
  }, [router]);

  if (state.status === "CREATING") {
    return (
      <main className="container">
        <p className="muted">Création de l’empâtement…</p>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            Recharger
          </button>
          <button className="btn" type="button" onClick={() => router.replace("/recipes")}>
            Retour liste empâtements
          </button>
          {state.createdId ? (
            <button className="btn btnPrimary" type="button" onClick={() => window.location.assign(`/recipes/${state.createdId}`)}>
              Ouvrir l’empâtement
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <h1 className="h1">Erreur</h1>
      <pre className="code">{JSON.stringify(state.error ?? {}, null, 2)}</pre>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button className="btn" type="button" onClick={() => router.replace("/recipes")}>
          Retour liste empâtements
        </button>
        <button className="btn" type="button" onClick={() => window.location.reload()}>
          Recharger
        </button>
      </div>
    </main>
  );
}
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Ingredient = { id: string; name: string };

function makeAutoName() {
  const now = new Date();
  const d = now.toLocaleDateString("fr-FR");
  const t = now.toLocaleTimeString("fr-FR").slice(0, 5).replace(":", "h");
  const suffix = Math.random().toString(16).slice(2, 6).toUpperCase(); // 4 chars
  return `Recette pivot ${d} ${t} ${suffix}`;
}

export default function NewPrepRecipePage() {
  const router = useRouter();
  const didRun = useRef(false);

  const [state, setState] = useState<{
    status: "loading" | "CREATING" | "ERROR";
    error?: any;
  }>({ status: "loading" });

  useEffect(() => {
    // Anti double-run (React Strict Mode en dev)
    if (didRun.current) return;
    didRun.current = true;

    const run = async () => {
      try {
        setState({ status: "CREATING" });

        // 1) Auth
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("NOT_LOGGED");

        // 2) Choisir un pivot par défaut : 1er ingrédient actif (ordre alphabétique)
        const { data: ing, error: eIng } = await supabase
          .from("ingredients")
          .select("id,name")
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(1);

        if (eIng) throw eIng;

        const first = (ing?.[0] as Ingredient | undefined) ?? null;
        if (!first?.id) throw new Error("Aucun ingrédient actif. Ajoute au moins 1 ingrédient dans l’index.");

        // 3) Créer la recette pivot (valeurs par défaut)
        const basePayload: any = {
          name: makeAutoName(), // évite les collisions si contrainte unique
          pivot_ingredient_id: first.id,
          pivot_unit: "g",
        };

        let { data, error: eIns } = await supabase.from("prep_recipes").insert(basePayload).select("id").single();

        // Si collision unique -> 2e essai avec un autre nom
        if (eIns && (eIns as any).code === "23505") {
          const retryPayload = { ...basePayload, name: makeAutoName() };
          const retry = await supabase.from("prep_recipes").insert(retryPayload).select("id").single();
          data = retry.data as any;
          eIns = retry.error as any;
        }

        if (eIns) throw eIns;
        if (!data?.id) throw new Error("ID manquant après création");

        const url = `/prep/${data.id}`;

        // 4) Redirection fiable
        router.replace(url);
        router.refresh();

        // Fallback hard si Turbopack/route transition bloque (rare mais réel)
        setTimeout(() => {
          if (typeof window !== "undefined" && window.location?.pathname !== url) {
            window.location.href = url;
          }
        }, 400);
      } catch (e: any) {
        setState({
          status: "ERROR",
          error: { message: e?.message ?? "Erreur création", details: e },
        });
      }
    };

    run();
  }, [router]);

  if (state.status === "ERROR") {
    return (
      <main className="container">
        <h1 className="h1">Erreur</h1>
        <pre className="code">{JSON.stringify(state.error ?? {}, null, 2)}</pre>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            Réessayer
          </button>
          <button className="btn" type="button" onClick={() => router.replace("/prep")}>
            Retour
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <p className="muted">{state.status === "CREATING" ? "Création de la recette pivot…" : "Chargement…"}</p>
    </main>
  );
}
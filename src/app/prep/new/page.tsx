"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Ingredient = { id: string };
type PgError = { code?: string; message?: string };
type InsertedId = { id: string };

function makeAutoName() {
  const now = new Date();
  const d = now.toLocaleDateString("fr-FR");
  const t = now.toLocaleTimeString("fr-FR").slice(0, 5).replace(":", "h");
  const suffix = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `Recette pivot ${d} ${t} ${suffix}`;
}

export default function NewPrepRecipePage() {
  const router = useRouter();
  const didRun = useRef(false);

  const [state, setState] = useState<{
    status: "CREATING" | "ERROR";
    error?: unknown;
  }>({ status: "CREATING" });

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const run = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("NOT_LOGGED");

        const { data: ing, error: eIng } = await supabase
          .from("ingredients")
          .select("id")
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(1);

        if (eIng) throw eIng;

        const first = (ing?.[0] as Ingredient | undefined) ?? null;
        if (!first?.id) throw new Error("Aucun ingrédient actif. Ajoute au moins 1 ingrédient dans l’index.");

        const basePayload: Record<string, unknown> = {
          name: "",
          pivot_ingredient_id: first.id,
          pivot_unit: "g",
        };

        let { data, error: eIns } = await supabase
          .from("prep_recipes")
          .insert(basePayload)
          .select("id")
          .single<InsertedId>();

        if (eIns && (eIns as PgError).code === "23505") {
          const retryPayload: Record<string, unknown> = { ...basePayload, name: makeAutoName() };
          const retry = await supabase
            .from("prep_recipes")
            .insert(retryPayload)
            .select("id")
            .single<InsertedId>();
          data = retry.data;
          eIns = retry.error;
        }

        if (eIns) throw eIns;
        if (!data?.id) throw new Error("ID manquant après création");

        const url = `/prep/${data.id}`;
        router.replace(url);
        router.refresh();

        setTimeout(() => {
          if (typeof window !== "undefined" && window.location?.pathname !== url) {
            window.location.href = url;
          }
        }, 200);
      } catch (e: unknown) {
        setState({ status: "ERROR", error: e });
      }
    };

    void run();
  }, [router]);

  if (state.status === "ERROR") {
    const msg =
      state.error instanceof Error
        ? state.error.message
        : typeof state.error === "string"
          ? state.error
          : "Erreur création";

    return (
      <main className="container">
        <h1 className="h1">Erreur</h1>
        <p className="muted">{msg}</p>
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
      <p className="muted">Création…</p>
    </main>
  );
}
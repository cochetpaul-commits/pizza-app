"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type PgError = { code?: string; message?: string };
type InsertedId = { id: string };

function makeAutoName() {
  const now = new Date();
  return `Empâtement ${now.toLocaleDateString("fr-FR")} ${now.toLocaleTimeString("fr-FR").slice(0, 5)}`;
}

export default function NewRecipePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const create = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("NOT_LOGGED");

        const payload = {
          name: makeAutoName(),
          type: "biga",
          hydration_total: 65,
          salt_percent: 2,
          honey_percent: 0,
          oil_percent: 0,
          flour_mix: [
            { name: "Tipo 00", percent: 80, ingredient_id: null },
            { name: "Tipo 1", percent: 20, ingredient_id: null },
          ],
          yeast_percent: 0,
          biga_yeast_percent: 0,
          user_id: auth.user.id,
        };

        const { data, error: insertErr } = await supabase
          .from("recipes")
          .insert(payload)
          .select("id")
          .single<InsertedId>();

        if (insertErr) throw insertErr;
        if (!data?.id) throw new Error("ID manquant après création");

        router.replace(`/recipes/${data.id}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : (e as PgError)?.message ?? "Erreur création";
        setError(msg);
      }
    };

    create();
  }, [router]);

  if (error) {
    return (
      <main className="container">
        <p className="muted">Erreur : {error}</p>
      </main>
    );
  }

  return (
    <main className="container">
      <p className="muted">Création en cours…</p>
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";

export default function NewPrepRecipePage() {
  const router = useRouter();
  const didRun = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const run = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("NOT_LOGGED");

        const { data, error: eIns } = await supabase
          .from("prep_recipes")
          .insert({ name: "", pivot_unit: "g" })
          .select("id")
          .single();

        if (eIns) throw eIns;
        const newId = (data as { id: string }).id;
        router.replace(`/prep/${newId}`);
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : "Erreur création");
      }
    };

    void run();
  }, [router]);

  if (errorMsg) {
    return (
      <main className="container">
        <TopNav title="Nouvelle recette pivot" backHref="/prep" backLabel="Retour" />
        <p className="muted" style={{ marginTop: 12 }}>{errorMsg}</p>
      </main>
    );
  }

  return (
    <main className="container">
      <TopNav title="Nouvelle recette pivot" backHref="/prep" backLabel="Retour" />
      <p className="muted" style={{ marginTop: 12 }}>Création…</p>
    </main>
  );
}

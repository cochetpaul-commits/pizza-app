"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type FlourMixItem = { name: string; percent: number };
type DoughType = "direct" | "biga" | "focaccia";

export default function NewRecipePage() {
  const router = useRouter();

  const [state, setState] = useState<{
    status: "loading" | "NOT_LOGGED" | "CREATING" | "ERROR";
    error?: any;
  }>({ status: "loading" });

  // IMPORTANT: évite double création en dev (React StrictMode)
  const createdOnceRef = useRef(false);

  useEffect(() => {
    const run = async () => {
      // 1) Auth
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setState({ status: "NOT_LOGGED" });
        return;
      }

      // 2) Anti double-run
      if (createdOnceRef.current) return;
      createdOnceRef.current = true;

      setState({ status: "CREATING" });

      try {
        // 3) Payload par défaut (brouillon)
        const flour_mix: FlourMixItem[] = [
          { name: "Tipo 00", percent: 80 },
          { name: "Tipo 1", percent: 20 },
        ];

        const type: DoughType = "biga";

        const payload: any = {
          name: "Sans nom",
          type,
          hydration_total: 65,
          salt_percent: 2,
          honey_percent: 0,
          oil_percent: 0,
          flour_mix,
          // DB yeast_percent NOT NULL => toujours une valeur
          yeast_percent: 0,
          biga_yeast_percent: 0,
        };

        // 4) Create
        const { data, error: insertErr } = await supabase
          .from("recipes")
          .insert(payload)
          .select("id")
          .single();

        if (insertErr) throw insertErr;
        if (!data?.id) throw new Error("ID manquant après création");

        // 5) Redirection DIRECTE vers la fiche (ta page photo)
        router.replace(`/recipes/${data.id}`);
        router.refresh();
      } catch (e: any) {
        setState({
          status: "ERROR",
          error: { message: e?.message ?? "Erreur création", details: e },
        });
      }
    };

    run();
  }, [router]);

  if (state.status === "loading" || state.status === "CREATING") {
    return (
      <main className="container">
        <p className="muted">
          {state.status === "CREATING" ? "Création de l’empâtement…" : "Chargement…"}
        </p>
      </main>
    );
  }

  if (state.status === "NOT_LOGGED") {
    return (
      <main className="container">
        <p className="muted">NOT_LOGGED</p>
        <Link className="btn btnPrimary" href="/login">
          Aller sur /login
        </Link>
      </main>
    );
  }

  return (
    <main className="container">
      <p className="muted">Erreur</p>
      <pre className="code">{JSON.stringify(state.error, null, 2)}</pre>
      <Link className="btn" href="/recipes">
        Retour liste empâtements
      </Link>
    </main>
  );
}
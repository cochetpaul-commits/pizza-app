"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";

type Props = {
  recipeType: "pizza" | "cuisine" | "cocktail" | "empatement";
  recipeId: string;
};

export function PublishCatalogueButton({ recipeType, recipeId }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handlePublish() {
    setLoading(true);
    setDone(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { alert("Non authentifi\u00e9"); return; }

      const res = await fetchApi("/api/catalogue/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipeType, recipeId }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: "Erreur inconnue" }));
        alert(`Erreur : ${e.error}`);
        return;
      }

      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="btn"
      onClick={handlePublish}
      disabled={loading}
      style={{
        fontSize: 12,
        background: done ? "#4a674120" : undefined,
        borderColor: done ? "#4a6741" : undefined,
        color: done ? "#4a6741" : undefined,
      }}
    >
      {loading ? "Publication\u2026" : done ? "Publi\u00e9 \u2713" : "Catalogue"}
    </button>
  );
}

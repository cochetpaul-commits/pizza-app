"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { Carte, type VueCarte } from "@/components/carte/Carte";

const VUES: VueCarte[] = ["articles", "fiches", "preparations"];

function Inner() {
  const sp = useSearchParams();
  const vue = sp.get("vue");
  return <Carte vueInitiale={VUES.includes(vue as VueCarte) ? (vue as VueCarte) : null} />;
}

export default function CartePage() {
  return (
    <RequireRole permission="operations.recettes">
      <Suspense fallback={<div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement…</div>}>
        <Inner />
      </Suspense>
    </RequireRole>
  );
}

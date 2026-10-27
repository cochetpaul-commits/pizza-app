"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { Cave } from "@/components/cave/Cave";

function Inner() {
  const vue = useSearchParams().get("vue");
  return <Cave vueInitiale={vue === "cave" ? "cave" : "service"} />;
}

export default function CavePage() {
  return (
    <RequireRole permission="operations.recettes">
      <Suspense fallback={<div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement…</div>}>
        <Inner />
      </Suspense>
    </RequireRole>
  );
}

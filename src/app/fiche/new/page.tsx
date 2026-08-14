"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import FicheWizard from "@/components/fiche/FicheWizard";
import { RequireRole } from "@/components/RequireRole";

function Inner() {
  const sp = useSearchParams();
  return (
    <FicheWizard
      initialCategorie={sp.get("cat") ?? undefined}
      initialSousCategorie={sp.get("sub") ?? undefined}
    />
  );
}

export default function NewFichePage() {
  return (
    <RequireRole permission="operations.edit_recettes">
      <Suspense fallback={<div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement...</div>}>
        <Inner />
      </Suspense>
    </RequireRole>
  );
}

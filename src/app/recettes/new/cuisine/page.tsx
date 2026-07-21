"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import CuisineFormV2 from "@/components/v2/CuisineFormV2";
import { RequireRole } from "@/components/RequireRole";

function Inner() {
  const params = useSearchParams();
  const initialCategory = params.get("category") ?? undefined;
  const initialFicheType = params.get("ficheType") ?? undefined;
  return <CuisineFormV2 initialCategory={initialCategory} initialFicheType={initialFicheType} />;
}

export default function NewCuisineV2Page() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#999" }}>Chargement...</div>}>
        <Inner />
      </Suspense>
    </RequireRole>
  );
}

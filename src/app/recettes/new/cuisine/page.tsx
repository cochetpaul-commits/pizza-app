"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import CuisineFormV2 from "@/components/v2/CuisineFormV2";

function Inner() {
  const params = useSearchParams();
  const initialCategory = params.get("category") ?? undefined;
  return <CuisineFormV2 initialCategory={initialCategory} />;
}

export default function NewCuisineV2Page() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#999" }}>Chargement...</div>}>
      <Inner />
    </Suspense>
  );
}

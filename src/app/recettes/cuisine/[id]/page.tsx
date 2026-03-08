"use client";

import { use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CuisineFormV2 from "@/components/v2/CuisineFormV2";

function EditCuisineV2Inner({ id }: { id: string }) {
  const sp = useSearchParams();
  return <CuisineFormV2 recipeId={id} initialProdMode={sp.get("mode") === "production"} />;
}

export default function EditCuisineV2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <EditCuisineV2Inner id={id} />
    </Suspense>
  );
}

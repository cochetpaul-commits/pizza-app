"use client";

import { use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CocktailFormV2 from "@/components/v2/CocktailFormV2";

function EditCocktailV2Inner({ id }: { id: string }) {
  const sp = useSearchParams();
  return <CocktailFormV2 cocktailId={id} initialProdMode={sp.get("mode") === "production"} />;
}

export default function EditCocktailV2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <EditCocktailV2Inner id={id} />
    </Suspense>
  );
}

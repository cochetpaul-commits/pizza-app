"use client";

import { use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import EmpatementFormV2 from "@/components/v2/EmpatementFormV2";

function EditEmpatementV2Inner({ id }: { id: string }) {
  const sp = useSearchParams();
  return <EmpatementFormV2 recipeId={id} initialProdMode={sp.get("mode") === "production"} />;
}

export default function EditEmpatementV2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <EditEmpatementV2Inner id={id} />
    </Suspense>
  );
}

"use client";

import { use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PizzaFormV2 from "@/components/v2/PizzaFormV2";

function EditPizzaV2Inner({ id }: { id: string }) {
  const sp = useSearchParams();
  return <PizzaFormV2 pizzaId={id} initialProdMode={sp.get("mode") === "production"} />;
}

export default function EditPizzaV2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <EditPizzaV2Inner id={id} />
    </Suspense>
  );
}

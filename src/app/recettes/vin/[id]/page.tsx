"use client";

import { use, Suspense } from "react";
import WineFormV2 from "@/components/v2/WineFormV2";

function Inner({ id }: { id: string }) {
  return <WineFormV2 wineId={id === "nouveau" ? null : id} />;
}

export default function WinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <Inner id={id} />
    </Suspense>
  );
}

"use client";

import { RequireRole } from "@/components/RequireRole";
import { Doublons } from "@/components/produits/Doublons";

export default function Page() {
  return (
    <RequireRole permission="achats.inventaire">
      <Doublons />
    </RequireRole>
  );
}

"use client";

import { RequireRole } from "@/components/RequireRole";
import { VariationsPrix } from "@/components/achats/VariationsPrix";

export default function VariationsPrixPage() {
  return (
    <RequireRole permission="achats.view">
      <VariationsPrix />
    </RequireRole>
  );
}

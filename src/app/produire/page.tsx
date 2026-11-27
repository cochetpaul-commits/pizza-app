"use client";

import { RequireRole } from "@/components/RequireRole";
import { ProduireListe } from "@/components/carte/ProduireListe";

export default function ProduirePage() {
  return (
    <RequireRole permission="operations.recettes">
      <ProduireListe />
    </RequireRole>
  );
}

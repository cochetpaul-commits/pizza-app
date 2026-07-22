"use client";

import PizzaFormV2 from "@/components/v2/PizzaFormV2";
import { RequireRole } from "@/components/RequireRole";

export default function NewPizzaV2Page() {
  return (
    <RequireRole permission="operations.edit_recettes">
      <PizzaFormV2 />
    </RequireRole>
  );
}

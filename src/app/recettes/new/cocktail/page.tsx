"use client";

import CocktailFormV2 from "@/components/v2/CocktailFormV2";
import { RequireRole } from "@/components/RequireRole";

export default function NewCocktailV2Page() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <CocktailFormV2 />
    </RequireRole>
  );
}

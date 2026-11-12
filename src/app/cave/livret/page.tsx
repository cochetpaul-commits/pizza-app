"use client";

import { RequireRole } from "@/components/RequireRole";
import { LivretVins } from "@/components/cave/LivretVins";

export default function Page() {
  return <RequireRole permission="operations.recettes"><LivretVins /></RequireRole>;
}

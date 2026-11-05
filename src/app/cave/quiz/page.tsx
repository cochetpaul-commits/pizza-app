"use client";

import { RequireRole } from "@/components/RequireRole";
import { QuizVins } from "@/components/cave/QuizVins";

export default function Page() {
  return <RequireRole permission="operations.recettes"><QuizVins /></RequireRole>;
}

"use client";

import { use } from "react";
import FicheWizard from "@/components/fiche/FicheWizard";
import { RequireRole } from "@/components/RequireRole";

export default function EditFichePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole permission="operations.edit_recettes">
      <FicheWizard recipeId={id} />
    </RequireRole>
  );
}

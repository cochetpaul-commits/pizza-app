"use client";

import { use } from "react";
import FicheWizard from "@/components/fiche/FicheWizard";
import { RequireRole } from "@/components/RequireRole";

export default function EditFichePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <FicheWizard recipeId={id} />
    </RequireRole>
  );
}

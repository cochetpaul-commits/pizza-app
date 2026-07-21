"use client";

import FicheWizard from "@/components/fiche/FicheWizard";
import { RequireRole } from "@/components/RequireRole";

export default function NewFichePage() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <FicheWizard />
    </RequireRole>
  );
}

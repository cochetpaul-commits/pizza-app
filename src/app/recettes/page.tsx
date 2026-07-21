"use client";

import { CatalogueContent } from "@/components/production/CatalogueTab";
import { RequireRole } from "@/components/RequireRole";

export default function RecettesPage() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager", "equipier"]}>
      <CatalogueContent />
    </RequireRole>
  );
}

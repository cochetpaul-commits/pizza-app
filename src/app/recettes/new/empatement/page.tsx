"use client";

import EmpatementFormV2 from "@/components/v2/EmpatementFormV2";
import { RequireRole } from "@/components/RequireRole";

export default function NewEmpatementV2Page() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <EmpatementFormV2 />
    </RequireRole>
  );
}

"use client";

import { RequireRole } from "@/components/RequireRole";
import { Evenementiel } from "@/components/evenementiel/Evenementiel";

export default function Page() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <Evenementiel />
    </RequireRole>
  );
}

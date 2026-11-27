"use client";

import { RequireRole } from "@/components/RequireRole";
import { Fidelite } from "@/components/fidelite/Fidelite";

export default function Page() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <Fidelite />
    </RequireRole>
  );
}

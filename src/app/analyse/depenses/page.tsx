"use client";

import { RequireRole } from "@/components/RequireRole";
import { Depenses } from "@/components/analyse/Depenses";

export default function Page() {
  return (
    <RequireRole permission="performances.pilotage">
      <Depenses />
    </RequireRole>
  );
}

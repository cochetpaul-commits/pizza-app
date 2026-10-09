"use client";

import { RequireRole } from "@/components/RequireRole";
import { CaPersonne } from "@/components/analyse/CaPersonne";

export default function Page() {
  return (
    <RequireRole permission="performances.pilotage">
      <CaPersonne />
    </RequireRole>
  );
}

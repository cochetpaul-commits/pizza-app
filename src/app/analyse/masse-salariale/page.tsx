"use client";

import { RequireRole } from "@/components/RequireRole";
import { MasseSalariale } from "@/components/analyse/MasseSalariale";

export default function Page() {
  return (
    <RequireRole permission="performances.pilotage">
      <MasseSalariale />
    </RequireRole>
  );
}

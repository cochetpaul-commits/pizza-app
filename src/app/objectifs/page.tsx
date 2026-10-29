"use client";

import { RequireRole } from "@/components/RequireRole";
import { Objectifs } from "@/components/objectifs/Objectifs";

export default function Page() {
  return (
    <RequireRole permission="performances.pilotage">
      <Objectifs />
    </RequireRole>
  );
}

"use client";

import { RequireRole } from "@/components/RequireRole";
import { Plats } from "@/components/analyse/Plats";

export default function Page() {
  return (
    <RequireRole permission="performances.pilotage">
      <Plats />
    </RequireRole>
  );
}

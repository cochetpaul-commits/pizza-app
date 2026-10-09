"use client";

import { RequireRole } from "@/components/RequireRole";
import { Simulations } from "@/components/analyse/Simulations";

export default function Page() {
  return (
    <RequireRole permission="performances.pilotage">
      <Simulations />
    </RequireRole>
  );
}

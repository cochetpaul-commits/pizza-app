"use client";

import { RequireRole } from "@/components/RequireRole";
import { Marge } from "@/components/analyse/Marge";

export default function Page() {
  return (
    <RequireRole permission="performances.pilotage">
      <Marge />
    </RequireRole>
  );
}

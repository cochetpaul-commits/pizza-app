"use client";

import { RequireRole } from "@/components/RequireRole";
import { Couverts } from "@/components/analyse/Couverts";

export default function Page() {
  return (
    <RequireRole permission="performances.view">
      <Couverts />
    </RequireRole>
  );
}

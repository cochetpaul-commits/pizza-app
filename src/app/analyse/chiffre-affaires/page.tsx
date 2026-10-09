"use client";

import { RequireRole } from "@/components/RequireRole";
import { ChiffreAffaires } from "@/components/analyse/ChiffreAffaires";

export default function Page() {
  return (
    <RequireRole permission="performances.view">
      <ChiffreAffaires />
    </RequireRole>
  );
}

"use client";

import { RequireRole } from "@/components/RequireRole";
import { Cloture } from "@/components/cloture/Cloture";

export default function Page() {
  return (
    <RequireRole permission="caisse.cloture">
      <Cloture />
    </RequireRole>
  );
}

"use client";

import { RequireRole } from "@/components/RequireRole";
import { Empatements } from "@/components/empatements/Empatements";

export default function EmpatementsPage() {
  return (
    <RequireRole permission="operations.recettes">
      <Empatements />
    </RequireRole>
  );
}

"use client";

import EmpatementFormV2 from "@/components/v2/EmpatementFormV2";
import { RequireRole } from "@/components/RequireRole";

export default function NewEmpatementV2Page() {
  return (
    <RequireRole permission="operations.edit_recettes">
      <EmpatementFormV2 />
    </RequireRole>
  );
}

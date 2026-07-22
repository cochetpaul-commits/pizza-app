"use client";

import { RequireRole } from "@/components/RequireRole";
import { StatsAchatsContent } from "@/components/achats/StatsAchatsContent";

export default function VariationsPrixPage() {
  return (
    <RequireRole permission="achats.view">
      <div className="container safe-bottom">
        <StatsAchatsContent />
      </div>
    </RequireRole>
  );
}

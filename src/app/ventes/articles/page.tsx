"use client";

import { ArticlesContent } from "@/components/production/ArticlesTab";
import { RequireRole } from "@/components/RequireRole";

export default function ArticlesVentePage() {
  return (
    <RequireRole permission="performances.view">
      <ArticlesContent />
    </RequireRole>
  );
}

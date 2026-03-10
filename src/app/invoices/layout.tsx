"use client";

import { RequireRole } from "@/components/RequireRole";

export default function InvoicesLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole allowedRoles={["admin", "direction"]}>{children}</RequireRole>;
}

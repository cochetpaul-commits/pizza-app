"use client";

import { RequireRole } from "@/components/RequireRole";

export default function InvoicesLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole allowedRoles={["group_admin"]}>{children}</RequireRole>;
}

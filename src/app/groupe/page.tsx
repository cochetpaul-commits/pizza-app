"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";

export default function GroupePage() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard"); }, [router]);
  return (
    <RequireRole allowedRoles={["group_admin"]}>
      {null}
    </RequireRole>
  );
}

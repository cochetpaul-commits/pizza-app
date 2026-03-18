"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BelloMioPlanningPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/plannings"); }, [router]);
  return null;
}

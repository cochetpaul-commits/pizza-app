"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PersonnelRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/rh/equipe"); }, [router]);
  return null;
}

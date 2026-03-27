"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function PerformancesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/ventes"); }, [router]);
  return null;
}

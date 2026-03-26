"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MasseSalarialeRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/ventes/simulation"); }, [router]);
  return null;
}

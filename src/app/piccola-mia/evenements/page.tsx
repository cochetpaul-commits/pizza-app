"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PiccolaMiaEvenementsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/evenements"); }, [router]);
  return null;
}

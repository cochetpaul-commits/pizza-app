"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Page remplacée par la Carte (09/10/2026) : on y envoie, vue « equipe ». */
export default function Redirection() {
  const router = useRouter();
  useEffect(() => { router.replace("/carte?vue=equipe"); }, [router]);
  return null;
}

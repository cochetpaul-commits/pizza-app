"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Rentabilité (30/10/2026) : fusionnée avec Marge dans Pilotage › Rentabilité › Résultat (même cascade CA → EBE, mois par mois). */
export default function Redirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/analyse/marge"); }, [router]);
  return null;
}

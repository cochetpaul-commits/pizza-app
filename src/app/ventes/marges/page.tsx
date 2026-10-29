"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Marges produits (29/10/2026) : la page est remplacée par Pilotage › Rentabilité des plats (même source, même lecture). */
export default function Redirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/analyse/plats"); }, [router]);
  return null;
}

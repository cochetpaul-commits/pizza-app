"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";

/**
 * Page « Tableau de bord » supprimée à la demande de Paul (15/08/2026) :
 * ce n'était pas la vision voulue. Redirection :
 *  - admins → accueil groupe (/dashboard, chiffres consolidés)
 *  - managers/équipiers → leur tableau de bord personnalisé
 */
export default function PilotageRedirect() {
  const router = useRouter();
  const { isGroupAdmin, loading } = useProfile();
  useEffect(() => {
    if (loading) return;
    router.replace(isGroupAdmin ? "/dashboard" : "/mon-tableau");
  }, [loading, isGroupAdmin, router]);
  return null;
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { LoadingWithRescue } from "@/components/RequireRole";

export default function RootPage() {
  const router = useRouter();
  const { role, isGroupAdmin, loading: profileLoading } = useProfile();
  const { etablissements, setCurrent, setGroupView, loading: etabLoading } = useEtablissement();

  useEffect(() => {
    if (profileLoading || etabLoading) return;

    // Not authenticated
    if (!role) {
      router.replace("/login");
      return;
    }

    // Group admins → iFratelli group home
    if (isGroupAdmin) {
      setGroupView(true);
      setCurrent(null);
      router.replace("/groupe");
      return;
    }

    // Dans leur etablissement : equipiers → tableau perso ;
    // managers → accueil entreprise (KPI + tous les menus)
    if (etablissements.length > 0) {
      const etab = etablissements[0];
      setGroupView(false);
      setCurrent(etab);
      if (role === "manager") {
        router.replace(etab.slug?.includes("piccola") ? "/piccola-mia" : "/bello-mio");
      } else {
        router.replace("/mon-tableau");
      }
      return;
    }

    // Fallback
    router.replace("/dashboard");
  }, [profileLoading, etabLoading, role, isGroupAdmin, etablissements, setCurrent, setGroupView, router]);

  // Même écran de secours que les pages protégées : bouton Recharger après
  // 12 s, rechargement automatique après 20 s (app bureau coincée au démarrage).
  return (
    <div style={{ minHeight: "100dvh", background: "#f5f3f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <LoadingWithRescue />
    </div>
  );
}

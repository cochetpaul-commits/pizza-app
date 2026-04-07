"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";

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

    // Employees → their affiliated establishment home
    if (etablissements.length > 0) {
      const etab = etablissements[0];
      setGroupView(false);
      setCurrent(etab);
      const slug = etab.slug?.includes("piccola") ? "/piccola-mia" : "/bello-mio";
      router.replace(slug);
      return;
    }

    // Fallback
    router.replace("/dashboard");
  }, [profileLoading, etabLoading, role, isGroupAdmin, etablissements, setCurrent, setGroupView, router]);

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#f6eedf",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <span style={{ fontSize: 13, color: "#999" }}>Chargement...</span>
    </div>
  );
}

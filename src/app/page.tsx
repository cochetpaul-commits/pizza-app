"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";

export default function RootPage() {
  const router = useRouter();
  const { role, loading: profileLoading } = useProfile();
  const { etablissements, loading: etabLoading } = useEtablissement();

  useEffect(() => {
    if (profileLoading || etabLoading) return;

    // Not authenticated
    if (!role) {
      router.replace("/login");
      return;
    }

    // Admin → groupe
    if (role === "group_admin") {
      router.replace("/groupe");
      return;
    }

    // Resolve restaurant from user's accessible establishments
    const first = etablissements[0];
    if (first?.slug === "piccola-mia" || first?.slug === "piccola_mia") {
      router.replace("/piccola-mia/cuisine");
    } else {
      // Default to bello-mio
      router.replace("/bello-mio/cuisine");
    }
  }, [profileLoading, etabLoading, role, etablissements, router]);

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#f2ede4",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <span style={{ fontSize: 13, color: "#999" }}>Chargement...</span>
    </div>
  );
}

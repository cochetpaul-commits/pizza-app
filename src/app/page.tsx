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

    // All authenticated users → dashboard
    router.replace("/dashboard");
  }, [profileLoading, etabLoading, role, etablissements, router]);

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

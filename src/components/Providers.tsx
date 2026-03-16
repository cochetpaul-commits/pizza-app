"use client";

import React from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { AuthGuard } from "@/components/AuthGuard";
import { ProfileProvider } from "@/lib/ProfileContext";
import { EtablissementProvider } from "@/lib/EtablissementContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>
        <ProfileProvider>
          <EtablissementProvider>{children}</EtablissementProvider>
        </ProfileProvider>
      </AuthGuard>
    </AuthProvider>
  );
}

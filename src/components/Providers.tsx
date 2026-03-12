"use client";

import { ProfileProvider } from "@/lib/ProfileContext";
import { EtablissementProvider } from "@/lib/EtablissementContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <EtablissementProvider>{children}</EtablissementProvider>
    </ProfileProvider>
  );
}

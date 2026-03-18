"use client";

import React from "react";
import { ProfileProvider } from "@/lib/ProfileContext";
import { EtablissementProvider } from "@/lib/EtablissementContext";
import { TopBarProvider } from "@/components/layout/TopBarContext";
import { AppShell } from "@/components/layout/AppShell";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <EtablissementProvider>
        <TopBarProvider>
          <AppShell>
            {children}
          </AppShell>
        </TopBarProvider>
      </EtablissementProvider>
    </ProfileProvider>
  );
}

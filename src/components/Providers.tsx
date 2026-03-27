"use client";

import React, { useEffect } from "react";
import { ProfileProvider } from "@/lib/ProfileContext";
import { EtablissementProvider } from "@/lib/EtablissementContext";
import { TopBarProvider } from "@/components/layout/TopBarContext";
import { AppShell } from "@/components/layout/AppShell";
import { ThemeProvider } from "@/lib/ThemeContext";
import { clearAppBadge } from "@/lib/pushSubscription";

export function Providers({ children }: { children: React.ReactNode }) {
  // Clear app badge when user opens/returns to the app
  useEffect(() => {
    clearAppBadge();
    const onFocus = () => clearAppBadge();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") clearAppBadge();
    });
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <ThemeProvider>
      <ProfileProvider>
        <EtablissementProvider>
          <TopBarProvider>
            <AppShell>
              {children}
            </AppShell>
          </TopBarProvider>
        </EtablissementProvider>
      </ProfileProvider>
    </ThemeProvider>
  );
}

"use client";

import { ProfileProvider } from "@/lib/ProfileContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ProfileProvider>{children}</ProfileProvider>;
}

"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  useEffect(() => {
    const run = async () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      // PKCE flow: exchange code for session
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[auth/callback] code exchange error:", error.message);
          window.location.href = "/login";
          return;
        }
        // Check if this is a recovery or invite flow
        const { data: { session } } = await supabase.auth.getSession();
        const amr = (session as unknown as Record<string, unknown>)?.amr;
        const hasRecoveryAmr = Array.isArray(amr) && amr.some((a: Record<string, unknown>) => a.method === "recovery");
        const isRecovery = params.get("type") === "recovery" || hasRecoveryAmr;
        // Invite or recovery → setup password
        if (isRecovery || params.get("type") === "invite") {
          window.location.href = "/auth/setup-password?type=recovery";
          return;
        }
        window.location.href = "/";
        return;
      }

      // Legacy implicit flow: detect from hash
      if (hash.includes("type=invite") || hash.includes("type%3Dinvite")
        || hash.includes("type=recovery") || hash.includes("type%3Drecovery")) {
        window.location.href = `/auth/setup-password${hash}`;
        return;
      }

      await supabase.auth.getSession();
      window.location.href = "/";
    };
    run();
  }, []);

  return <pre style={{ padding: 24 }}>Connexion en cours...</pre>;
}

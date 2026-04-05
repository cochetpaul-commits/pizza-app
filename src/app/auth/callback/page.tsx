"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  useEffect(() => {
    const run = async () => {
      const hash = window.location.hash;
      // Detect invite or password recovery flow from hash URL
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

  return <pre style={{ padding: 24 }}>Finishing login...</pre>;
}

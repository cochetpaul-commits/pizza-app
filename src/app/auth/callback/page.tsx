"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  useEffect(() => {
    const run = async () => {
      // Detect invite flow from hash URL (type=invite)
      const hash = window.location.hash;
      if (hash.includes("type=invite") || hash.includes("type%3Dinvite")) {
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

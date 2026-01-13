"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  useEffect(() => {
    const run = async () => {
      // If using OAuth/magic link flows, Supabase may set session from URL.
      // For password sign-in, this page is not strictly required, but keep it for future.
      await supabase.auth.getSession();
      window.location.href = "/";
    };
    run();
  }, []);

  return <pre style={{ padding: 24 }}>Finishing login...</pre>;
}
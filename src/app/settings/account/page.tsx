"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type UserInfo = {
  email: string | null;
  role: string | null;
  full_name: string | null;
};

export default function MonComptePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", authUser.id)
        .maybeSingle();

      setUser({
        email: authUser.email ?? null,
        role: profile?.role ?? null,
        full_name: profile?.full_name ?? null,
      });
      setLoading(false);
    }
    load();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (loading) return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "24px 16px" }}>
      <p style={{ color: "#999", fontSize: 13 }}>Chargement...</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "24px 16px 40px" }}>
      <h1 style={{
        fontFamily: "var(--font-oswald), Oswald, sans-serif",
        fontSize: 22, fontWeight: 700, letterSpacing: 1,
        marginBottom: 20, color: "#1a1a1a",
      }}>
        Mon compte
      </h1>

      <div style={{
        background: "#fff", borderRadius: 14, padding: 20,
        border: "1px solid #ddd6c8",
      }}>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              Nom
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>
              {user?.full_name ?? "Non renseigne"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              Email
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>
              {user?.email ?? "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              Role
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>
              {user?.role ?? "—"}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #ddd6c8" }}>
          <button
            type="button"
            onClick={logout}
            className="btn btnDanger"
          >
            Se deconnecter
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";

export default function SetupPasswordPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      // Supabase client auto-detects session from hash URL (detectSessionInUrl: true)
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
      } else {
        setExpired(true);
      }
    };
    init();
  }, []);

  const handleSubmit = async () => {
    setError("");

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(updateErr.message);
        setLoading(false);
        return;
      }

      // Ensure profile exists with correct role
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const role = user.user_metadata?.role || "equipier";
        const displayName = user.user_metadata?.display_name || user.email;
        await supabase.from("profiles").upsert({
          id: user.id,
          role,
          display_name: displayName,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
      }

      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(false);
    }
  };

  if (!ready && !expired) {
    return <pre style={{ padding: 24 }}>Chargement...</pre>;
  }

  if (expired) {
    return (
      <main className="container">
        <TopNav title="Lien expiré" subtitle="" />
        <div className="card" style={{ marginTop: 14 }}>
          <p className="errorBox">
            Ce lien a expiré ou est invalide. Contactez votre administrateur.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <TopNav title="Créer mon compte" subtitle="Bienvenue" />

        <div className="card" style={{ marginTop: 14 }}>
          <div className="muted">Nouveau mot de passe</div>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 caractères"
            style={{ marginTop: 8 }}
          />

          <div className="muted" style={{ marginTop: 12 }}>
            Confirmer le mot de passe
          </div>
          <input
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            style={{ marginTop: 8 }}
          />

          {error && (
            <p className="errorBox" style={{ marginTop: 12 }}>
              {error}
            </p>
          )}

          <div style={{ marginTop: 12 }}>
            <button
              className="btn btnPrimary"
              type="button"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Création…" : "Créer mon compte"}
            </button>
          </div>
        </div>
    </main>
  );
}

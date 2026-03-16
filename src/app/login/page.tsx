"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const { signInWithEmail, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const err = await signInWithEmail(email.trim(), password);
    if (err) {
      setError(err);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/setup-password`,
    });
    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f2ede4",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1
            style={{
              fontFamily: "var(--font-oswald)",
              fontWeight: 700,
              fontSize: 36,
              color: "#D4775A",
              letterSpacing: 1,
              margin: 0,
            }}
          >
            BELLO MIO
          </h1>
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              color: "#8a7e72",
              fontSize: 14,
              marginTop: 4,
            }}
          >
            iFratelli Group
          </p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {resetMode ? (
            /* ── Reset password ── */
            <form onSubmit={handleReset}>
              <h2
                style={{
                  fontFamily: "var(--font-oswald)",
                  fontWeight: 600,
                  fontSize: 18,
                  margin: "0 0 16px",
                  color: "#1a1410",
                }}
              >
                Mot de passe oublié
              </h2>

              {resetSent ? (
                <p style={{ color: "#4a6741", fontSize: 14 }}>
                  Un lien de réinitialisation a été envoyé à <strong>{email}</strong>.
                  Vérifiez votre boîte mail.
                </p>
              ) : (
                <>
                  <label className="muted" style={{ fontSize: 13 }}>
                    Email
                  </label>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@domaine.com"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    style={{ marginTop: 6 }}
                  />

                  {error && (
                    <p style={{ color: "#8B1A1A", fontSize: 13, marginTop: 8 }}>{error}</p>
                  )}

                  <button
                    className="btn btnPrimary"
                    type="submit"
                    style={{ width: "100%", marginTop: 16 }}
                  >
                    Envoyer le lien
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setResetMode(false);
                  setResetSent(false);
                  setError(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#D4775A",
                  fontSize: 13,
                  cursor: "pointer",
                  marginTop: 12,
                  padding: 0,
                }}
              >
                Retour à la connexion
              </button>
            </form>
          ) : (
            /* ── Login ── */
            <form onSubmit={handleLogin}>
              <h2
                style={{
                  fontFamily: "var(--font-oswald)",
                  fontWeight: 600,
                  fontSize: 18,
                  margin: "0 0 16px",
                  color: "#1a1410",
                }}
              >
                Connexion
              </h2>

              <label className="muted" style={{ fontSize: 13 }}>
                Email
              </label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@domaine.com"
                required
                autoCapitalize="none"
                autoCorrect="off"
                style={{ marginTop: 6 }}
              />

              <label className="muted" style={{ fontSize: 13, display: "block", marginTop: 14 }}>
                Mot de passe
              </label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ marginTop: 6 }}
              />

              {error && (
                <p style={{ color: "#8B1A1A", fontSize: 13, marginTop: 8 }}>{error}</p>
              )}

              <button
                className="btn btnPrimary"
                type="submit"
                disabled={loading}
                style={{ width: "100%", marginTop: 20 }}
              >
                {loading ? "Connexion…" : "Se connecter"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setResetMode(true);
                  setError(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#D4775A",
                  fontSize: 13,
                  cursor: "pointer",
                  marginTop: 12,
                  padding: 0,
                }}
              >
                Mot de passe oublié ?
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

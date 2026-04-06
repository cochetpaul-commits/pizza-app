"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string>("");
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const signIn = async () => {
    try {
      setMsg("Connexion…");

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        const msg = error.message.toLowerCase().includes("invalid login")
          ? "Email ou mot de passe incorrect."
          : error.message;
        setMsg(msg);
        return;
      }

      setMsg("");
      router.push("/");
      router.refresh();
      } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
      setMsg(`ERROR: ${msg}`);
    }
  };

  const sendReset = async () => {
    if (!email.trim()) { setMsg("Entrez votre email."); return; }
    setMsg("Envoi…");
    const origin = window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/auth/callback`,
    });
    if (error) { setMsg(`ERROR: ${error.message}`); return; }
    setResetSent(true);
    setMsg("");
  };

  return (
    <main className="container">
      <TopNav title={resetMode ? "Mot de passe oublie" : "Connexion"} subtitle={resetMode ? "" : "Acces reserve"} />

      <div className="card" style={{ marginTop: 14 }}>
        {resetMode ? (
          resetSent ? (
            <>
              <p style={{ fontSize: 14, color: "#2D6A4F", fontWeight: 600 }}>
                Un email de reinitialisation a ete envoye a {email}.
              </p>
              <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
                Verifiez votre boite mail (et les spams) puis cliquez sur le lien pour choisir un nouveau mot de passe.
              </p>
              <button
                className="btn"
                type="button"
                onClick={() => { setResetMode(false); setResetSent(false); setMsg(""); }}
                style={{ marginTop: 16 }}
              >
                Retour a la connexion
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                Entrez votre email, vous recevrez un lien pour reinitialiser votre mot de passe.
              </p>
              <div className="muted">Email</div>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@domaine.com"
                style={{ marginTop: 8 }}
                autoCapitalize="none"
                autoCorrect="off"
              />
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button className="btn btnPrimary" type="button" onClick={sendReset}>
                  Envoyer le lien
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => { setResetMode(false); setMsg(""); }}
                >
                  Annuler
                </button>
              </div>
              {msg && msg !== "Connexion…" && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.15)" }}>
                {msg}
              </div>
            )}
            </>
          )
        ) : (
          <>
            <div className="muted">Email</div>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@domaine.com"
              style={{ marginTop: 8 }}
              autoCapitalize="none"
              autoCorrect="off"
            />

            <div className="muted" style={{ marginTop: 12 }}>
              Mot de passe
            </div>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ marginTop: 8 }}
              placeholder="••••••••"
            />

            <div style={{ marginTop: 12 }}>
              <button className="btn btnPrimary" type="button" onClick={signIn}>
                Se connecter
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setResetMode(true); setMsg(""); }}
              style={{
                marginTop: 14, background: "none", border: "none", padding: 0,
                fontSize: 13, color: "#D4775A", cursor: "pointer", fontWeight: 600,
              }}
            >
              Mot de passe oublie ?
            </button>

            {msg && msg !== "Connexion…" && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.15)" }}>
                {msg}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
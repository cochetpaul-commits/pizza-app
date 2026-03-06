"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";
import { NavBar } from "@/components/NavBar";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string>("");

  const signIn = async () => {
    try {
      setMsg("Connexion…");

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMsg(`ERROR: ${error.message}`);
        return;
      }

      setMsg(`OK: ${data.user?.email ?? ""}`);
      router.push("/");
      router.refresh();
      } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
      setMsg(`ERROR: ${msg}`);
    }
  };

  return (
    <>
    <NavBar />
    <main className="container">
      <TopNav title="Connexion" subtitle="Accès réservé" />

      <div className="card" style={{ marginTop: 14 }}>
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

        {msg ? (
          <pre className="code" style={{ marginTop: 12 }}>
            {msg}
          </pre>
        ) : null}
      </div>
    </main>
    </>
  );
}
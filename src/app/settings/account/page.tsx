"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/lib/ThemeContext";
import { mapToPermRole, ROLE_INFO } from "@/lib/permissions";
import { compressImage } from "@/lib/compressImage";

/**
 * Mon compte — l'espace personnel de chaque employé :
 * photo, coordonnées (modifiables par lui-même), mot de passe, thème.
 * Le rôle et le poste sont affichés en lecture seule (gérés par la fiche).
 */

type Me = {
  userId: string;
  email: string | null;
  role: string;
  prenom: string;
  nom: string;
  telMobile: string;
  adresse: string;
  avatarUrl: string | null;
  poste: string | null;
  equipe: string | null;
  etabNoms: string[];
};

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 14, padding: 20,
  border: "1px solid #ddd6c8", marginBottom: 14,
};
const secTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase",
  letterSpacing: 0.5, marginBottom: 10,
};
const inputSt: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid #ddd6c8", fontSize: 14, background: "#fff",
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};
const labelSt: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#6f6a61",
  marginBottom: 3, letterSpacing: 0.3,
};
const btnPrimary: React.CSSProperties = {
  background: "#D4775A", color: "#fff", border: "none", borderRadius: 8,
  padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
};

export default function MonComptePage() {
  const { mode, setMode, isDark } = useTheme();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [{ data: profile }, { data: emps }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        supabase.from("employes")
          .select("prenom, nom, tel_mobile, adresse, avatar_url, role, etablissement_id, postes(nom, equipe), etablissements(nom)")
          .eq("auth_user_id", user.id)
          .eq("actif", true),
      ]);

      const first = (emps ?? [])[0] as Record<string, unknown> | undefined;
      const poste = first?.postes as { nom?: string; equipe?: string } | null;
      const etabNoms = (emps ?? [])
        .map(e => ((e as Record<string, unknown>).etablissements as { nom?: string } | null)?.nom)
        .filter(Boolean) as string[];

      setMe({
        userId: user.id,
        email: user.email ?? null,
        role: (profile?.role as string) ?? (first?.role as string) ?? "equipier",
        prenom: (first?.prenom as string) ?? "",
        nom: (first?.nom as string) ?? "",
        telMobile: (first?.tel_mobile as string) ?? "",
        adresse: (first?.adresse as string) ?? "",
        avatarUrl: (first?.avatar_url as string) ?? null,
        poste: poste?.nom ?? null,
        equipe: poste?.equipe ?? null,
        etabNoms: [...new Set(etabNoms)],
      });
      setLoading(false);
    })();
  }, []);

  const saveCoords = async () => {
    if (!me) return;
    setSaving(true); setMsg("");
    const { error } = await supabase
      .from("employes")
      .update({ tel_mobile: me.telMobile || null, adresse: me.adresse || null })
      .eq("auth_user_id", me.userId);
    setMsg(error ? `Erreur : ${error.message}` : "Coordonnées enregistrées");
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const uploadPhoto = async (file: File) => {
    if (!me) return;
    setSaving(true); setMsg("");
    try {
      const compressed = await compressImage(file, 400, 0.8);
      const path = `avatars/${me.userId}.jpg`;
      const { error: upErr } = await supabase.storage.from("recipe-images").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("recipe-images").getPublicUrl(path);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from("employes").update({ avatar_url: url }).eq("auth_user_id", me.userId);
      setMe(prev => prev ? { ...prev, avatarUrl: url } : prev);
      setMsg("Photo mise à jour");
    } catch (e) {
      setMsg(`Erreur photo : ${e instanceof Error ? e.message : "inconnue"}`);
    }
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const changePassword = async () => {
    setPwMsg("");
    if (pw1.length < 8) { setPwMsg("8 caractères minimum"); return; }
    if (pw1 !== pw2) { setPwMsg("Les deux mots de passe ne correspondent pas"); return; }
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    if (error) setPwMsg(`Erreur : ${error.message}`);
    else { setPwMsg("Mot de passe modifié"); setPw1(""); setPw2(""); }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (loading) return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px" }}>
      <p style={{ color: "#999", fontSize: 13 }}>Chargement...</p>
    </div>
  );

  const permRole = mapToPermRole(me?.role ?? "equipier");
  const roleInfo = ROLE_INFO[permRole];
  const initials = `${me?.prenom?.[0] ?? ""}${me?.nom?.[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px 60px" }}>
      <h1 style={{
        fontFamily: "var(--font-oswald), Oswald, sans-serif",
        fontSize: 22, fontWeight: 700, letterSpacing: 1,
        marginBottom: 20, color: "#1a1a1a",
      }}>
        Mon compte
      </h1>

      {/* ── Identité : photo + nom + rôle/poste (lecture seule) ── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Changer ma photo"
            style={{
              width: 64, height: 64, borderRadius: "50%", flexShrink: 0, padding: 0,
              border: "2px solid #ddd6c8", background: "#f5f0e8", cursor: "pointer",
              overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 800, color: "#b0a894", position: "relative",
            }}
          >
            {me?.avatarUrl
              ? <Image src={me.avatarUrl} alt="" width={64} height={64} style={{ objectFit: "cover", width: 64, height: 64 }} unoptimized />
              : initials}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>{me?.prenom} {me?.nom}</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: roleInfo.bg, color: roleInfo.color }}>
                {roleInfo.label}
              </span>
              {me?.poste && (
                <span className="pastille-cadre">{me.poste}{me.equipe ? ` (${me.equipe})` : ""}</span>
              )}
              {me?.etabNoms.map(n => <span key={n} style={{ fontSize: 10, color: "#999" }}>{n}</span>)}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "#999", marginTop: 10 }}>
          Touche la photo pour la changer. Rôle et poste sont gérés par le restaurant.
        </div>
        <a href="/mon-tableau" style={{
          display: "block", textAlign: "center", marginTop: 12, padding: "10px 0",
          borderRadius: 8, background: "rgba(212,119,90,0.10)", color: "#b0562f",
          fontSize: 13, fontWeight: 700, textDecoration: "none",
        }}>
          Voir mon tableau de bord →
        </a>
      </div>

      {/* ── Coordonnées (modifiables par l'employé) ── */}
      <div style={card}>
        <div style={secTitle}>Mes coordonnées</div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Email (identifiant de connexion)</label>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#999" }}>{me?.email ?? "—"}</div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Téléphone</label>
          <input style={inputSt} value={me?.telMobile ?? ""} onChange={(e) => setMe(p => p ? { ...p, telMobile: e.target.value } : p)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelSt}>Adresse</label>
          <input style={inputSt} value={me?.adresse ?? ""} onChange={(e) => setMe(p => p ? { ...p, adresse: e.target.value } : p)} />
        </div>
        <button type="button" onClick={saveCoords} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          Enregistrer
        </button>
        {msg && <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, color: msg.startsWith("Erreur") ? "#DC2626" : "#2D6A4F" }}>{msg}</div>}
      </div>

      {/* ── Mot de passe ── */}
      <div style={card}>
        <div style={secTitle}>Changer mon mot de passe</div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Nouveau mot de passe</label>
          <input type="password" style={inputSt} value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelSt}>Confirmer</label>
          <input type="password" style={inputSt} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </div>
        <button type="button" onClick={changePassword} style={btnPrimary}>Modifier</button>
        {pwMsg && <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, color: pwMsg === "Mot de passe modifié" ? "#2D6A4F" : "#DC2626" }}>{pwMsg}</div>}
      </div>

      {/* ── Réglages ── */}
      <div style={card}>
        <div style={secTitle}>Réglages</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Thème</span>
          <div style={{ display: "inline-flex", gap: 2, padding: 3, background: "#f0ebe3", borderRadius: 10 }}>
            {([["auto", "Auto"], ["light", "Clair"], ["dark", "Sombre"]] as const).map(([m, label]) => (
              <button key={m} type="button" onClick={() => setMode(m)} style={{
                padding: "5px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700,
                background: mode === m ? "#fff" : "transparent",
                color: mode === m ? "#1a1a1a" : "#999", cursor: "pointer",
                boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "#999", marginTop: 6 }}>
          {isDark ? "Thème sombre actif" : "Thème clair actif"}
        </div>
      </div>

      {/* ── Déconnexion ── */}
      <button type="button" onClick={logout} style={{ ...btnPrimary, width: "100%", background: "#fff", color: "#DC2626", border: "1px solid rgba(220,38,38,0.3)" }}>
        Se déconnecter
      </button>
    </div>
  );
}

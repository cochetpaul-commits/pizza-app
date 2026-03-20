"use client";

import { useRouter } from "next/navigation";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import { supabase } from "@/lib/supabaseClient";

const C = {
  ifratelli: "#b45f57",
  belloMio: "#e27f57",
  piccolaMia: "#F5DFB0",
};

function getColor(slug: string) {
  if (slug === "piccola-mia" || slug === "piccola_mia") return C.piccolaMia;
  if (slug === "bello-mio" || slug === "bello_mia") return C.belloMio;
  return C.ifratelli;
}

export default function SessionPage() {
  const router = useRouter();
  const { isGroupAdmin, etablissements, setCurrent, setGroupView } = useEtablissement();
  const { role } = useProfile();

  const pickEtab = (e: typeof etablissements[0]) => {
    setCurrent(e);
    router.push("/dashboard");
  };

  const pickGroup = () => {
    setGroupView(true);
    router.push("/dashboard");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!role) return null;

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "40px 16px" }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: "32px 24px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        border: "1px solid rgba(0,0,0,0.06)",
        textAlign: "center",
      }}>
        <h2 style={{
          fontFamily: "var(--font-oswald), Oswald, sans-serif",
          fontSize: 22, fontWeight: 700, margin: "0 0 4px",
          color: "#1a1a1a",
        }}>
          iFratelli Group
        </h2>
        <p style={{ color: "#999", fontSize: 13, margin: "0 0 28px" }}>
          Choisissez votre session
        </p>

        <div style={{
          display: "flex", justifyContent: "center", gap: 14,
          flexWrap: "wrap", marginBottom: 28,
        }}>
          {/* Groupe card */}
          {isGroupAdmin && (
            <button
              type="button"
              onClick={pickGroup}
              style={{
                ...cardStyle,
                borderColor: C.ifratelli + "40",
                background: C.ifratelli + "08",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>&#127963;</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>Groupe</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>Vue consolidee</div>
            </button>
          )}

          {/* Establishment cards */}
          {etablissements.map(e => {
            const color = getColor(e.slug);
            const icon = e.slug.includes("bello") ? "\u{1F35D}" : "\u{1F6F5}";
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => pickEtab(e)}
                style={{
                  ...cardStyle,
                  borderColor: color + "40",
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{e.nom}</div>
                <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                  {e.slug.includes("bello") ? "SARL Sasha" : "SARL Fratelli"}
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={logout}
          style={{
            background: "none", border: "none",
            color: "#999", fontSize: 13, cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Se deconnecter
        </button>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  width: 130, padding: "20px 12px",
  borderRadius: 14, border: "2px solid rgba(0,0,0,0.08)",
  background: "#fff", cursor: "pointer",
  textAlign: "center",
  transition: "transform 0.15s, box-shadow 0.15s",
};

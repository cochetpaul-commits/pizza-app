"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { RequireRole } from "@/components/RequireRole";
import type { Role } from "@/lib/rbac";
import { fetchApi } from "@/lib/fetchApi";
import { useEtablissement } from "@/lib/EtablissementContext";

type UserRow = {
  id: string;
  role: Role;
  displayName: string | null;
  email: string;
  createdAt: string;
};

const ROLE_LABELS: Record<Role, string> = {
  group_admin: "Direction",
  manager: "Manager",
  cuisine: "Cuisine",
  salle: "Salle",
  plonge: "Plonge",
};

const ROLE_COLORS: Record<Role, string> = {
  group_admin: "#D4775A",
  manager: "#2563eb",
  cuisine: "#1a1a1a",
  salle: "#4a6741",
  plonge: "#6b7280",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function UsersContent() {
  const { current: _etab } = useEtablissement();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("cuisine");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const token = await getToken();
      const res = await fetchApi("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cancelled) return;
      if (!res.ok) { setError("Erreur chargement utilisateurs"); setLoading(false); return; }
      const data = await res.json();
      setUsers(data.users ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  async function handleRoleChange(userId: string, newRole: Role) {
    const token = await getToken();
    await fetchApi("/api/admin/users", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: newRole }),
    });
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
  }

  async function handleDelete(userId: string) {
    const token = await getToken();
    await fetchApi("/api/admin/users", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setDeleteConfirm(null);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const token = await getToken();
    const res = await fetchApi("/api/admin/invite", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, displayName: inviteName.trim() || undefined }),
    });
    setInviting(false);
    if (res.ok) {
      setShowInvite(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("cuisine");
      setRefreshKey(k => k + 1);
    } else {
      const data = await res.json();
      alert(data.error || "Erreur invitation");
    }
  }

  return (
    <>
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 40px", boxSizing: "border-box" }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{
            fontSize: 10, fontWeight: 800, letterSpacing: 2,
            color: "#D4775A", textTransform: "uppercase", margin: "0 0 6px",
          }}>ADMINISTRATION</p>
          <h1 style={{ fontSize: 24, color: "#1a1a1a", margin: 0, fontFamily: "'Oswald', sans-serif" }}>Gestion des utilisateurs</h1>
        </div>

        {/* Invite button */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setShowInvite(true)}
            style={{
              padding: "10px 20px", borderRadius: 10, border: "none",
              background: "#D4775A", color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: "pointer",
            }}
          >
            + Inviter un utilisateur
          </button>
        </div>

        {/* Invite modal */}
        {showInvite && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}>
            <div style={{
              background: "#fff", borderRadius: 16, padding: 28, width: "90%", maxWidth: 400,
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}>
              <h2 style={{ margin: "0 0 20px", fontSize: 18, color: "#1a1a1a" }}>Inviter un utilisateur</h2>
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>Email *</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="nom@example.com"
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>Nom affiché</label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Prénom Nom"
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>Rôle *</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box",
                    }}
                  >
                    <option value="cuisine">Cuisine</option>
                    <option value="salle">Salle</option>
                    <option value="plonge">Plonge</option>
                    <option value="manager">Manager</option>
                    <option value="group_admin">Direction</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowInvite(false)}
                  style={{
                    padding: "9px 18px", borderRadius: 8, border: "1px solid #ddd",
                    background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#666",
                  }}
                >Annuler</button>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  style={{
                    padding: "9px 18px", borderRadius: 8, border: "none",
                    background: "#D4775A", color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", opacity: inviting ? 0.6 : 1,
                  }}
                >{inviting ? "Envoi…" : "Inviter"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: "12px 16px", borderRadius: 10, background: "#FEF2F2", border: "1px solid rgba(139,26,26,0.2)", marginBottom: 16, fontSize: 13, color: "#D4775A" }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && <p style={{ fontSize: 13, color: "#999" }}>Chargement…</p>}

        {/* Users list */}
        {!loading && users.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {users.map((u) => (
              <div key={u.id} style={{
                background: "#fff", borderRadius: 14, padding: "16px 18px",
                border: "1px solid #ddd6c8", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>
                      {u.displayName || u.email}
                    </div>
                    <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{u.email}</div>
                    <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>Depuis {fmtDate(u.createdAt)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                      style={{
                        padding: "6px 10px", borderRadius: 8,
                        border: `1.5px solid ${ROLE_COLORS[u.role]}`,
                        background: `${ROLE_COLORS[u.role]}10`,
                        color: ROLE_COLORS[u.role],
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                    {deleteConfirm === u.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          onClick={() => handleDelete(u.id)}
                          style={{
                            padding: "5px 10px", borderRadius: 6, border: "none",
                            background: "#d93f3f", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer",
                          }}
                        >Confirmer</button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          style={{
                            padding: "5px 10px", borderRadius: 6, border: "1px solid #ddd",
                            background: "#fff", fontSize: 11, cursor: "pointer", color: "#666",
                          }}
                        >Non</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(u.id)}
                        style={{
                          padding: "5px 10px", borderRadius: 6, border: "1px solid #ddd6c8",
                          background: "#fff", fontSize: 11, cursor: "pointer", color: "#d93f3f", fontWeight: 600,
                        }}
                      >Supprimer</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && users.length === 0 && (
          <p style={{ fontSize: 13, color: "#999" }}>Aucun utilisateur.</p>
        )}
      </main>
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <UsersContent />
    </RequireRole>
  );
}

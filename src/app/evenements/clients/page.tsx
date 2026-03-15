"use client";

import { useEffect, useState } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";

type Client = {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  notes: string | null;
  created_at: string;
};

type FormData = {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  notes: string;
};

const empty: FormData = { nom: "", prenom: "", email: "", telephone: "", notes: "" };

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(empty);
  const [saving, setSaving] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("clients")
      .select("*")
      .order("nom")
      .then(({ data }) => {
        if (cancelled) return;
        setClients((data ?? []) as Client[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = () => setReloadKey(k => k + 1);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setShowForm(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c.id);
    setForm({
      nom: c.nom,
      prenom: c.prenom ?? "",
      email: c.email ?? "",
      telephone: c.telephone ?? "",
      notes: c.notes ?? "",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.nom.trim()) return;
    setSaving(true);
    const payload = {
      nom: form.nom.trim(),
      prenom: form.prenom.trim() || null,
      email: form.email.trim() || null,
      telephone: form.telephone.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      await supabase.from("clients").update(payload).eq("id", editing);
    } else {
      await supabase.from("clients").insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    reload();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce client ?")) return;
    await supabase.from("clients").delete().eq("id", id);
    reload();
  };

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <NavBar
        backHref="/piccola-mia/evenements"
        backLabel="Evenements"
        primaryAction={
          <button type="button" className="btn" style={addBtn} onClick={openNew}>
            + Client
          </button>
        }
      />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 40px" }}>
        <h1 style={heading}>Clients</h1>

        {loading && <p style={{ color: "#999", fontSize: 13 }}>Chargement...</p>}

        {!loading && clients.length === 0 && (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>
            Aucun client pour le moment
          </p>
        )}

        {clients.length > 0 && (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Nom</th>
                <th style={th}>Telephone</th>
                <th style={th}>Email</th>
                <th style={{ ...th, width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr
                  key={c.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => openEdit(c)}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f5f0e8")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <td style={td}>
                    <span style={{ fontWeight: 700 }}>{c.nom}</span>
                    {c.prenom && <span style={{ color: "#999", marginLeft: 4 }}>{c.prenom}</span>}
                  </td>
                  <td style={td}>{c.telephone ?? "—"}</td>
                  <td style={td}>{c.email ?? "—"}</td>
                  <td style={td}>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); remove(c.id); }}
                      style={delBtn}
                      title="Supprimer"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div style={overlay} onClick={() => setShowForm(false)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
              {editing ? "Modifier le client" : "Nouveau client"}
            </h2>

            <label style={label}>Nom *</label>
            <input style={input} value={form.nom} onChange={e => set("nom", e.target.value)} autoFocus />

            <label style={label}>Prenom</label>
            <input style={input} value={form.prenom} onChange={e => set("prenom", e.target.value)} />

            <label style={label}>Telephone</label>
            <input style={input} value={form.telephone} onChange={e => set("telephone", e.target.value)} type="tel" />

            <label style={label}>Email</label>
            <input style={input} value={form.email} onChange={e => set("email", e.target.value)} type="email" />

            <label style={label}>Notes</label>
            <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} />

            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button type="button" className="btn" style={cancelBtn} onClick={() => setShowForm(false)}>
                Annuler
              </button>
              <button type="button" className="btn" style={saveBtn} onClick={save} disabled={saving || !form.nom.trim()}>
                {saving ? "..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </RequireRole>
  );
}

const heading: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 28,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#1a1a1a",
  letterSpacing: 1,
  textTransform: "uppercase",
};

const addBtn: React.CSSProperties = {
  background: "#D4775A",
  color: "#fff",
  border: "none",
  borderRadius: 20,
  padding: "0 16px",
  height: 32,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "#b0a894",
  borderBottom: "1px solid #ddd6c8",
};

const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(221,214,200,0.4)",
  fontSize: 13,
  color: "#1a1a1a",
};

const delBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#ccc",
  fontSize: 18,
  cursor: "pointer",
  padding: "0 4px",
  lineHeight: 1,
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
  padding: 16,
};

const modal: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: "24px",
  width: "100%",
  maxWidth: 420,
  boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#999",
  marginBottom: 4,
  marginTop: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const cancelBtn: React.CSSProperties = {
  background: "#f2ede4",
  color: "#999",
  border: "none",
  borderRadius: 20,
  padding: "0 16px",
  height: 34,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const saveBtn: React.CSSProperties = {
  background: "#D4775A",
  color: "#fff",
  border: "none",
  borderRadius: 20,
  padding: "0 20px",
  height: 34,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

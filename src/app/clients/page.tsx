"use client";

import { useEffect, useState, useMemo } from "react";

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

export default function CarnetClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(empty);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tableError, setTableError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [clientsRes, eventsRes] = await Promise.all([
        supabase.from("clients").select("*").order("nom"),
        supabase.from("events").select("id, contact_name"),
      ]);

      if (cancelled) return;

      if (clientsRes.error) {
        setTableError(true);
        setLoading(false);
        return;
      }

      const clientsList = (clientsRes.data ?? []) as Client[];
      const events = (eventsRes.data ?? []) as { id: string; contact_name: string | null }[];

      // Count events per client by matching contact_name with client nom
      const counts: Record<string, number> = {};
      for (const c of clientsList) {
        const nameLower = c.nom.toLowerCase().trim();
        counts[c.id] = events.filter(
          (e) => e.contact_name && e.contact_name.toLowerCase().trim() === nameLower
        ).length;
      }

      setClients(clientsList);
      setEventCounts(counts);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = () => { setLoading(true); setReloadKey((k) => k + 1); };

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase().trim();
    return clients.filter(
      (c) =>
        c.nom.toLowerCase().includes(q) ||
        (c.prenom && c.prenom.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.telephone && c.telephone.includes(q))
    );
  }, [clients, search]);

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

  const set = (k: keyof FormData, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <h1 style={h1Style}>Evenementiel</h1>

        {/* Toolbar: search + new button */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Rechercher un client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInput}
          />
          <button type="button" onClick={openNew} style={newBtn}>
            + Nouveau client
          </button>
        </div>

        {tableError && (
          <div style={{ background: "#FFF3E0", border: "1px solid #FFB74D", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#E65100" }}>
            Table &quot;clients&quot; non configuree — cette fonctionnalite n&apos;est pas encore disponible.
          </div>
        )}

        {loading && <p style={{ color: "#999", fontSize: 13 }}>Chargement...</p>}

        {!loading && filtered.length === 0 && (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>
            {search.trim() ? "Aucun resultat" : "Aucun client pour le moment"}
          </p>
        )}

        {!loading && filtered.length > 0 && (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Nom</th>
                <th style={th}>Telephone</th>
                <th style={th}>Email</th>
                <th style={{ ...th, textAlign: "center" }}>Events</th>
                <th style={{ ...th, width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => openEdit(c)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f0e8")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td style={td}>
                    <span style={{ fontWeight: 700 }}>{c.nom}</span>
                    {c.prenom && <span style={{ color: "#999", marginLeft: 4 }}>{c.prenom}</span>}
                  </td>
                  <td style={td}>{c.telephone ?? "—"}</td>
                  <td style={td}>{c.email ?? "—"}</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {eventCounts[c.id] ? (
                      <span style={badgeStyle}>{eventCounts[c.id]}</span>
                    ) : (
                      <span style={{ color: "#ccc" }}>0</span>
                    )}
                  </td>
                  <td style={td}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); remove(c.id); }}
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
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>
              {editing ? "Modifier le client" : "Nouveau client"}
            </h2>

            <label style={labelStyle}>Nom *</label>
            <input style={inputStyle} value={form.nom} onChange={(e) => set("nom", e.target.value)} autoFocus />

            <label style={labelStyle}>Prenom</label>
            <input style={inputStyle} value={form.prenom} onChange={(e) => set("prenom", e.target.value)} />

            <label style={labelStyle}>Telephone</label>
            <input style={inputStyle} value={form.telephone} onChange={(e) => set("telephone", e.target.value)} type="tel" />

            <label style={labelStyle}>Email</label>
            <input style={inputStyle} value={form.email} onChange={(e) => set("email", e.target.value)} type="email" />

            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button type="button" style={cancelBtn} onClick={() => setShowForm(false)}>
                Annuler
              </button>
              <button type="button" style={saveBtn} onClick={save} disabled={saving || !form.nom.trim()}>
                {saving ? "..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </RequireRole>
  );
}

/* ---------- styles ---------- */

const h1Style: React.CSSProperties = {
  fontFamily: "var(--font-oswald), Oswald, sans-serif",
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 1,
  marginBottom: 16,
  color: "#1a1a1a",
};

const searchInput: React.CSSProperties = {
  flex: 1,
  minWidth: 180,
  padding: "8px 14px",
  borderRadius: 20,
  border: "1px solid #ddd6c8",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

const newBtn: React.CSSProperties = {
  background: "#e27f57",
  color: "#fff",
  border: "none",
  borderRadius: 20,
  padding: "0 18px",
  height: 36,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
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

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  background: "rgba(226,127,87,0.12)",
  color: "#e27f57",
  fontWeight: 700,
  fontSize: 11,
  borderRadius: 8,
  padding: "2px 8px",
  minWidth: 20,
  textAlign: "center",
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

const modalTitle: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 18,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), Oswald, sans-serif",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#999",
  marginBottom: 4,
  marginTop: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const cancelBtn: React.CSSProperties = {
  background: "#f6eedf",
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
  background: "#e27f57",
  color: "#fff",
  border: "none",
  borderRadius: 20,
  padding: "0 20px",
  height: 34,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

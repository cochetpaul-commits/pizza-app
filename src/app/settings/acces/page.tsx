"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { fetchApi } from "@/lib/fetchApi";
import { supabase } from "@/lib/supabaseClient";

/**
 * Accès de l'équipe (admins) : inviter, changer le rôle et les établissements,
 * désactiver / réactiver, renvoyer une invitation. Tout passe par /api/admin/acces
 * (règles et journal côté serveur).
 */

type Compte = {
  id: string; email: string | null; nom: string | null; role: string | null; etablissements: string[];
  statut: "actif" | "invitation" | "desactive"; derniere_connexion: string | null; invite_le: string | null;
};
type Etab = { id: string; nom: string };
type Ligne = {
  fait_le: string; action: string; cible_email: string | null; cible_nom: string | null; par_nom: string | null;
  avant: Record<string, unknown> | null; apres: Record<string, unknown> | null; note: string | null;
};

const ROLES: { v: string; l: string }[] = [
  { v: "equipier", l: "Équipier" },
  { v: "manager", l: "Manager" },
  { v: "group_admin", l: "Admin" },
];
const libRole = (r: string | null) => ROLES.find((x) => x.v === r)?.l ?? (r ?? "—");
const ACTIONS: Record<string, string> = {
  invitation: "Invitation", renvoi_invitation: "Invitation renvoyée", role: "Rôle modifié",
  etablissements: "Établissements modifiés", desactivation: "Compte désactivé", reactivation: "Compte réactivé",
};
const fmt = (d: string | null) => d ? new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "jamais";

const card: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 16, border: "1px solid #ece6db", marginBottom: 12 };
const inputSt: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box", background: "#fff" };
const btn = (bg: string, fg = "#fff"): React.CSSProperties => ({ padding: "8px 14px", borderRadius: 10, border: bg === "#fff" ? "1px solid #ddd6c8" : "none", background: bg, color: fg, fontSize: 13, fontWeight: 700, cursor: "pointer" });
const badge = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: bg, color: fg, whiteSpace: "nowrap" });

export default function AccesEquipePage() {
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [etabs, setEtabs] = useState<Etab[]>([]);
  const [journal, setJournal] = useState<Ligne[]>([]);
  const [moi, setMoi] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edition, setEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<{ role: string; etablissements: string[] }>({ role: "equipier", etablissements: [] });
  const [invite, setInvite] = useState<{ ouvert: boolean; email: string; nom: string; role: string; etablissements: string[] }>({ ouvert: false, email: "", nom: "", role: "equipier", etablissements: [] });
  const [voirDesactives, setVoirDesactives] = useState(false);

  const charger = useCallback(async () => {
    const res = await fetchApi("/api/admin/acces");
    const json = await res.json();
    if (!res.ok) { setMsg({ ok: false, t: json.error ?? "Erreur de chargement" }); setLoading(false); return; }
    setComptes(json.comptes); setEtabs(json.etablissements); setJournal(json.journal);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMoi(data.user?.id ?? null));
    charger();
  }, [charger]);

  const nomEtab = (id: string) => etabs.find((e) => e.id === id)?.nom ?? "?";
  const annoncer = (ok: boolean, t: string) => { setMsg({ ok, t }); setTimeout(() => setMsg(null), 5000); };

  const appeler = async (cle: string, url: string, method: string, body: unknown, succes: string) => {
    setBusy(cle);
    try {
      const res = await fetchApi(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { annoncer(false, json.error ?? `Erreur ${res.status}`); return false; }
      annoncer(true, succes);
      await charger();
      return true;
    } finally { setBusy(null); }
  };

  const envoyerInvitation = async () => {
    const ok = await appeler("invite", "/api/admin/acces", "POST",
      { email: invite.email, nom: invite.nom, role: invite.role, etablissements: invite.etablissements },
      `Invitation envoyée à ${invite.email}`);
    if (ok) setInvite({ ouvert: false, email: "", nom: "", role: "equipier", etablissements: [] });
  };

  const enregistrer = async (c: Compte) => {
    const ok = await appeler(c.id, `/api/admin/acces/${c.id}`, "PATCH", brouillon, "Accès mis à jour");
    if (ok) setEdition(null);
  };

  const action = (c: Compte, a: "desactiver" | "reactiver" | "renvoyer") => {
    const nom = c.nom ?? c.email ?? "ce compte";
    if (a === "desactiver" && !confirm(`Désactiver ${nom} ? La connexion est bloquée et les sessions en cours sont coupées. Le compte n'est pas supprimé.`)) return;
    if (a === "reactiver" && !confirm(`Réactiver ${nom} ?`)) return;
    const succes = a === "desactiver" ? `${nom} désactivé` : a === "reactiver" ? `${nom} réactivé` : `Invitation renvoyée à ${c.email}`;
    appeler(c.id, `/api/admin/acces/${c.id}`, "POST", { action: a }, succes);
  };

  const choixEtabs = (sel: string[], set: (v: string[]) => void) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {etabs.map((e) => {
        const on = sel.includes(e.id);
        return (
          <button key={e.id} type="button" onClick={() => set(on ? sel.filter((x) => x !== e.id) : [...sel, e.id])}
            style={{ ...btn(on ? "#2D6A4F" : "#fff", on ? "#fff" : "#6f6a61"), fontWeight: 600 }}>
            {on ? "✓ " : ""}{e.nom}
          </button>
        );
      })}
    </div>
  );
  const choixRole = (val: string, set: (v: string) => void, desactive = false) => (
    <select style={inputSt} value={val} onChange={(e) => set(e.target.value)} disabled={desactive}>
      {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
    </select>
  );

  const visibles = comptes.filter((c) => voirDesactives || c.statut !== "desactive");
  const nbDesactives = comptes.filter((c) => c.statut === "desactive").length;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "16px 16px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, margin: 0 }}>Accès de l&apos;équipe</h1>
          <button type="button" style={btn("#D4775A")} onClick={() => setInvite((p) => ({ ...p, ouvert: !p.ouvert }))}>
            Inviter un employé
          </button>
        </div>

        {msg && (
          <div style={{ ...card, padding: 10, fontSize: 13, fontWeight: 600, color: msg.ok ? "#2D6A4F" : "#DC2626", borderColor: msg.ok ? "#2D6A4F40" : "#DC262640" }}>{msg.t}</div>
        )}

        {invite.ouvert && (
          <div style={card}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Nouvelle invitation</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 10 }}>
              <input style={inputSt} type="email" placeholder="E-mail" value={invite.email} onChange={(e) => setInvite((p) => ({ ...p, email: e.target.value }))} />
              <input style={inputSt} placeholder="Prénom Nom" value={invite.nom} onChange={(e) => setInvite((p) => ({ ...p, nom: e.target.value }))} />
              {choixRole(invite.role, (v) => setInvite((p) => ({ ...p, role: v })))}
            </div>
            <div style={{ fontSize: 12, color: "#6f6a61", marginBottom: 6 }}>Établissement(s)</div>
            {choixEtabs(invite.etablissements, (v) => setInvite((p) => ({ ...p, etablissements: v })))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="button" style={{ ...btn("#1a1a1a"), opacity: busy === "invite" || !invite.email || invite.etablissements.length === 0 ? 0.5 : 1 }}
                disabled={busy === "invite" || !invite.email || invite.etablissements.length === 0} onClick={envoyerInvitation}>
                {busy === "invite" ? "Envoi…" : "Envoyer l'invitation"}
              </button>
              <button type="button" style={btn("#fff", "#6f6a61")} onClick={() => setInvite((p) => ({ ...p, ouvert: false }))}>Annuler</button>
            </div>
          </div>
        )}

        {loading ? <div style={{ color: "#999", padding: 20 }}>Chargement…</div> : (
          <>
            {visibles.map((c) => {
              const soi = c.id === moi;
              const enEdition = edition === c.id;
              return (
                <div key={c.id} style={{ ...card, opacity: c.statut === "desactive" ? 0.65 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{c.nom ?? c.email}{soi && <span style={{ color: "#999", fontWeight: 500 }}> (vous)</span>}</div>
                      <div style={{ fontSize: 12, color: "#6f6a61", overflow: "hidden", textOverflow: "ellipsis" }}>{c.email}</div>
                      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                        {c.statut === "invitation" ? `Invité le ${fmt(c.invite_le)}` : `Dernière connexion : ${fmt(c.derniere_connexion)}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={badge("#f3efe7", "#1a1a1a")}>{libRole(c.role)}</span>
                      {c.etablissements.map((e) => <span key={e} style={badge("#f3efe7", "#6f6a61")}>{nomEtab(e)}</span>)}
                      {c.statut === "invitation" && <span style={badge("rgba(180,83,9,0.12)", "#b45309")}>Invitation en attente</span>}
                      {c.statut === "desactive" && <span style={badge("rgba(220,38,38,0.10)", "#DC2626")}>Désactivé</span>}
                    </div>
                  </div>

                  {enEdition ? (
                    <div style={{ marginTop: 12, borderTop: "1px solid #ece6db", paddingTop: 12 }}>
                      <div style={{ fontSize: 12, color: "#6f6a61", marginBottom: 6 }}>Rôle{soi && " (vous ne pouvez pas changer votre propre rôle)"}</div>
                      <div style={{ maxWidth: 260, marginBottom: 10 }}>{choixRole(brouillon.role, (v) => setBrouillon((p) => ({ ...p, role: v })), soi)}</div>
                      <div style={{ fontSize: 12, color: "#6f6a61", marginBottom: 6 }}>Établissement(s)</div>
                      {choixEtabs(brouillon.etablissements, (v) => setBrouillon((p) => ({ ...p, etablissements: v })))}
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button type="button" style={{ ...btn("#1a1a1a"), opacity: busy === c.id || brouillon.etablissements.length === 0 ? 0.5 : 1 }}
                          disabled={busy === c.id || brouillon.etablissements.length === 0} onClick={() => enregistrer(c)}>Enregistrer</button>
                        <button type="button" style={btn("#fff", "#6f6a61")} onClick={() => setEdition(null)}>Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      {c.statut !== "desactive" && (
                        <button type="button" style={btn("#fff", "#1a1a1a")} disabled={busy === c.id}
                          onClick={() => { setEdition(c.id); setBrouillon({ role: c.role ?? "equipier", etablissements: c.etablissements }); }}>
                          Modifier
                        </button>
                      )}
                      {c.statut === "invitation" && (
                        <button type="button" style={btn("#fff", "#b45309")} disabled={busy === c.id} onClick={() => action(c, "renvoyer")}>
                          Renvoyer l&apos;invitation
                        </button>
                      )}
                      {c.statut !== "desactive" && !soi && (
                        <button type="button" style={btn("#fff", "#DC2626")} disabled={busy === c.id} onClick={() => action(c, "desactiver")}>Désactiver</button>
                      )}
                      {c.statut === "desactive" && (
                        <button type="button" style={btn("#fff", "#2D6A4F")} disabled={busy === c.id} onClick={() => action(c, "reactiver")}>Réactiver</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {nbDesactives > 0 && (
              <button type="button" style={{ ...btn("#fff", "#6f6a61"), marginBottom: 16 }} onClick={() => setVoirDesactives((v) => !v)}>
                {voirDesactives ? "Masquer" : "Afficher"} les comptes désactivés ({nbDesactives})
              </button>
            )}

            <div style={{ ...card, marginTop: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Derniers changements</div>
              {journal.length === 0 ? <div style={{ fontSize: 13, color: "#999" }}>Aucun changement enregistré.</div> : journal.map((j, i) => (
                <div key={i} style={{ fontSize: 12.5, padding: "6px 0", borderTop: i ? "1px solid #f3efe7" : "none" }}>
                  <span style={{ color: "#999" }}>{fmt(j.fait_le)}</span> — <b>{ACTIONS[j.action] ?? j.action}</b> : {j.cible_nom ?? j.cible_email ?? "?"}
                  {j.action === "role" && <> ({libRole(String(j.avant?.role ?? ""))} → {libRole(String(j.apres?.role ?? ""))})</>}
                  {j.action === "etablissements" && <> ({((j.apres?.etablissements as string[]) ?? []).map(nomEtab).join(", ")})</>}
                  {j.par_nom && <span style={{ color: "#999" }}> · par {j.par_nom}</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </RequireRole>
  );
}

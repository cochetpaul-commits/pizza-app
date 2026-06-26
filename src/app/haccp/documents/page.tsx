"use client";

import { useCallback, useEffect, useState } from "react";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RequireRole } from "@/components/RequireRole";
import { T } from "@/lib/tokens";
import {
  FormSection,
  HaccpPageShell,
  StatusBanner,
  TextField
} from "@/components/haccp/FormBlocks";
import { addReading, currentUserName } from "@/lib/haccp";
import { supabase } from "@/lib/supabaseClient";

// Index documentaire (PMS, protocoles, attestations, bons de passage…).
// v0.2 : on stocke le titre + le type + un lien (URL ou data:) comme un
// Reading "documents". L'upload vers Supabase Storage sera l'étape suivante.

const DOC_TYPES = [
  "Plan de maîtrise sanitaire",
  "Protocole de nettoyage",
  "Bon de passage nuisibles",
  "Bon de passage maintenance",
  "Formation HACCP",
  "Analyse / audit"
];

interface DocRow {
  id: string;
  at: string;
  subject: string;
  meta: Record<string, unknown> | null;
}

export default function DocumentsPage() {
  const { current } = useEtablissement();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState(DOC_TYPES[0]);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [userName, setUserName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentUserName().then(setUserName);
  }, []);

  const refresh = useCallback(async () => {
    if (!current?.id) {
      setDocs([]);
      return;
    }
    const { data, error } = await supabase
      .from("haccp_readings")
      .select("id, at, subject, meta")
      .eq("etablissement_id", current.id)
      .eq("module", "documents")
      .order("at", { ascending: false });
    if (error) console.warn("[haccp/documents] fetch", error.message);
    setDocs((data as DocRow[]) ?? []);
  }, [current?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function add() {
    if (!current?.id || !title) return;
    setBusy(true);
    try {
      await addReading({
        etablissement_id: current.id,
        module: "documents",
        subject: title,
        conform: true,
        by_name: userName || "—",
        source: "manual",
        meta: { type, url: url || "" }
      });
      setTitle("");
      setUrl("");
      setAdding(false);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireRole>
      <HaccpPageShell title="Documents">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement pour gérer ses documents.
          </StatusBanner>
        ) : (
          <FormSection
            title={`Documents enregistrés (${docs.length})`}
            right={
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 800,
                  color: T.terracotta,
                  textDecoration: "underline",
                  cursor: "pointer"
                }}
              >
                {adding ? "Annuler" : "+ Ajouter"}
              </button>
            }
          >
            {adding && (
              <div
                style={{
                  background: "#fff",
                  border: `1px solid ${T.border}`,
                  borderRadius: 16,
                  padding: 12,
                  marginBottom: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8
                }}
              >
                <TextField value={title} onChange={setTitle} placeholder="Titre du document" />
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  style={{
                    background: "#fff",
                    border: `1px solid ${T.border}`,
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontSize: 14,
                    fontWeight: 700,
                    color: T.dark,
                    fontFamily: "inherit"
                  }}
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <TextField value={url} onChange={setUrl} placeholder="Lien (https://…)" />
                <button
                  type="button"
                  onClick={add}
                  disabled={!title || busy}
                  style={{
                    background: T.dark,
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: !title || busy ? "not-allowed" : "pointer",
                    opacity: !title || busy ? 0.4 : 1
                  }}
                >
                  {busy ? "…" : "Enregistrer"}
                </button>
              </div>
            )}

            {docs.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: T.muted,
                  background: "#fff",
                  border: `1px solid ${T.border}`,
                  borderRadius: 16,
                  padding: 14,
                  margin: 0
                }}
              >
                Aucun document pour l&apos;instant.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  background: "#fff",
                  border: `1px solid ${T.border}`,
                  borderRadius: 16,
                  overflow: "hidden"
                }}
              >
                {docs.map((d, idx) => {
                  const docType = String((d.meta as Record<string, unknown> | null)?.type ?? "");
                  const docUrl = String((d.meta as Record<string, unknown> | null)?.url ?? "");
                  return (
                    <li
                      key={d.id}
                      style={{
                        padding: 12,
                        borderTop: idx === 0 ? "none" : `1px solid ${T.border}`
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 8
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: T.dark }}>
                            {d.subject}
                          </div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                            {docType} · {new Date(d.at).toLocaleDateString("fr-FR")}
                          </div>
                        </div>
                        {docUrl && (
                          <a
                            href={docUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: T.terracotta,
                              textDecoration: "underline"
                            }}
                          >
                            Ouvrir
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </FormSection>
        )}
      </HaccpPageShell>
    </RequireRole>
  );
}

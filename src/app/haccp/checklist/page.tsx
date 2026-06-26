"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RequireRole } from "@/components/RequireRole";
import { T } from "@/lib/tokens";
import {
  DateTimeRow,
  FormSection,
  HaccpPageShell,
  SaveBar,
  StatusBanner,
  TextField
} from "@/components/haccp/FormBlocks";
import { addReading, currentUserName } from "@/lib/haccp";

// Grille d'audit interne par défaut. À éditer dans le backoffice plus tard.
// Inspirée des grilles Mérieux NutriSciences / ouverture-fermeture restauration.
const DEFAULT_CHECKLIST = [
  { id: "tenue",        label: "Tenue de travail propre & charlotte" },
  { id: "mains",        label: "Mains lavées & ongles courts" },
  { id: "lave_mains",   label: "Lave-mains opérationnel (savon, essuie-main)" },
  { id: "plan_travail", label: "Plans de travail désinfectés" },
  { id: "frigo_marche", label: "Frigos en marche, T°C conforme" },
  { id: "stocks_dlc",   label: "DLC stocks vérifiées, FIFO respecté" },
  { id: "poubelles",    label: "Poubelles vidées, sacs neufs" },
  { id: "nuisibles",    label: "Aucune trace de nuisibles" },
  { id: "huile",        label: "Huile friteuse non saturée" },
  { id: "planning",     label: "Planning du jour affiché" }
];

type ItemValue = "yes" | "no" | "na" | null;

const BUTTONS: { v: NonNullable<ItemValue>; label: string; bg: string; fg: string }[] = [
  { v: "yes", label: "OK",  bg: "rgba(34,197,94,.12)", fg: T.green },
  { v: "no",  label: "NOK", bg: "rgba(226,127,87,.12)", fg: T.terracotta },
  { v: "na",  label: "NA",  bg: "#fff", fg: T.muted }
];

export default function ChecklistPage() {
  const { current } = useEtablissement();
  const router = useRouter();
  const [date, setDate] = useState(todayDate());
  const [time, setTime] = useState(nowTime());
  const [answers, setAnswers] = useState<Record<string, ItemValue>>({});
  const [note, setNote] = useState("");
  const [userName, setUserName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentUserName().then(setUserName);
  }, []);

  const { score, total } = useMemo(() => {
    let s = 0;
    let t = 0;
    for (const item of DEFAULT_CHECKLIST) {
      const v = answers[item.id];
      if (v === "yes") {
        s++;
        t++;
      } else if (v === "no") {
        t++;
      }
    }
    return { score: s, total: t };
  }, [answers]);

  const answered = Object.values(answers).filter((v) => v != null).length;
  const conform = total > 0 && score === total;
  const valid = answered === DEFAULT_CHECKLIST.length;

  async function save() {
    if (!current?.id || !valid) return;
    setBusy(true);
    try {
      const at = new Date(`${date}T${time || "00:00"}:00`).toISOString();
      await addReading({
        etablissement_id: current.id,
        module: "checklist",
        subject: "Checklist hygiène",
        value: total > 0 ? Math.round((score / total) * 100) : null,
        unit: "%",
        conform,
        at,
        by_name: userName || "—",
        note: note || null,
        source: "manual",
        meta: {
          score: `${score}/${total}`,
          answers: JSON.stringify(answers)
        }
      });
      router.push("/haccp");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireRole>
      <HaccpPageShell title="Checklist">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement pour lancer une checklist.
          </StatusBanner>
        ) : (
          <>
            <FormSection title="Date de l'audit">
              <DateTimeRow date={date} time={time} onDate={setDate} onTime={setTime} />
            </FormSection>

            <FormSection title="Ma checklist hygiène">
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
                {DEFAULT_CHECKLIST.map((item, idx) => (
                  <li
                    key={item.id}
                    style={{
                      padding: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      borderTop: idx === 0 ? "none" : `1px solid ${T.border}`
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.dark, flex: 1 }}>
                      {item.label}
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {BUTTONS.map((b) => {
                        const active = answers[item.id] === b.v;
                        return (
                          <button
                            key={b.v}
                            type="button"
                            onClick={() =>
                              setAnswers((a) => ({ ...a, [item.id]: b.v }))
                            }
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              fontSize: 11,
                              fontWeight: 800,
                              background: b.bg,
                              color: b.fg,
                              border: `1px solid ${active ? b.fg : T.border}`,
                              opacity: active ? 1 : 0.55,
                              cursor: "pointer",
                              transition: "all 0.15s ease"
                            }}
                          >
                            {b.label}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: 999,
                    background: "rgba(62,123,251,.12)",
                    color: "#3E7BFB",
                    fontSize: 12,
                    fontWeight: 800
                  }}
                >
                  {answered} / {DEFAULT_CHECKLIST.length} répondus
                </span>
                {total > 0 && (
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: 999,
                      background: conform ? "rgba(34,197,94,.12)" : "rgba(226,127,87,.12)",
                      color: conform ? T.green : T.terracotta,
                      fontSize: 12,
                      fontWeight: 800
                    }}
                  >
                    Score {score}/{total}
                  </span>
                )}
              </div>
            </FormSection>

            <FormSection title="Commentaire">
              <TextField value={note} onChange={setNote} multiline placeholder="Observations…" />
            </FormSection>
          </>
        )}

        {current?.id && (
          <SaveBar
            onSave={save}
            label="Enregistrer la checklist"
            disabled={!valid}
            busy={busy}
            hint={!valid ? "Réponds à tous les items pour valider." : undefined}
          />
        )}
      </HaccpPageShell>
    </RequireRole>
  );
}

const todayDate = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

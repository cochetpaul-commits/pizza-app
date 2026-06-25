"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEtablissement } from "@/lib/EtablissementContext";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";
import {
  DateTimeRow,
  FormSection,
  HaccpPageShell,
  SaveBar,
  StatusBanner
} from "@/components/haccp/FormBlocks";
import {
  addReadings,
  currentUserName,
  fetchCleaningTasks,
  type CleaningTask
} from "@/lib/haccp";

const FREQ_LABEL: Record<CleaningTask["frequency"], string> = {
  day: "Quotidien",
  week: "Hebdomadaire",
  month: "Mensuel"
};

const FREQ_TONE: Record<CleaningTask["frequency"], { bg: string; fg: string }> = {
  day: { bg: "rgba(226,127,87,.12)", fg: T.terracotta },
  week: { bg: "rgba(168,137,58,.16)", fg: T.jauneDark },
  month: { bg: "rgba(37,99,235,.12)", fg: T.bleu }
};

export default function CleaningPage() {
  const { current } = useEtablissement();
  const router = useRouter();
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [date, setDate] = useState(todayDate());
  const [time, setTime] = useState(nowTime());
  const [filter, setFilter] = useState<CleaningTask["frequency"] | "all">("day");
  const [userName, setUserName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentUserName().then(setUserName);
  }, []);

  useEffect(() => {
    if (!current?.id) return;
    void fetchCleaningTasks(current.id).then(setTasks);
  }, [current?.id]);

  const shown = useMemo(
    () => (filter === "all" ? tasks : tasks.filter((t) => t.frequency === filter)),
    [tasks, filter]
  );
  const doneCount = shown.filter((t) => done[t.id]).length;

  function toggle(id: string) {
    setDone((d) => ({ ...d, [id]: !d[id] }));
  }

  async function save() {
    if (!current?.id) return;
    const picked = shown.filter((t) => done[t.id]);
    if (picked.length === 0) return;
    setBusy(true);
    try {
      const at = new Date(`${date}T${time || "00:00"}:00`).toISOString();
      await addReadings(
        picked.map((t) => ({
          etablissement_id: current.id,
          module: "cleaning" as const,
          subject: t.label,
          conform: true,
          at,
          by_name: userName || "—",
          source: "manual" as const,
          meta: {
            frequency: t.frequency,
            zone: t.zone,
            detail: t.detail ?? ""
          }
        }))
      );
      setDone({});
      router.push("/haccp");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireRole>
      <HaccpPageShell title="Plan de nettoyage">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement pour saisir des nettoyages.
          </StatusBanner>
        ) : (
          <>
            <FormSection title="Date de l'action">
              <DateTimeRow date={date} time={time} onDate={setDate} onTime={setTime} />
            </FormSection>

            <FormSection
              title="Tâches"
              right={
                <Link
                  href="/haccp/admin/cleaning"
                  style={{ fontSize: 12, fontWeight: 700, color: T.belloMio, textDecoration: "none" }}
                >
                  + Ajouter / modifier
                </Link>
              }
            >
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {(["day", "week", "month", "all"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      border: `1px solid ${filter === f ? T.belloMio : T.border}`,
                      background: filter === f ? `${T.belloMio}22` : "#fff",
                      color: filter === f ? T.belloMio : T.muted,
                      cursor: "pointer"
                    }}
                  >
                    {f === "all" ? "Toutes" : FREQ_LABEL[f]}
                  </button>
                ))}
              </div>

              {tasks.length === 0 && (
                <StatusBanner tone="info">
                  Aucune tâche.{" "}
                  <Link href="/haccp/admin/cleaning" style={{ color: T.belloMio, fontWeight: 800 }}>
                    Ajoute-en une
                  </Link>
                  .
                </StatusBanner>
              )}

              {shown.map((t) => {
                const tone = FREQ_TONE[t.frequency];
                const checked = !!done[t.id];
                return (
                  <label
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      marginBottom: 8,
                      background: checked ? "rgba(34,197,94,.08)" : "#fff",
                      border: `1px solid ${checked ? T.green : T.border}`,
                      borderRadius: 14,
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(t.id)}
                      style={{ width: 22, height: 22, cursor: "pointer" }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: T.dark }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: T.muted }}>
                        {t.zone}
                        {t.detail ? ` · ${t.detail}` : ""}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: tone.bg,
                        color: tone.fg
                      }}
                    >
                      {FREQ_LABEL[t.frequency]}
                    </span>
                  </label>
                );
              })}
            </FormSection>
          </>
        )}

        {current?.id && (
          <SaveBar
            onSave={save}
            label={doneCount > 0 ? `Valider ${doneCount} tâche(s)` : "Coche au moins une tâche"}
            disabled={doneCount === 0}
            busy={busy}
          />
        )}
      </HaccpPageShell>
    </RequireRole>
  );
}

const todayDate = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

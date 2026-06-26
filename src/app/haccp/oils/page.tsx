"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RequireRole } from "@/components/RequireRole";
import { T } from "@/lib/tokens";
import {
  ChipGroup,
  DateTimeRow,
  FormSection,
  HaccpPageShell,
  NumberStepper,
  SaveBar,
  StatusBanner,
  TextField
} from "@/components/haccp/FormBlocks";
import { addReading, currentUserName } from "@/lib/haccp";

// Conformité huile friteuse : décret 86-857, composés polaires ≤ 25 %.
const MAX_POLAR = 25;
type Method = "languette" | "sonde" | "visuel";
type Action = "rien" | "completer" | "changer";

export default function OilsPage() {
  const { current } = useEtablissement();
  const router = useRouter();
  const [date, setDate] = useState(todayDate());
  const [time, setTime] = useState(nowTime());
  const [equipment, setEquipment] = useState("Friteuse");
  const [method, setMethod] = useState<Method>("languette");
  const [polar, setPolar] = useState<number | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [userName, setUserName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentUserName().then(setUserName);
  }, []);

  const conform =
    method === "visuel" ? action !== "changer" : polar != null && polar <= MAX_POLAR;
  const valid = !!equipment && action !== null && (method === "visuel" || polar != null);

  async function save() {
    if (!current?.id || !valid) return;
    setBusy(true);
    try {
      const at = new Date(`${date}T${time || "00:00"}:00`).toISOString();
      await addReading({
        etablissement_id: current.id,
        module: "oils",
        subject: equipment,
        value: polar ?? null,
        unit: polar != null ? "% CP" : null,
        conform,
        at,
        by_name: userName || "—",
        note: note || null,
        source: "manual",
        meta: { method, action: action as string }
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
      <HaccpPageShell title="Contrôle d'huile">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement pour enregistrer un contrôle d&apos;huile.
          </StatusBanner>
        ) : (
          <>
            <FormSection title="Date du relevé">
              <DateTimeRow date={date} time={time} onDate={setDate} onTime={setTime} />
            </FormSection>

            <FormSection title="Équipement">
              <TextField value={equipment} onChange={setEquipment} placeholder="Friteuse 1" />
            </FormSection>

            <FormSection title="Méthode de contrôle">
              <ChipGroup<Method>
                options={[
                  { value: "languette", label: "Languette" },
                  { value: "sonde", label: "Sonde" },
                  { value: "visuel", label: "Visuel" }
                ]}
                value={method}
                onChange={(v) => setMethod(v as Method)}
              />
            </FormSection>

            {method !== "visuel" && (
              <FormSection title="Composés polaires (% CP)">
                <NumberStepper value={polar} onChange={setPolar} step={1} unit="%" />
                {polar != null && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      fontWeight: 800,
                      borderRadius: 12,
                      padding: "8px 12px",
                      background:
                        polar <= MAX_POLAR ? "rgba(34,197,94,.12)" : "rgba(226,127,87,.12)",
                      color: polar <= MAX_POLAR ? T.green : T.terracotta
                    }}
                  >
                    {polar <= MAX_POLAR ? "✓ Sous la limite" : "✗ Au-dessus du seuil"} — max{" "}
                    {MAX_POLAR} % CP (décret 86-857)
                  </div>
                )}
              </FormSection>
            )}

            <FormSection title="Action suite au contrôle">
              <ChipGroup<Action>
                options={[
                  { value: "rien",      label: "Aucune" },
                  { value: "completer", label: "Complétée" },
                  { value: "changer",   label: "Changée" }
                ]}
                value={action}
                onChange={(v) => setAction(v as Action)}
              />
            </FormSection>

            <FormSection title="Commentaire">
              <TextField value={note} onChange={setNote} multiline placeholder="Observations…" />
            </FormSection>
          </>
        )}

        {current?.id && (
          <SaveBar
            onSave={save}
            label="Enregistrer le contrôle"
            disabled={!valid}
            busy={busy}
            hint={
              !valid
                ? "Équipement + action requis (et % CP si méthode languette/sonde)."
                : undefined
            }
          />
        )}
      </HaccpPageShell>
    </RequireRole>
  );
}

const todayDate = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

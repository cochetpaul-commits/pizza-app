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

// Référentiels HACCP — arrêté 21/12/2009 / GBPH restauration :
//   liaison_chaude     : ≥ +63 °C jusqu'au service
//   liaison_froide     : ≤ +3 °C dans les 2 h après cuisson
//   refroidissement    : passer de +63 °C à +10 °C en moins de 2 h
//   remise_temp        : ramener à ≥ +63 °C avant service
//   service_chaud      : T°C ≥ +63 °C au moment du service
type Operation =
  | "liaison_chaude"
  | "liaison_froide"
  | "refroidissement"
  | "remise_temp"
  | "service_chaud";

const OPERATIONS: { value: Operation; label: string; min?: number; max?: number; hint: string }[] = [
  { value: "liaison_chaude",  label: "Liaison chaude",  min: 63, hint: "Maintien ≥ +63 °C jusqu'au service." },
  { value: "liaison_froide",  label: "Liaison froide",  max: 3,  hint: "Mise à ≤ +3 °C dans les 2 h après cuisson." },
  { value: "refroidissement", label: "Refroidissement", max: 10, hint: "Passer de +63 °C à +10 °C en moins de 2 h." },
  { value: "remise_temp",     label: "Remise en T°C",   min: 63, hint: "Ramener à ≥ +63 °C avant service." },
  { value: "service_chaud",   label: "Service chaud",   min: 63, hint: "T°C ≥ +63 °C au moment du service." }
];

export default function ProductTempPage() {
  const { current } = useEtablissement();
  const router = useRouter();
  const [date, setDate] = useState(todayDate());
  const [time, setTime] = useState(nowTime());
  const [operation, setOperation] = useState<Operation | null>(null);
  const [product, setProduct] = useState("");
  const [value, setValue] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [userName, setUserName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentUserName().then(setUserName);
  }, []);

  const op = OPERATIONS.find((o) => o.value === operation);
  const conform =
    op && value != null
      ? (op.min == null || value >= op.min) && (op.max == null || value <= op.max)
      : false;
  const valid = !!op && !!product && value != null;

  async function save() {
    if (!current?.id || !valid) return;
    setBusy(true);
    try {
      const at = new Date(`${date}T${time || "00:00"}:00`).toISOString();
      await addReading({
        etablissement_id: current.id,
        module: "product_temp",
        subject: product,
        value: value ?? null,
        unit: "°C",
        conform,
        at,
        by_name: userName || "—",
        note: note || null,
        source: "manual",
        meta: { operation: operation as string }
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
      <HaccpPageShell title="T°C produit">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement pour enregistrer une T°C produit.
          </StatusBanner>
        ) : (
          <>
            <FormSection title="Date du contrôle">
              <DateTimeRow date={date} time={time} onDate={setDate} onTime={setTime} />
            </FormSection>

            <FormSection title="Type d'opération">
              <ChipGroup<Operation>
                options={OPERATIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={operation}
                onChange={(v) => setOperation(v as Operation)}
              />
              {op && (
                <p style={{ fontSize: 12, color: T.muted, marginTop: 8, fontStyle: "italic" }}>
                  {op.hint}
                </p>
              )}
            </FormSection>

            <FormSection title="Produit / préparation">
              <TextField value={product} onChange={setProduct} placeholder="Nom du produit" />
            </FormSection>

            <FormSection title="Température mesurée (°C)">
              <NumberStepper value={value} onChange={setValue} unit="°C" />
              {op && value != null && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    borderRadius: 12,
                    padding: "8px 12px",
                    background: conform ? "rgba(34,197,94,.12)" : "rgba(226,127,87,.12)",
                    color: conform ? T.green : T.terracotta
                  }}
                >
                  {conform ? "✓ Conforme" : "✗ Hors plage"} —{" "}
                  {op.min != null && `min +${op.min} °C`}
                  {op.min != null && op.max != null && " / "}
                  {op.max != null && `max +${op.max} °C`}
                </div>
              )}
            </FormSection>

            <FormSection title="Commentaire">
              <TextField value={note} onChange={setNote} multiline placeholder="Observations…" />
            </FormSection>
          </>
        )}

        {current?.id && (
          <SaveBar
            onSave={save}
            label="Enregistrer la T°C produit"
            disabled={!valid}
            busy={busy}
            hint={!valid ? "Type d'opération + produit + température requis." : undefined}
          />
        )}
      </HaccpPageShell>
    </RequireRole>
  );
}

const todayDate = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

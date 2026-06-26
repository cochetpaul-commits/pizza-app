"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RequireRole } from "@/components/RequireRole";
import { T } from "@/lib/tokens";
import {
  DateTimeRow,
  FormSection,
  HaccpPageShell,
  NumberStepper,
  SaveBar,
  StatusBanner,
  TextField
} from "@/components/haccp/FormBlocks";
import { addReading, currentUserName } from "@/lib/haccp";

// Fiche de production : traçabilité d'une recette fabriquée en cuisine.
// Le DLC secondaire est calculé à partir de la date de fabrication + durée
// de conservation choisie (3 j par défaut, ajustable).

export default function ProductionPage() {
  const { current } = useEtablissement();
  const router = useRouter();
  const [date, setDate] = useState(todayDate());
  const [time, setTime] = useState(nowTime());
  const [recipe, setRecipe] = useState("");
  const [lot, setLot] = useState("");
  const [qty, setQty] = useState<number | null>(null);
  const [coreTemp, setCoreTemp] = useState<number | null>(null);
  const [shelfDays, setShelfDays] = useState<number>(3);
  const [ingredients, setIngredients] = useState("");
  const [userName, setUserName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentUserName().then(setUserName);
  }, []);

  const dlc = computeDLC(date, shelfDays);
  const valid = !!recipe && !!lot;

  async function save() {
    if (!current?.id || !valid) return;
    setBusy(true);
    try {
      const at = new Date(`${date}T${time || "00:00"}:00`).toISOString();
      await addReading({
        etablissement_id: current.id,
        module: "production",
        subject: recipe,
        value: qty ?? null,
        unit: qty != null ? "pcs" : null,
        conform: coreTemp == null || coreTemp >= 63,
        at,
        by_name: userName || "—",
        source: "manual",
        meta: {
          lot,
          dlc,
          shelf_days: shelfDays,
          ...(coreTemp != null ? { core_c: coreTemp } : {}),
          ingredients: ingredients || ""
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
      <HaccpPageShell title="Production">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement pour enregistrer une fiche de production.
          </StatusBanner>
        ) : (
          <>
            <FormSection title="Date de fabrication">
              <DateTimeRow date={date} time={time} onDate={setDate} onTime={setTime} />
            </FormSection>

            <FormSection title="Recette / produit fabriqué">
              <TextField value={recipe} onChange={setRecipe} placeholder="ex. Sauce tomate maison" />
            </FormSection>

            <FormSection title="Lot">
              <TextField value={lot} onChange={setLot} placeholder="N° de lot interne" />
            </FormSection>

            <FormSection title="Quantité produite">
              <NumberStepper value={qty} onChange={setQty} step={1} />
            </FormSection>

            <FormSection title="T°C à cœur (°C)">
              <NumberStepper value={coreTemp} onChange={setCoreTemp} unit="°C" />
              {coreTemp != null && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    borderRadius: 12,
                    padding: "8px 12px",
                    background: coreTemp >= 63 ? "rgba(34,197,94,.12)" : "rgba(226,127,87,.12)",
                    color: coreTemp >= 63 ? T.green : T.terracotta
                  }}
                >
                  {coreTemp >= 63 ? "✓ ≥ +63 °C" : "✗ < +63 °C"} — cible cuisson liaison chaude
                </div>
              )}
            </FormSection>

            <FormSection title="Durée de conservation (jours)">
              <NumberStepper value={shelfDays} onChange={(v) => setShelfDays(v ?? 3)} step={1} />
              <p style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>
                DLC secondaire calculée : <b style={{ color: T.dark }}>{dlc}</b>
              </p>
            </FormSection>

            <FormSection title="Ingrédients (traçabilité)">
              <TextField
                value={ingredients}
                onChange={setIngredients}
                multiline
                placeholder="Lister les ingrédients & lots utilisés"
              />
            </FormSection>
          </>
        )}

        {current?.id && (
          <SaveBar
            onSave={save}
            label="Enregistrer la production"
            disabled={!valid}
            busy={busy}
            hint={!valid ? "Recette + lot requis." : undefined}
          />
        )}
      </HaccpPageShell>
    </RequireRole>
  );
}

function computeDLC(startDate: string, shelfDays: number): string {
  const d = new Date(startDate);
  d.setDate(d.getDate() + shelfDays);
  return d.toLocaleDateString("fr-FR");
}

const todayDate = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

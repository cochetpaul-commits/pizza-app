"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RequireRole } from "@/components/RequireRole";
import {
  ChipGroup,
  ConformityPicker,
  DateTimeRow,
  FormSection,
  HaccpPageShell,
  NumberStepper,
  SaveBar,
  StatusBanner,
  TextField
} from "@/components/haccp/FormBlocks";
import { addReading, currentUserName } from "@/lib/haccp";

type Category = "frais" | "surgele" | "sec" | "autres";

export default function ReceptionPage() {
  const { current } = useEtablissement();
  const router = useRouter();
  const [date, setDate] = useState(todayDate());
  const [time, setTime] = useState(nowTime());
  const [reference, setReference] = useState("");
  const [supplier, setSupplier] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [state, setState] = useState<"conform" | "nonconform" | null>(null);
  const [tempFresh, setTempFresh] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [userName, setUserName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentUserName().then(setUserName);
  }, []);

  const valid = !!supplier && categories.length > 0 && state !== null;

  async function save() {
    if (!current?.id || !valid) return;
    setBusy(true);
    try {
      const at = new Date(`${date}T${time || "00:00"}:00`).toISOString();
      await addReading({
        etablissement_id: current.id,
        module: "reception",
        subject: supplier,
        value: tempFresh ?? null,
        unit: tempFresh != null ? "°C" : null,
        conform: state === "conform",
        at,
        by_name: userName || "—",
        note: comment || null,
        source: "manual",
        meta: {
          reference: reference || "",
          categories: categories.join(","),
          ...(tempFresh != null ? { fresh_c: tempFresh } : {})
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
      <HaccpPageShell title="Contrôle à réception">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement pour enregistrer une réception.
          </StatusBanner>
        ) : (
          <>
            <FormSection title="Date du contrôle">
              <DateTimeRow date={date} time={time} onDate={setDate} onTime={setTime} />
            </FormSection>

            <FormSection title="Référence (bon de livraison / facture)">
              <TextField value={reference} onChange={setReference} placeholder="N° BL ou facture" />
            </FormSection>

            <FormSection title="Fournisseur">
              <TextField value={supplier} onChange={setSupplier} placeholder="Nom du fournisseur" />
            </FormSection>

            <FormSection title="Catégories de produits concernées">
              <ChipGroup<Category>
                multi
                options={[
                  { value: "frais", label: "Frais" },
                  { value: "surgele", label: "Surgelé" },
                  { value: "sec", label: "Sec" },
                  { value: "autres", label: "Autres" }
                ]}
                value={categories}
                onChange={(v) => setCategories(v as Category[])}
              />
            </FormSection>

            <FormSection title="État de la livraison">
              <ConformityPicker value={state} onChange={setState} />
            </FormSection>

            {categories.includes("frais") && (
              <FormSection title="Température produits frais (°C)">
                <NumberStepper value={tempFresh} onChange={setTempFresh} unit="°C" />
              </FormSection>
            )}

            <FormSection title="Commentaire">
              <TextField value={comment} onChange={setComment} multiline placeholder="Observations…" />
            </FormSection>
          </>
        )}

        {current?.id && (
          <SaveBar
            onSave={save}
            label="Enregistrer la réception"
            disabled={!valid}
            busy={busy}
            hint={!valid ? "Fournisseur + catégories + état de la livraison requis." : undefined}
          />
        )}
      </HaccpPageShell>
    </RequireRole>
  );
}

const todayDate = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

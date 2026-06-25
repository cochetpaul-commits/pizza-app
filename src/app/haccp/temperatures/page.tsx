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
  NumberStepper,
  SaveBar,
  StatusBanner
} from "@/components/haccp/FormBlocks";
import {
  addReadings,
  currentUserName,
  fetchEquipments,
  fmtC,
  isConform,
  rangeLabel,
  type Equipment
} from "@/lib/haccp";

interface Row {
  on: boolean;
  value: number;
}

export default function TemperaturesPage() {
  const { current } = useEtablissement();
  const router = useRouter();
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [zone, setZone] = useState<string>("Tous");
  const [date, setDate] = useState(todayDate());
  const [time, setTime] = useState(nowTime());
  const [busy, setBusy] = useState(false);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    void currentUserName().then(setUserName);
  }, []);

  useEffect(() => {
    if (!current?.id) return;
    void fetchEquipments(current.id).then((list) => {
      setEquipments(list);
      setRows((prev) => {
        const next = { ...prev };
        for (const eq of list) {
          if (!next[eq.id]) next[eq.id] = { on: false, value: Number(eq.default_c) };
        }
        return next;
      });
    });
  }, [current?.id]);

  const zones = useMemo(
    () => ["Tous", ...Array.from(new Set(equipments.map((e) => e.zone)))],
    [equipments]
  );
  const shown = equipments.filter((e) => zone === "Tous" || e.zone === zone);

  const toggle = (id: string) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], on: !r[id]?.on } }));
  const bump = (id: string, d: number) =>
    setRows((r) => ({
      ...r,
      [id]: { ...r[id], value: round(r[id].value + d * 0.5) }
    }));

  const pickedCount = Object.values(rows).filter((r) => r.on).length;

  async function save() {
    if (!current?.id) return;
    const picked = equipments.filter((e) => rows[e.id]?.on);
    if (picked.length === 0) return;
    setBusy(true);
    try {
      const at = new Date(`${date}T${time || "00:00"}:00`).toISOString();
      await addReadings(
        picked.map((e) => {
          const v = rows[e.id].value;
          const ok = isConform(e, v);
          return {
            etablissement_id: current.id,
            module: "temperatures" as const,
            subject: e.name,
            value: v,
            unit: "°C",
            conform: ok,
            at,
            by_name: userName || "—",
            note: ok ? null : "Hors plage — action corrective requise",
            source: "manual" as const
          };
        })
      );
      setRows((r) => {
        const n = { ...r };
        for (const e of picked) n[e.id] = { on: false, value: Number(e.default_c) };
        return n;
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
      <HaccpPageShell title="Températures">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement dans le sélecteur du haut pour saisir des relevés.
          </StatusBanner>
        ) : (
          <>
            <FormSection title="Date du relevé">
              <DateTimeRow date={date} time={time} onDate={setDate} onTime={setTime} />
            </FormSection>

            <FormSection
              title="Équipements"
              right={
                <Link
                  href="/haccp/admin/equipments"
                  style={{ fontSize: 12, fontWeight: 700, color: T.belloMio, textDecoration: "none" }}
                >
                  + Ajouter / modifier
                </Link>
              }
            >
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {zones.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZone(z)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      border: `1px solid ${zone === z ? T.belloMio : T.border}`,
                      background: zone === z ? `${T.belloMio}22` : "#fff",
                      color: zone === z ? T.belloMio : T.muted,
                      cursor: "pointer"
                    }}
                  >
                    {z}
                  </button>
                ))}
              </div>

              {equipments.length === 0 && (
                <StatusBanner tone="info">
                  Aucun équipement.{" "}
                  <Link href="/haccp/admin/equipments" style={{ color: T.belloMio, fontWeight: 800 }}>
                    Ajoute-en un
                  </Link>
                  .
                </StatusBanner>
              )}

              {shown.map((eq) => {
                const row = rows[eq.id] ?? { on: false, value: Number(eq.default_c) };
                const ok = isConform(eq, row.value);
                return (
                  <div
                    key={eq.id}
                    style={{
                      background: row.on ? (ok ? "rgba(34,197,94,.06)" : "rgba(226,127,87,.06)") : "#fff",
                      border: `1px solid ${row.on ? (ok ? T.green : T.terracotta) : T.border}`,
                      borderRadius: 14,
                      padding: 12,
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 12
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={row.on}
                      onChange={() => toggle(eq.id)}
                      style={{ width: 22, height: 22, cursor: "pointer" }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: T.dark }}>{eq.name}</div>
                      <div style={{ fontSize: 11, color: T.muted }}>
                        {eq.zone} · plage {rangeLabel(eq)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => bump(eq.id, -1)}
                      style={stepperBtn}
                    >
                      −
                    </button>
                    <div
                      style={{
                        minWidth: 76,
                        textAlign: "center",
                        fontWeight: 800,
                        fontSize: 14,
                        color: row.on ? (ok ? T.green : T.terracotta) : T.dark
                      }}
                    >
                      {fmtC(row.value)}
                    </div>
                    <button
                      type="button"
                      onClick={() => bump(eq.id, +1)}
                      style={stepperBtn}
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </FormSection>
          </>
        )}

        {current?.id && (
          <SaveBar
            onSave={save}
            label={pickedCount > 0 ? `Enregistrer ${pickedCount} relevé(s)` : "Sélectionne au moins un équipement"}
            disabled={pickedCount === 0}
            busy={busy}
          />
        )}
      </HaccpPageShell>
    </RequireRole>
  );
}

const stepperBtn = {
  width: 38,
  height: 38,
  borderRadius: 10,
  background: "#fff",
  border: `1px solid ${T.border}`,
  fontSize: 18,
  fontWeight: 800,
  color: T.dark,
  cursor: "pointer"
} as const;

const todayDate = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const round = (v: number) => Math.round(v * 10) / 10;

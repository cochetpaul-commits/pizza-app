"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useEtablissement } from "@/lib/EtablissementContext";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";
import {
  ChipGroup,
  FormSection,
  HaccpPageShell,
  NumberStepper,
  StatusBanner,
  TextField
} from "@/components/haccp/FormBlocks";
import {
  addReading,
  currentUserName,
  fetchProducts,
  type Product
} from "@/lib/haccp";

type LabelKind = "fait" | "ouvert" | "decongele";
const KINDS: { value: LabelKind; label: string; shelfDaysBase?: number }[] = [
  { value: "fait", label: "Fait" },
  { value: "ouvert", label: "Ouvert", shelfDaysBase: 3 },
  { value: "decongele", label: "Décongelé", shelfDaysBase: 1 }
];

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export default function LabellerPage() {
  const { current } = useEtablissement();
  const _router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [kind, setKind] = useState<LabelKind>("fait");
  const [productId, setProductId] = useState("");
  const [lot, setLot] = useState("");
  const [operator, setOperator] = useState("");
  const [madeAt] = useState(() => new Date());
  const [shelfDays, setShelfDays] = useState(3);

  useEffect(() => {
    void currentUserName().then(setOperator);
  }, []);

  useEffect(() => {
    if (!current?.id) return;
    void fetchProducts(current.id).then(setProducts);
  }, [current?.id]);

  const product = products.find((p) => p.id === productId);
  const baseDays = KINDS.find((k) => k.value === kind)?.shelfDaysBase;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShelfDays(baseDays ?? product?.shelf_life_days ?? 3);
  }, [baseDays, product?.shelf_life_days]);

  const useBy = useMemo(() => {
    const d = new Date(madeAt);
    d.setDate(d.getDate() + shelfDays);
    return d;
  }, [madeAt, shelfDays]);

  const day = DAY_LABELS[madeAt.getDay()];
  const valid = !!product;

  async function recordPrint(printer: string) {
    if (!current?.id || !product) return;
    await addReading({
      etablissement_id: current.id,
      module: "labels",
      subject: product.name,
      conform: true,
      by_name: operator || "—",
      source: "manual",
      meta: {
        kind,
        lot: lot || "",
        made_at: fmtDate(madeAt),
        use_by: fmtDate(useBy),
        day_label: day,
        printer
      }
    });
  }

  async function printA4() {
    if (!product) return;
    const html = labelHtml({
      productName: product.name,
      kind: KINDS.find((k) => k.value === kind)?.label ?? "",
      madeAt: fmtDate(madeAt),
      useBy: fmtDate(useBy),
      lot,
      operator,
      day
    });
    const w = window.open("", "_blank", "width=420,height=340");
    if (!w) return alert("La fenêtre d'impression a été bloquée par le navigateur.");
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 200);
    await recordPrint("a4");
  }

  async function printBLE() {
    if (!product) return;
    if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
      alert(
        "Ton navigateur ne supporte pas Web Bluetooth. Utilise Chrome / Edge desktop ou Chrome Android."
      );
      return;
    }
    try {
      // Web Bluetooth n'est pas typé par défaut dans pizza-app — on tape
      // ce qu'on utilise localement (l'install de @types/web-bluetooth
      // pourra remplacer ça plus tard).
      const bt = (navigator as Navigator & {
        bluetooth: {
          requestDevice: (opts: unknown) => Promise<{
            name?: string;
            gatt?: { connect: () => Promise<unknown> };
          }>;
        };
      }).bluetooth;
      const device = await bt.requestDevice({
        filters: [
          { namePrefix: "SLP72" },
          { namePrefix: "SII" },
          { namePrefix: "Seiko" },
          { namePrefix: "SmartLabel" }
        ],
        optionalServices: ["00001800-0000-1000-8000-00805f9b34fb"]
      });
      await device.gatt?.connect();
      // TODO : la trame d'octets exacte du SDK Seiko SLP721 sera ajoutée
      // après la phase de test avec la doc constructeur. Pour l'instant on
      // log + enregistre l'impression.
      console.info("[labels] connected to", device.name);
      await recordPrint(`seiko:${device.name ?? "unknown"}`);
      alert(
        `Connecté à "${device.name}". La séquence d'impression sera ajoutée à la prochaine itération (doc Seiko nécessaire).`
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Impression annulée");
    }
  }

  return (
    <RequireRole>
      <HaccpPageShell title="Étiqueteuse">
        {!current?.id ? (
          <StatusBanner tone="info">Choisis un établissement.</StatusBanner>
        ) : (
          <>
            <FormSection title="Type d'étiquette">
              <ChipGroup<LabelKind>
                options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
                value={kind}
                onChange={(v) => setKind(v as LabelKind)}
              />
            </FormSection>

            <FormSection title="Produit">
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                style={{
                  width: "100%",
                  background: "#fff",
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 14,
                  fontWeight: 700
                }}
              >
                <option value="">— Sélectionner —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FormSection>

            <FormSection title="N° de lot (optionnel)">
              <TextField value={lot} onChange={setLot} placeholder="L-46086-25-06" />
            </FormSection>

            <FormSection title="Préparé par">
              <TextField value={operator} onChange={setOperator} placeholder="Prénom / nom" />
            </FormSection>

            <FormSection title="Durée de conservation (jours)">
              <NumberStepper value={shelfDays} onChange={(v) => setShelfDays(v ?? 3)} step={1} />
              <p style={{ marginTop: 6, fontSize: 12, color: T.muted }}>
                DLC secondaire : <b style={{ color: T.dark }}>{fmtDate(useBy)}</b> ({day})
              </p>
            </FormSection>

            <FormSection title="Aperçu">
              <LabelPreview
                productName={product?.name ?? "—"}
                kind={KINDS.find((k) => k.value === kind)?.label ?? ""}
                madeAt={fmtDate(madeAt)}
                useBy={fmtDate(useBy)}
                lot={lot}
                operator={operator}
                day={day}
              />
            </FormSection>
          </>
        )}

        {current?.id && (
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              background: T.creme,
              borderTop: `1px solid ${T.border}`,
              padding: "12px 16px",
              zIndex: 30
            }}
          >
            <div
              style={{
                maxWidth: 760,
                margin: "0 auto",
                display: "flex",
                gap: 8
              }}
            >
              <button
                type="button"
                onClick={printA4}
                disabled={!valid}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "#fff",
                  color: T.dark,
                  border: `1px solid ${T.dark}`,
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: valid ? "pointer" : "not-allowed",
                  opacity: valid ? 1 : 0.4
                }}
              >
                Aperçu / A4
              </button>
              <button
                type="button"
                onClick={printBLE}
                disabled={!valid}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: T.dark,
                  color: "#fff",
                  border: "none",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: valid ? "pointer" : "not-allowed",
                  opacity: valid ? 1 : 0.4
                }}
              >
                Imprimer (BLE)
              </button>
            </div>
          </div>
        )}
      </HaccpPageShell>
    </RequireRole>
  );
}

// ── Aperçu ─────────────────────────────────────────────────────────────────

function LabelPreview({
  productName,
  kind,
  madeAt,
  useBy,
  lot,
  operator,
  day
}: {
  productName: string;
  kind: string;
  madeAt: string;
  useBy: string;
  lot: string;
  operator: string;
  day: string;
}) {
  return (
    <div
      style={{
        width: 280,
        margin: "0 auto",
        background: "#fff",
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        padding: "10px 12px",
        display: "flex",
        gap: 10,
        boxShadow: T.tileShadow,
        fontFamily: "system-ui, sans-serif"
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: T.dark, lineHeight: 1.2 }}>
          {productName}
        </div>
        <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{kind}</div>
        <dl style={{ margin: "8px 0 0", fontSize: 11 }}>
          {[
            ["Ent./Fab.", madeAt],
            ["DLC", useBy],
            ...(lot ? [["N° lot", lot]] : []),
            ...(operator ? [["Par", operator]] : [])
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <dt style={{ fontWeight: 800, color: T.dark }}>{k} :</dt>
              <dd style={{ margin: 0, fontWeight: 700, color: T.dark, textAlign: "right" }}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div
        style={{
          width: 42,
          height: 42,
          background: T.dark,
          color: "#fff",
          fontWeight: 900,
          fontSize: 14,
          display: "grid",
          placeItems: "center",
          borderRadius: 4,
          flex: "0 0 auto"
        }}
      >
        {day}
      </div>
    </div>
  );
}

const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string
  );
}

function labelHtml(p: {
  productName: string;
  kind: string;
  madeAt: string;
  useBy: string;
  lot: string;
  operator: string;
  day: string;
}): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(p.productName)} — étiquette</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; color: #1a1a1a; padding: 16px; }
  .lbl { border: 1px solid #ddd6c8; border-radius: 6px; padding: 10px 12px; width: 320px; }
  .lbl h1 { font-size: 18px; font-weight: 900; margin: 0; }
  .lbl small { color: #999; }
  .row { display: flex; gap: 8px; }
  .col { flex: 1; }
  .day { background: #1a1a1a; color: #fff; padding: 6px; border-radius: 4px;
         font-weight: 900; min-width: 42px; min-height: 42px;
         display: grid; place-items: center; }
  dl { margin-top: 8px; font-size: 12px; }
  dl div { display: flex; justify-content: space-between; }
  dt { font-weight: 800; }
  dd { margin: 0; font-weight: 700; }
  @media print { @page { size: 70mm 40mm; margin: 0; } body { padding: 4px; } }
</style></head>
<body>
  <div class="lbl">
    <div class="row">
      <div class="col">
        <h1>${escapeHtml(p.productName)}</h1>
        <small>${escapeHtml(p.kind)}</small>
        <dl>
          <div><dt>Ent./Fab. :</dt><dd>${escapeHtml(p.madeAt)}</dd></div>
          <div><dt>DLC :</dt><dd>${escapeHtml(p.useBy)}</dd></div>
          ${p.lot ? `<div><dt>N° lot :</dt><dd>${escapeHtml(p.lot)}</dd></div>` : ""}
          ${p.operator ? `<div><dt>Par :</dt><dd>${escapeHtml(p.operator)}</dd></div>` : ""}
        </dl>
      </div>
      <div class="day">${escapeHtml(p.day)}</div>
    </div>
  </div>
</body></html>`;
}

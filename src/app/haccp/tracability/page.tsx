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
  StatusBanner,
  TextField
} from "@/components/haccp/FormBlocks";
import {
  addReading,
  currentUserName,
  fetchProducts,
  type Product
} from "@/lib/haccp";

export default function TracabilityPage() {
  const { current } = useEtablissement();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [lot, setLot] = useState("");
  const [qty, setQty] = useState<number | null>(null);
  const [unit, setUnit] = useState("kg");
  const [date, setDate] = useState(todayDate());
  const [time, setTime] = useState(nowTime());
  const [userName, setUserName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentUserName().then(setUserName);
  }, []);

  useEffect(() => {
    if (!current?.id) return;
    void fetchProducts(current.id).then(setProducts);
  }, [current?.id]);

  const product = products.find((p) => p.id === productId);
  const dlc = useMemo(() => {
    if (!product) return null;
    const d = new Date(date);
    d.setDate(d.getDate() + Number(product.shelf_life_days || 0));
    return d;
  }, [product, date]);

  const valid = !!product && !!lot;

  async function save() {
    if (!current?.id || !product) return;
    setBusy(true);
    try {
      const at = new Date(`${date}T${time || "00:00"}:00`).toISOString();
      await addReading({
        etablissement_id: current.id,
        module: "tracability",
        subject: product.name,
        value: qty ?? null,
        unit: qty != null ? unit : null,
        conform: true,
        at,
        by_name: userName || "—",
        source: "manual",
        meta: {
          product_id: product.id,
          supplier: product.supplier ?? "",
          barcode: product.barcode ?? "",
          lot,
          dlc: dlc ? dlc.toISOString().slice(0, 10) : ""
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
      <HaccpPageShell title="Traçabilité">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement pour saisir un lot.
          </StatusBanner>
        ) : (
          <>
            <FormSection title="Date de saisie">
              <DateTimeRow date={date} time={time} onDate={setDate} onTime={setTime} />
            </FormSection>

            <FormSection
              title="Produit"
              right={
                <Link
                  href="/haccp/admin/products"
                  style={{ fontSize: 12, fontWeight: 700, color: T.belloMio, textDecoration: "none" }}
                >
                  + Base produits
                </Link>
              }
            >
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
                    {p.supplier ? ` · ${p.supplier}` : ""}
                  </option>
                ))}
              </select>
              {products.length === 0 && (
                <p style={{ marginTop: 8, fontSize: 12, color: T.muted }}>
                  Aucun produit.{" "}
                  <Link href="/haccp/admin/products" style={{ color: T.belloMio, fontWeight: 800 }}>
                    Ajoute-en un
                  </Link>
                  .
                </p>
              )}
            </FormSection>

            <FormSection title="Numéro de lot">
              <TextField
                value={lot}
                onChange={setLot}
                placeholder={`L-${todayDate().replace(/-/g, "")}-A`}
              />
            </FormSection>

            <FormSection title="Quantité reçue (optionnel)">
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <NumberStepper value={qty} onChange={setQty} step={1} unit={unit} />
                </div>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  style={{
                    width: 100,
                    background: "#fff",
                    border: `1px solid ${T.border}`,
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontSize: 14,
                    fontWeight: 700
                  }}
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="L">L</option>
                  <option value="cL">cL</option>
                  <option value="pcs">pcs</option>
                </select>
              </div>
            </FormSection>

            {product && dlc && (
              <StatusBanner tone="ok">
                DLC secondaire calculée : <b>{dlc.toLocaleDateString("fr-FR")}</b> (
                {product.shelf_life_days} j de conservation)
              </StatusBanner>
            )}
          </>
        )}

        {current?.id && (
          <SaveBar
            onSave={save}
            label="Enregistrer le lot"
            disabled={!valid}
            busy={busy}
            hint={!valid ? "Sélectionne un produit et saisis un n° de lot." : undefined}
          />
        )}
      </HaccpPageShell>
    </RequireRole>
  );
}

const todayDate = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

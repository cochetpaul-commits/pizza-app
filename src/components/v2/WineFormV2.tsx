"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { NavBar } from "@/components/NavBar";

const WINE_COLORS = [
  { key: "bollicine", label: "Bollicine", color: "#c4a040" },
  { key: "blanc", label: "Blanc", color: "#c4a040" },
  { key: "rosé", label: "Rosé", color: "#D4775A" },
  { key: "orange", label: "Orange", color: "#c8720a" },
  { key: "rouge", label: "Rouge", color: "#8B1A1A" },
];

type Props = { wineId: string | null };

export default function WineFormV2({ wineId }: Props) {
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const _isEdit = !!wineId;

  const [name, setName] = useState("");
  const [domaine, setDomaine] = useState("");
  const [region, setRegion] = useState("");
  const [cepages, setCepages] = useState("");
  const [color, setColor] = useState("rouge");
  const [accords, setAccords] = useState("");
  const [descriptif, setDescriptif] = useState("");
  const [anecdote, setAnecdote] = useState("");
  const [sellPrice, setSellPrice] = useState<number | "">("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!wineId);

  useEffect(() => {
    if (!wineId) return;
    let cancelled = false;
    supabase.from("wines").select("*").eq("id", wineId).single().then(({ data }) => {
      if (cancelled || !data) return;
      const w = data as Record<string, unknown>;
      setName(String(w.name ?? ""));
      setDomaine(String(w.domaine ?? ""));
      setRegion(String(w.region ?? ""));
      setCepages(String(w.cepages ?? ""));
      setColor(String(w.color ?? "rouge"));
      setAccords(String(w.accords ?? ""));
      setDescriptif(String(w.descriptif ?? ""));
      setAnecdote(String(w.anecdote ?? ""));
      if (w.sell_price) setSellPrice(Number(w.sell_price));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [wineId]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        name: name || "Nouveau vin",
        domaine: domaine || null,
        region: region || null,
        cepages: cepages || null,
        color,
        accords: accords || null,
        descriptif: descriptif || null,
        anecdote: anecdote || null,
        sell_price: sellPrice !== "" ? Number(sellPrice) : null,
        establishments: etab ? [etab.slug] : ["bello_mio"],
      };

      if (wineId) {
        const { error } = await supabase.from("wines").update(payload).eq("id", wineId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("wines")
          .insert(payload)
          .select("id").single<{ id: string }>();
        if (error) throw error;
        router.push(`/recettes/vin/${data.id}`);
        return;
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setSaving(false);
    }
  }

  const accent = "#8a6b3e";
  const wc = WINE_COLORS.find(c => c.key === color);

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e5ddd0",
    fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#1a1a1a",
    outline: "none", boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
    color: accent, marginBottom: 4,
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff", borderRadius: 14, padding: "16px 18px", marginBottom: 12,
    border: "1px solid #ede6d9",
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#999" }}>Chargement...</div>;

  return (
    <div style={{ background: "#f2ede4", minHeight: "100dvh", paddingBottom: 120 }}>
      <NavBar
        backHref="/recettes"
        backLabel="Catalogue"
        primaryAction={
          <button type="button" onClick={handleSave} disabled={saving} style={{
            padding: "6px 16px", borderRadius: 8, border: "none",
            background: "#1a1a1a", color: "#fff", fontSize: 12, fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
            fontFamily: "inherit",
          }}>
            {saving ? "..." : "Enregistrer"}
          </button>
        }
        menuItems={[]}
      />

      {/* Header */}
      <div style={{
        background: wc?.color ?? accent, borderRadius: 14, padding: "18px 20px",
        margin: "0 12px 16px", color: "#fff",
      }}>
        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.7, marginBottom: 4 }}>
          Fiche technique
        </div>
        <div style={{
          fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700,
          fontSize: 22, textTransform: "uppercase", letterSpacing: "0.03em",
        }}>
          {name || "Nouveau vin"}
        </div>
        {domaine && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{domaine}</div>}
      </div>

      {saveError && (
        <div style={{ margin: "0 12px 12px", padding: 12, borderRadius: 10, background: "#fff0f0", color: "#c62828", fontSize: 13 }}>
          {saveError}
        </div>
      )}

      {/* Nom + Domaine */}
      <div style={{ ...cardStyle, margin: "0 12px 12px" }}>
        <div style={labelStyle}>Nom du vin</div>
        <input value={name} onChange={e => setName(e.target.value)} style={fieldStyle} placeholder="Ex: Barolo" />
        <div style={{ ...labelStyle, marginTop: 12 }}>Domaine</div>
        <input value={domaine} onChange={e => setDomaine(e.target.value)} style={fieldStyle} placeholder="Ex: Scrimaglio" />
      </div>

      {/* Couleur */}
      <div style={{ ...cardStyle, margin: "0 12px 12px" }}>
        <div style={labelStyle}>Couleur / Type</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {WINE_COLORS.map(wc => (
            <button key={wc.key} type="button" onClick={() => setColor(wc.key)} style={{
              padding: "6px 14px", borderRadius: 20, border: color === wc.key ? `2px solid ${wc.color}` : "1.5px solid #e5ddd0",
              background: color === wc.key ? wc.color + "15" : "#fff",
              color: color === wc.key ? wc.color : "#999",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              {wc.label}
            </button>
          ))}
        </div>
      </div>

      {/* Region + Cepages */}
      <div style={{ ...cardStyle, margin: "0 12px 12px" }}>
        <div style={labelStyle}>Region / Appellation</div>
        <input value={region} onChange={e => setRegion(e.target.value)} style={fieldStyle} placeholder="Ex: Piémont (Barolo DOCG)" />
        <div style={{ ...labelStyle, marginTop: 12 }}>Cepages</div>
        <input value={cepages} onChange={e => setCepages(e.target.value)} style={fieldStyle} placeholder="Ex: 100% Nebbiolo" />
      </div>

      {/* Descriptif */}
      <div style={{ ...cardStyle, margin: "0 12px 12px" }}>
        <div style={labelStyle}>Descriptif</div>
        <textarea value={descriptif} onChange={e => setDescriptif(e.target.value)} rows={3}
          style={{ ...fieldStyle, resize: "vertical" }} placeholder="Notes de degustation..." />
      </div>

      {/* Accords */}
      <div style={{ ...cardStyle, margin: "0 12px 12px" }}>
        <div style={labelStyle}>Accords mets & vins</div>
        <textarea value={accords} onChange={e => setAccords(e.target.value)} rows={2}
          style={{ ...fieldStyle, resize: "vertical" }} placeholder="Viandes rouges, fromages..." />
      </div>

      {/* Anecdote */}
      <div style={{ ...cardStyle, margin: "0 12px 12px" }}>
        <div style={labelStyle}>Anecdote</div>
        <textarea value={anecdote} onChange={e => setAnecdote(e.target.value)} rows={3}
          style={{ ...fieldStyle, resize: "vertical" }} placeholder="Histoire du domaine, du vin..." />
      </div>

      {/* Prix */}
      <div style={{ ...cardStyle, margin: "0 12px 12px" }}>
        <div style={labelStyle}>Prix de vente</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value ? Number(e.target.value) : "")}
            style={{ ...fieldStyle, width: 120 }} placeholder="0" step="0.5" min="0" />
          <span style={{ fontSize: 14, color: "#999" }}>{"\u20AC"}</span>
        </div>
      </div>

      {/* Save button (mobile) */}
      <div style={{ padding: "0 12px", marginTop: 8 }}>
        <button type="button" onClick={handleSave} disabled={saving} style={{
          width: "100%", padding: "14px 0", borderRadius: 14, border: "none",
          background: accent, color: "#fff", fontSize: 15, fontWeight: 700,
          cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
          fontFamily: "inherit",
        }}>
          {saving ? "Enregistrement..." : "Sauvegarder"}
        </button>
      </div>
    </div>
  );
}

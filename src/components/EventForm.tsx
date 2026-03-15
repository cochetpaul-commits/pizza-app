"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { NavBar } from "@/components/NavBar";

// ── Constants ───────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  { value: "mariage", label: "Mariage" },
  { value: "seminaire", label: "Séminaire" },
  { value: "anniversaire", label: "Anniversaire" },
  { value: "repas_staff", label: "Repas staff" },
  { value: "autre", label: "Autre" },
];

const STATUSES = [
  { value: "prospect", label: "Prospect", color: "#D4775A" },
  { value: "confirme", label: "Confirmé", color: "#4a6741" },
  { value: "en_cours", label: "En cours", color: "#2563eb" },
  { value: "termine", label: "Terminé", color: "#999999" },
  { value: "annule", label: "Annulé", color: "#DC2626" },
];

const DOC_TYPES = [
  { value: "devis", label: "Devis" },
  { value: "contrat", label: "Contrat signé" },
  { value: "bon_commande", label: "Bon de commande" },
  { value: "autre", label: "Autre" },
];

// ── Types ───────────────────────────────────────────────────────────────────

type LinkedRecipe = {
  id?: string;
  recipe_type: string;
  recipe_id: string;
  recipe_name: string;
  portions: number;
  cost_per_portion: number;
  notes: string;
};

type Doc = {
  id: string;
  name: string;
  type: string;
  file_url: string;
  file_size: number | null;
  created_at: string;
};

type RecipeOption = {
  id: string;
  name: string;
  type: "pizza" | "cuisine" | "cocktail" | "empatement";
  cost_per_portion: number;
};

// ── Styles ──────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd6c8",
  borderRadius: 14,
  padding: "16px 16px 20px",
  marginBottom: 14,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#6f6a61",
  marginBottom: 4,
  letterSpacing: 0.3,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  borderRadius: 10,
  border: "1.5px solid #ddd6c8",
  padding: "0 12px",
  fontSize: 14,
  background: "rgba(255,255,255,0.7)",
  boxSizing: "border-box",
};

const sectionTitle = (label: string, color = "#D4775A"): React.ReactNode => (
  <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, letterSpacing: 1, color, textTransform: "uppercase" }}>
    {label}
  </p>
);

// ── Component ───────────────────────────────────────────────────────────────

export default function EventForm({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const isNew = !eventId;
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState("autre");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [address, setAddress] = useState("");
  const [covers, setCovers] = useState(0);
  const [establishment, setEstablishment] = useState("both");
  const [status, setStatus] = useState("prospect");
  const [sellPrice, setSellPrice] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  // Client
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientsList, setClientsList] = useState<{ id: string; nom: string; prenom: string | null; email: string | null; telephone: string | null; notes: string | null }[]>([]);

  // Contact
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactNotes, setContactNotes] = useState("");

  // Recipes
  const [recipes, setRecipes] = useState<LinkedRecipe[]>([]);
  const [recipeOptions, setRecipeOptions] = useState<RecipeOption[]>([]);
  const [addRecipeId, setAddRecipeId] = useState("");

  // Documents
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploadDocType, setUploadDocType] = useState("devis");
  const [uploading, setUploading] = useState(false);

  // UI
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!eventId);
  const [userId, setUserId] = useState<string | null>(null);

  // ── Load recipe catalog ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);

      let pQ = supabase.from("pizza_recipes").select("id,name,total_cost,nb_parts").eq("is_draft", false);
      let kQ = supabase.from("kitchen_recipes").select("id,name,cost_per_portion").eq("is_draft", false);
      let cQ = supabase.from("cocktails").select("id,name,total_cost").eq("is_draft", false);
      let eQ = supabase.from("recipes").select("id,name");
      if (etab) { pQ = pQ.eq("etablissement_id", etab.id); kQ = kQ.eq("etablissement_id", etab.id); cQ = cQ.eq("etablissement_id", etab.id); eQ = eQ.eq("etablissement_id", etab.id); }
      const [pizzas, kitchens, cocktails, empats] = await Promise.all([pQ, kQ, cQ, eQ]);

      const opts: RecipeOption[] = [];
      for (const r of pizzas.data ?? []) {
        const cpp = r.nb_parts && r.nb_parts > 0 ? (r.total_cost ?? 0) / r.nb_parts : 0;
        opts.push({ id: r.id, name: r.name, type: "pizza", cost_per_portion: Math.round(cpp * 100) / 100 });
      }
      for (const r of kitchens.data ?? []) {
        opts.push({ id: r.id, name: r.name, type: "cuisine", cost_per_portion: r.cost_per_portion ?? 0 });
      }
      for (const r of cocktails.data ?? []) {
        opts.push({ id: r.id, name: r.name, type: "cocktail", cost_per_portion: r.total_cost ?? 0 });
      }
      for (const r of empats.data ?? []) {
        opts.push({ id: r.id, name: r.name, type: "empatement", cost_per_portion: 0 });
      }
      opts.sort((a, b) => a.name.localeCompare(b.name, "fr"));
      setRecipeOptions(opts);
    })();
  }, [etab]);

  // ── Load clients ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("clients").select("id,nom,prenom,email,telephone,notes").order("nom");
      setClientsList(data ?? []);
    })();
  }, []);

  // ── Load existing event ───────────────────────────────────────────────
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data: ev } = await supabase.from("events").select("*").eq("id", eventId).single();
      if (!ev) { setLoading(false); return; }

      setName(ev.name ?? "");
      setType(ev.type ?? "autre");
      setDate(ev.date ?? "");
      setTime(ev.time ? ev.time.slice(0, 5) : "");
      setLocation(ev.location ?? "");
      setAddress(ev.address ?? "");
      setCovers(ev.covers ?? 0);
      setEstablishment(ev.establishment ?? "both");
      setStatus(ev.status ?? "prospect");
      setSellPrice(ev.sell_price);
      setNotes(ev.notes ?? "");
      setContactName(ev.contact_name ?? "");
      setContactPhone(ev.contact_phone ?? "");
      setContactEmail(ev.contact_email ?? "");
      setContactNotes(ev.contact_notes ?? "");
      setClientId(ev.client_id ?? null);

      const { data: recs } = await supabase
        .from("event_recipes")
        .select("id,recipe_type,recipe_id,recipe_name,portions,cost_per_portion,notes")
        .eq("event_id", eventId);
      setRecipes(
        (recs ?? []).map((r) => ({
          id: r.id,
          recipe_type: r.recipe_type,
          recipe_id: r.recipe_id,
          recipe_name: r.recipe_name ?? "",
          portions: r.portions ?? 1,
          cost_per_portion: r.cost_per_portion ?? 0,
          notes: r.notes ?? "",
        }))
      );

      const { data: docRows } = await supabase
        .from("event_documents")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      setDocs(docRows ?? []);

      setLoading(false);
    })();
  }, [eventId]);

  // ── Recipe helpers ────────────────────────────────────────────────────

  const addRecipe = useCallback(() => {
    if (!addRecipeId) return;
    const opt = recipeOptions.find((o) => o.id === addRecipeId);
    if (!opt) return;
    if (recipes.some((r) => r.recipe_id === opt.id)) return;
    setRecipes((prev) => [
      ...prev,
      {
        recipe_type: opt.type,
        recipe_id: opt.id,
        recipe_name: opt.name,
        portions: covers || 1,
        cost_per_portion: opt.cost_per_portion,
        notes: "",
      },
    ]);
    setAddRecipeId("");
  }, [addRecipeId, recipeOptions, recipes, covers]);

  const removeRecipe = (idx: number) => setRecipes((prev) => prev.filter((_, i) => i !== idx));

  const updateRecipe = (idx: number, field: keyof LinkedRecipe, value: unknown) => {
    setRecipes((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  // Cost calculations
  const totalCostMatiere = recipes.reduce((s, r) => s + r.cost_per_portion * r.portions, 0);
  const foodCostPct = sellPrice && sellPrice > 0 ? (totalCostMatiere / sellPrice) * 100 : null;
  const margeBrute = sellPrice != null ? sellPrice - totalCostMatiere : null;

  // ── Document upload ───────────────────────────────────────────────────

  const handleUpload = async (file: File) => {
    if (!eventId || !userId) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      alert("Seuls les fichiers PDF sont acceptés.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("Le fichier dépasse la taille maximum de 10 Mo.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "pdf";
      const path = `${userId}/${eventId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("event-documents").upload(path, file);
      if (upErr) throw new Error(upErr.message);

      const { data: urlData } = supabase.storage.from("event-documents").getPublicUrl(path);

      const { data: row, error: dbErr } = await supabase
        .from("event_documents")
        .insert({
          event_id: eventId,
          user_id: userId,
          name: file.name,
          type: uploadDocType,
          file_url: urlData.publicUrl,
          file_size: file.size,
        })
        .select()
        .single();
      if (dbErr) throw new Error(dbErr.message);
      setDocs((prev) => [row, ...prev]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const deleteDoc = async (doc: Doc) => {
    if (!confirm(`Supprimer "${doc.name}" ?`)) return;
    await supabase.from("event_documents").delete().eq("id", doc.id);
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  };

  // ── Save ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) { setSaveError("Le nom est obligatoire."); return; }
    setSaving(true);
    setSaveError(null);

    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Non authentifié");
      const uid = u.user.id;

      const row = {
        user_id: uid,
        name: name.trim(),
        type,
        date: date || null,
        time: time || null,
        location: location.trim() || null,
        address: address.trim() || null,
        covers,
        establishment,
        status,
        sell_price: sellPrice,
        notes: notes.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_notes: contactNotes.trim() || null,
        client_id: clientId || null,
        updated_at: new Date().toISOString(),
      };

      let eid = eventId;

      if (isNew) {
        const { data, error } = await supabase.from("events").insert(row).select("id").single();
        if (error) throw new Error(error.message);
        eid = data.id;
      } else {
        const { error } = await supabase.from("events").update(row).eq("id", eventId);
        if (error) throw new Error(error.message);
      }

      // Save recipes: delete all then re-insert
      await supabase.from("event_recipes").delete().eq("event_id", eid!);
      if (recipes.length > 0) {
        const recipeRows = recipes.map((r) => ({
          event_id: eid!,
          user_id: uid,
          recipe_type: r.recipe_type,
          recipe_id: r.recipe_id,
          recipe_name: r.recipe_name,
          portions: r.portions,
          cost_per_portion: r.cost_per_portion,
          notes: r.notes || null,
        }));
        const { error: recErr } = await supabase.from("event_recipes").insert(recipeRows);
        if (recErr) throw new Error(recErr.message);
      }

      if (isNew) {
        router.push(`/evenements/${eid}`);
      } else {
        setSaving(false);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur");
      setSaving(false);
    }
  };

  // ── Delete event ──────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!eventId) return;
    if (!confirm("Supprimer cet événement et tous ses documents ?")) return;
    await supabase.from("events").delete().eq("id", eventId);
    router.push("/evenements");
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <NavBar backHref="/evenements" backLabel="Événements" />
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem", textAlign: "center" }}>
          <p className="muted">Chargement…</p>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar
        backHref="/evenements"
        backLabel="Événements"
        primaryAction={
          <button
            className="btn btnPrimary"
            style={{ background: "#D4775A", borderColor: "#D4775A" }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "…" : isNew ? "Créer" : "Enregistrer"}
          </button>
        }
        menuItems={
          !isNew
            ? [{ label: "Supprimer", onClick: handleDelete, style: { color: "#DC2626" } }]
            : undefined
        }
      />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 16px 60px" }}>

        {saveError && (
          <div style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, color: "#DC2626", fontSize: 13, fontWeight: 600 }}>
            {saveError}
          </div>
        )}

        {/* ═══ 1. FICHE ÉVÉNEMENT ═══ */}
        <div style={sectionStyle}>
          {sectionTitle("Fiche événement")}

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Nom *</label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Mariage Dupont" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
                {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Statut</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: `1px solid ${status === s.value ? s.color : "#ddd6c8"}`,
                      background: status === s.value ? s.color : "#fff",
                      color: status === s.value ? "#fff" : "#6f6a61",
                      fontWeight: 700,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Heure</label>
              <input style={inputStyle} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Lieu</label>
              <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Domaine des Pins" />
            </div>
            <div>
              <label style={labelStyle}>Adresse</label>
              <input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue, ville…" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Nombre de couverts</label>
              <input
                style={inputStyle}
                type="number"
                min={0}
                value={covers || ""}
                onChange={(e) => setCovers(parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <label style={labelStyle}>Établissement</label>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {(["bellomio", "piccola", "both"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEstablishment(v)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: "1px solid #ddd6c8",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      background: establishment === v ? (v === "bellomio" ? "#D4775A" : v === "piccola" ? "#643d22" : "#6B7280") : "#fff",
                      color: establishment === v ? "#fff" : "#6f6a61",
                    }}
                  >
                    {v === "bellomio" ? "Bello Mio" : v === "piccola" ? "Piccola Mia" : "Les deux"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ 2. CONTACT CLIENT ═══ */}
        <div style={sectionStyle}>
          {sectionTitle("Contact client", "#4a6741")}

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Client (carnet)</label>
            <select
              style={inputStyle}
              value={clientId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setClientId(id);
                if (id) {
                  const c = clientsList.find(cl => cl.id === id);
                  if (c) {
                    setContactName([c.nom, c.prenom].filter(Boolean).join(" "));
                    if (c.telephone) setContactPhone(c.telephone);
                    if (c.email) setContactEmail(c.email);
                    if (c.notes) setContactNotes(c.notes);
                  }
                }
              }}
            >
              <option value="">— Saisie libre —</option>
              {clientsList.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nom}{c.prenom ? ` ${c.prenom}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Nom</label>
              <input style={inputStyle} value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Téléphone</label>
              <input style={inputStyle} type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, height: 60, padding: "8px 12px", resize: "vertical" }}
              value={contactNotes}
              onChange={(e) => setContactNotes(e.target.value)}
              placeholder="Allergies, préférences…"
            />
          </div>
        </div>

        {/* ═══ 3. RECETTES LIÉES ═══ */}
        <div style={sectionStyle}>
          {sectionTitle("Recettes liées", "#D4775A")}

          {/* Add recipe */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <select
              style={{ ...inputStyle, flex: 1 }}
              value={addRecipeId}
              onChange={(e) => setAddRecipeId(e.target.value)}
            >
              <option value="">Ajouter une recette…</option>
              {recipeOptions
                .filter((o) => !recipes.some((r) => r.recipe_id === o.id))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    [{o.type === "cuisine" ? "CUI" : o.type === "pizza" ? "PIZ" : o.type === "cocktail" ? "COC" : "EMP"}] {o.name}
                    {o.cost_per_portion > 0 ? ` (${o.cost_per_portion.toFixed(2)} €/p)` : ""}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn btnPrimary"
              style={{ background: "#D4775A", borderColor: "#D4775A", flexShrink: 0 }}
              onClick={addRecipe}
              disabled={!addRecipeId}
            >
              +
            </button>
          </div>

          {/* Recipe list */}
          {recipes.length === 0 && <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>Aucune recette associée</p>}
          {recipes.map((r, idx) => (
            <div
              key={r.recipe_id}
              style={{
                border: "1px solid #ddd6c8",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 8,
                background: "#faf8f4",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Link
                  href={`/recettes/${r.recipe_type}/${r.recipe_id}`}
                  style={{ fontWeight: 700, fontSize: 13, color: "#2f3a33", textDecoration: "none" }}
                >
                  {r.recipe_name}
                </Link>
                <button
                  type="button"
                  onClick={() => removeRecipe(idx)}
                  style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontWeight: 800, fontSize: 16 }}
                >
                  ×
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Portions</label>
                  <input
                    style={{ ...inputStyle, height: 32, fontSize: 13 }}
                    type="number"
                    min={1}
                    value={r.portions}
                    onChange={(e) => updateRecipe(idx, "portions", parseInt(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Coût/portion</label>
                  <input
                    style={{ ...inputStyle, height: 32, fontSize: 13 }}
                    type="number"
                    step="0.01"
                    min={0}
                    value={r.cost_per_portion || ""}
                    onChange={(e) => updateRecipe(idx, "cost_per_portion", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Sous-total</label>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: "#4a6741", lineHeight: "32px" }}>
                    {(r.cost_per_portion * r.portions).toFixed(2)} €
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Cost summary */}
          {recipes.length > 0 && (
            <div style={{
              marginTop: 12,
              padding: "12px 14px",
              background: "#f2ede4",
              borderRadius: 10,
              border: "1px solid #ddd6c8",
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Coût matière total</label>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: "#2f3a33" }}>
                    {totalCostMatiere.toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Prix de vente événement</label>
                  <input
                    style={{ ...inputStyle, height: 36, fontWeight: 800, fontSize: 15 }}
                    type="number"
                    step="0.01"
                    min={0}
                    value={sellPrice ?? ""}
                    onChange={(e) => setSellPrice(e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="€ HT"
                  />
                </div>
              </div>
              {sellPrice != null && sellPrice > 0 && (
                <div style={{ display: "flex", gap: 20 }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#6f6a61" }}>Marge brute</span>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: (margeBrute ?? 0) >= 0 ? "#4a6741" : "#DC2626" }}>
                      {(margeBrute ?? 0).toFixed(2)} €
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#6f6a61" }}>Food cost</span>
                    <p style={{
                      margin: 0,
                      fontWeight: 800,
                      fontSize: 15,
                      color: (foodCostPct ?? 0) <= 30 ? "#4a6741" : (foodCostPct ?? 0) <= 40 ? "#EA580C" : "#DC2626",
                    }}>
                      {(foodCostPct ?? 0).toFixed(1)} %
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ 4. DOCUMENTS ═══ */}
        <div style={sectionStyle}>
          {sectionTitle("Documents", "#D4775A")}

          {!isNew && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <select
                style={{ ...inputStyle, width: "auto", minWidth: 140 }}
                value={uploadDocType}
                onChange={(e) => setUploadDocType(e.target.value)}
              >
                {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <input
                ref={fileRef}
                type="file"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
                    alert("Seuls les fichiers PDF sont acceptes.");
                    return;
                  }
                  handleUpload(f);
                }}
              />
              <button
                type="button"
                className="btn"
                style={{ fontSize: 13, fontWeight: 600, minHeight: 48, padding: "10px 16px" }}
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Upload en cours…" : "Ajouter un document PDF"}
              </button>
            </div>
          )}

          {isNew && <p className="muted" style={{ fontSize: 12 }}>Enregistrez l&apos;événement pour ajouter des documents.</p>}

          {docs.length === 0 && !isNew && <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>Aucun document</p>}
          {docs.map((d) => (
            <div key={d.id} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 10px",
              border: "1px solid #ddd6c8",
              borderRadius: 8,
              marginBottom: 6,
              background: "#faf8f4",
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#2f3a33" }}>
                  {d.name}
                </p>
                <p className="muted" style={{ margin: 0, fontSize: 10 }}>
                  {DOC_TYPES.find((t) => t.value === d.type)?.label ?? d.type}
                  {d.file_size ? ` · ${Math.round(d.file_size / 1024)} Ko` : ""}
                  {d.created_at ? ` · ${new Date(d.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                <a
                  href={d.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "8px 14px",
                    minHeight: 40,
                    borderRadius: 6,
                    background: "#D4775A",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  Télécharger
                </a>
                <button
                  type="button"
                  onClick={() => deleteDoc(d)}
                  style={{
                    padding: "8px 14px",
                    minHeight: 40,
                    borderRadius: 6,
                    background: "none",
                    border: "1px solid #ddd6c8",
                    color: "#DC2626",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 12,
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ═══ NOTES LIBRES ═══ */}
        <div style={sectionStyle}>
          {sectionTitle("Notes", "#6f6a61")}
          <textarea
            style={{ ...inputStyle, height: 80, padding: "8px 12px", resize: "vertical" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes internes sur l'événement…"
          />
        </div>
      </div>
    </>
  );
}

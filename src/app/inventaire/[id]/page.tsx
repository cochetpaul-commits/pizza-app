"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import { inChunks } from "@/lib/supabaseChunks";
import { useProfile } from "@/lib/ProfileContext";
import { libelleZone } from "@/lib/commandeArticles";
import { totalLigne } from "@/lib/inventaire";

/**
 * Inventaire « feuille » : saisie zone par zone, dans l'ordre de la feuille papier (famille, puis produit).
 * Deux champs par produit, colis et unités ; total = colis × contenu + unités (conditionnement retenu à l'import).
 * Enregistrement au fil de la saisie ; clôturé = lecture seule (un admin peut rouvrir). Admins et managers.
 */

type Inventaire = { id: string; etablissement_id: string; date: string; type: "fin_exercice" | "mensuel"; statut: string; saisie: string };
type Ligne = {
  id: string; ingredient_id: string; zone: string; ordre: number | null; famille: string | null;
  colis: number | null; unites: number | null; quantite: number; unite: string | null;
  cond_contenu: number | null; cond_libelle: string | null; nom: string;
};
type Saisie = { colis: string; unites: string };

const ACCENT = "#D4775A";
const OSWALD = "var(--font-oswald), Oswald, sans-serif";
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const txt = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const pluriel = (u: string | null, n: number) => {
  const m = u ?? "";
  if (n <= 1 || !m || ["kg", "g", "l", "ml", "cl", "pc", "colis"].includes(m)) return m;
  return m.endsWith("s") || m.endsWith("x") ? m : m === "plateau" ? "plateaux" : m === "seau" ? "seaux" : `${m}s`;
};

export default function InventaireFeuillePage() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <Feuille />
    </RequireRole>
  );
}

function Feuille() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isGroupAdmin } = useProfile();
  const [inv, setInv] = useState<Inventaire | null>(null);
  const [etabNom, setEtabNom] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  const [zone, setZone] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [etatLigne, setEtatLigne] = useState<Record<string, "attente" | "ok" | "erreur">>({});
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<{ id: string; name: string }[]>([]);
  const minuteries = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const fichierRef = useRef<HTMLInputElement | null>(null);

  const charger = useCallback(async () => {
    const { data: i, error } = await supabase.from("inventaires").select("id, etablissement_id, date, type, statut, saisie").eq("id", id).maybeSingle();
    if (error || !i) { setErreur("Inventaire introuvable ou accès refusé"); return; }
    const invRow = i as Inventaire;
    const [{ data: z }, { data: e }, { data: ls }] = await Promise.all([
      supabase.from("storage_zones").select("name, display_order").eq("etablissement_id", invRow.etablissement_id).order("display_order"),
      supabase.from("etablissements").select("nom").eq("id", invRow.etablissement_id).maybeSingle(),
      supabase.from("inventaire_lignes").select("id, ingredient_id, zone, ordre, famille, colis, unites, quantite, unite, cond_contenu, cond_libelle")
        .eq("inventaire_id", id).order("ordre", { ascending: true, nullsFirst: false }).limit(5000),
    ]);
    const ids = [...new Set((ls ?? []).map((l) => l.ingredient_id as string))];
    const { data: ings } = await inChunks<{ id: string; name: string }>(ids, (b) => supabase.from("ingredients").select("id, name").in("id", b));
    const nomDe = new Map(ings.map((x) => [x.id, x.name]));
    const liste = ((ls ?? []) as Omit<Ligne, "nom">[]).map((l) => ({ ...l, nom: nomDe.get(l.ingredient_id) ?? "?" }));
    setInv(invRow);
    setEtabNom((e?.nom as string | undefined) ?? "");
    const nomsZones = (z ?? []).map((x) => x.name as string);
    // Zones de la feuille d'abord (ordre des zones de l'établissement), puis les zones sans ligne
    setZones(nomsZones);
    setLignes(liste);
    setSaisies(Object.fromEntries(liste.map((l) => [l.id, { colis: txt(l.colis), unites: txt(l.unites ?? (l.colis == null && l.quantite > 0 ? l.quantite : null)) }])));
    setZone((cur) => cur ?? nomsZones.find((n) => liste.some((l) => l.zone === n)) ?? nomsZones[0] ?? null);
  }, [id]);

  useEffect(() => { void charger(); }, [charger]);

  const lectureSeule = !inv || inv.statut === "cloture";

  const parZone = useMemo(() => {
    const m = new Map<string, Ligne[]>();
    for (const l of lignes) { const a = m.get(l.zone) ?? []; a.push(l); m.set(l.zone, a); }
    return m;
  }, [lignes]);
  const compte = (l: Ligne) => { const s = saisies[l.id]; return !!s && (s.colis.trim() !== "" || s.unites.trim() !== ""); };

  /** Enregistre une ligne 500 ms après la dernière frappe */
  function saisir(l: Ligne, champ: keyof Saisie, valeur: string) {
    if (lectureSeule) return;
    const v = valeur.replace(/[^0-9.,]/g, "");
    setSaisies((s) => ({ ...s, [l.id]: { ...(s[l.id] ?? { colis: "", unites: "" }), [champ]: v } }));
    setEtatLigne((e) => ({ ...e, [l.id]: "attente" }));
    const t = minuteries.current.get(l.id);
    if (t) clearTimeout(t);
    minuteries.current.set(l.id, setTimeout(() => void enregistrer(l.id), 500));
  }
  const saisiesRef = useRef(saisies);
  useEffect(() => { saisiesRef.current = saisies; }, [saisies]);
  const lignesRef = useRef(lignes);
  useEffect(() => { lignesRef.current = lignes; }, [lignes]);

  async function enregistrer(ligneId: string) {
    minuteries.current.delete(ligneId);
    const l = lignesRef.current.find((x) => x.id === ligneId);
    const s = saisiesRef.current[ligneId];
    if (!l || !s) return;
    const colis = num(s.colis), unites = num(s.unites);
    if ((colis != null && !(colis >= 0)) || (unites != null && !(unites >= 0))) { setEtatLigne((e) => ({ ...e, [ligneId]: "erreur" })); return; }
    const total = totalLigne(colis, unites, l.cond_contenu);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("inventaire_lignes").update({
      colis, unites, quantite: total ?? 0, saisi_par: u.user?.id ?? null, updated_at: new Date().toISOString(),
    }).eq("id", ligneId);
    setEtatLigne((e) => ({ ...e, [ligneId]: error ? "erreur" : "ok" }));
    if (error) setMessage(`Pas enregistré : ${error.message}`);
  }

  // En quittant la page : ce qui attend part tout de suite
  useEffect(() => () => { for (const [lid, t] of minuteries.current) { clearTimeout(t); void enregistrer(lid); } }, []);

  async function action(nom: string, corps: Record<string, unknown>, succes: (j: Record<string, unknown>) => string) {
    setEnCours(nom); setMessage(null);
    try {
      const res = await fetchApi(`/api/inventaires/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(json.error ?? `Erreur ${res.status}`); return json; }
      setMessage(succes(json));
      await charger();
      return json;
    } finally { setEnCours(null); }
  }

  async function importer(f: File) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const tableau = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
    const json = await action("import", { action: "importer", tableau }, (j) =>
      `${j.lignes} lignes importées${Number(j.sans_conditionnement) ? `, dont ${j.sans_conditionnement} sans conditionnement (unités seulement)` : ""}.`);
    const errs = (json?.erreurs as string[] | undefined) ?? [];
    if (errs.length) setMessage((m) => `${m ?? ""} ${errs.length} remarque(s) : ${errs.slice(0, 5).join(" ; ")}${errs.length > 5 ? " ; …" : ""}`);
  }

  async function cloturer() {
    const restant = lignes.filter((l) => !compte(l)).length;
    for (const [lid, t] of minuteries.current) { clearTimeout(t); await enregistrer(lid); }
    if (!confirm(`Clôturer l'inventaire ?${restant ? `\n${restant} ligne(s) non comptée(s) : elles resteront vides.` : ""}\nIl ne sera plus modifiable (sauf réouverture par un admin).`)) return;
    await action("cloture", { action: "cloturer" }, (j) => j.avertissement ? String(j.avertissement) : `Inventaire clôturé (${j.mouvements} produits dans les mouvements de stock).`);
  }

  useEffect(() => {
    const q = recherche.trim();
    if (q.length < 2) { setResultats([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("ingredients").select("id, name").ilike("name", `%${q}%`).eq("is_active", true).order("name").limit(15);
      setResultats((data ?? []) as { id: string; name: string }[]);
    }, 250);
    return () => clearTimeout(t);
  }, [recherche]);

  async function ajouter(ingredientId: string) {
    if (!zone) return;
    await action("ajout", { action: "ajouter", ingredient_id: ingredientId, zone }, () => "Produit ajouté en fin de zone.");
    setRecherche(""); setResultats([]);
  }

  if (erreur) return <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, color: "#8a2b2b" }}>{erreur}</div>;
  if (!inv) return <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, color: "#999" }}>Chargement…</div>;

  const lignesZone = zone ? parZone.get(zone) ?? [] : [];
  const totalComptees = lignes.filter(compte).length;
  const aDesSaisies = totalComptees > 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 12px 80px" }}>
      <button type="button" onClick={() => router.push("/inventaire")} style={{ border: "none", background: "none", color: "#8a8378", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 8 }}>
        ← Inventaires
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: OSWALD, fontSize: 22, margin: 0 }}>Inventaire au {fmtDate(inv.date)}</h1>
          <div style={{ fontSize: 13, color: "#6f6656", marginTop: 2 }}>
            {etabNom} · {inv.type === "fin_exercice" ? "Fin d'exercice" : "Mensuel"} ·{" "}
            <span style={{ fontWeight: 700, color: inv.statut === "cloture" ? "#2D6A4F" : ACCENT }}>{inv.statut === "cloture" ? "Clôturé" : "En cours"}</span>
            {" "}· {totalComptees} / {lignes.length} lignes comptées
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!lectureSeule && !aDesSaisies && (
            <>
              <input ref={fichierRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importer(f); }} />
              <button type="button" disabled={!!enCours} onClick={() => fichierRef.current?.click()} style={bouton("#fff", "#1a1a1a")}>
                {enCours === "import" ? "Import…" : lignes.length ? "Remplacer par la feuille (fichier)" : "Importer la feuille (fichier)"}
              </button>
            </>
          )}
          {!lectureSeule && lignes.length > 0 && (
            <button type="button" disabled={!!enCours} onClick={() => void cloturer()} style={bouton(ACCENT, "#fff")}>
              {enCours === "cloture" ? "Clôture…" : "Clôturer"}
            </button>
          )}
          {inv.statut === "cloture" && isGroupAdmin && (
            <button type="button" disabled={!!enCours} onClick={() => { if (confirm("Rouvrir cet inventaire ? Il redevient modifiable ; les mouvements de stock seront refaits à la prochaine clôture.")) void action("rouvrir", { action: "rouvrir" }, () => "Inventaire rouvert."); }}
              style={bouton("#fff", "#b45309")}>Rouvrir (admin)</button>
          )}
        </div>
      </div>

      {message && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: "#fff", border: "1px solid #ddd6c8", fontSize: 13 }}>{message}</div>}

      {lignes.length === 0 ? (
        <div style={{ marginTop: 20, padding: 20, background: "#fff", borderRadius: 14, border: "1px solid #ddd6c8", fontSize: 14, color: "#6f6656" }}>
          Pas encore de lignes. Importe le fichier de la feuille (colonnes : zone, famille, nom, identifiant de la fiche), ou ajoute des produits zone par zone.
        </div>
      ) : null}

      {/* Zones, dans l'ordre des feuilles */}
      <div className="inventaire-zones" style={{ display: "flex", gap: 6, overflowX: "auto", margin: "14px 0 10px", paddingBottom: 4, position: "sticky", top: 0, zIndex: 5, background: "#f2ede4" }}>
        {zones.map((z) => {
          const ls = parZone.get(z) ?? [];
          const n = ls.filter(compte).length;
          const actif = z === zone;
          return (
            <button key={z} type="button" onClick={() => setZone(z)} style={{
              flexShrink: 0, padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
              border: actif ? `1.5px solid ${ACCENT}` : "1px solid #ddd6c8", background: actif ? "#FFF0EB" : "#fff", color: actif ? ACCENT : "#1a1a1a",
            }}>
              {libelleZone(z)} <span style={{ fontWeight: 500, color: n === ls.length && ls.length ? "#2D6A4F" : "#999" }}>{n}/{ls.length}</span>
            </button>
          );
        })}
      </div>

      {zone && (
        <div>
          {lignesZone.map((l, i) => {
            const nouvelleFamille = i === 0 || lignesZone[i - 1].famille !== l.famille;
            const s = saisies[l.id] ?? { colis: "", unites: "" };
            const contenu = l.cond_contenu;
            const deuxChamps = contenu != null && contenu > 1;
            const total = totalLigne(num(s.colis), num(s.unites), contenu);
            const etat = etatLigne[l.id];
            return (
              <React.Fragment key={l.id}>
                {nouvelleFamille && (
                  <div style={{ fontFamily: OSWALD, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8a8378", margin: "14px 4px 6px" }}>
                    {l.famille ?? "Sans famille"}
                  </div>
                )}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 4, borderRadius: 10,
                  background: "#fff", border: `1px solid ${compte(l) ? "#cfe3d6" : "#ece6db"}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.25 }}>
                      <span style={{ color: "#b0a894", fontWeight: 500, marginRight: 6, fontSize: 12 }}>{l.ordre ?? ""}</span>{l.nom}
                    </div>
                    <div style={{ fontSize: 12, color: "#8a8378", marginTop: 2 }}>
                      {l.cond_libelle ?? `en ${l.unite ?? "unités"}`}
                      {total != null && <> · <strong style={{ color: "#1a1a1a" }}>{txt(total)} {pluriel(l.unite, total)}</strong></>}
                    </div>
                  </div>
                  {contenu != null && (
                    <Champ etiquette={deuxChamps ? "colis" : l.unite ?? "colis"} valeur={s.colis} desactive={lectureSeule}
                      onChange={(v) => saisir(l, "colis", v)} />
                  )}
                  {(deuxChamps || contenu == null) && (
                    <Champ etiquette={contenu == null ? l.unite ?? "unités" : "unités"} valeur={s.unites} desactive={lectureSeule}
                      onChange={(v) => saisir(l, "unites", v)} />
                  )}
                  <span title={etat === "erreur" ? "Pas enregistré" : etat === "attente" ? "Enregistrement…" : "Enregistré"} style={{
                    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                    background: etat === "erreur" ? "#DC2626" : etat === "attente" ? "#e0b44c" : etat === "ok" ? "#2D6A4F" : "transparent",
                  }} />
                </div>
              </React.Fragment>
            );
          })}

          {!lectureSeule && (
            <div style={{ marginTop: 16, background: "#fff", borderRadius: 12, border: "1px dashed #ddd6c8", padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Ajouter un produit hors liste dans « {libelleZone(zone)} »</div>
              <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher dans la base produits…"
                style={{ width: "100%", height: 42, borderRadius: 10, border: "1px solid #ddd6c8", padding: "0 12px", fontSize: 15, boxSizing: "border-box" }} />
              {resultats.map((r) => (
                <button key={r.id} type="button" disabled={!!enCours} onClick={() => void ajouter(r.id)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 8px", border: "none", borderBottom: "1px solid #f3efe7", background: "none", fontSize: 14, cursor: "pointer" }}>
                  + {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Champ({ etiquette, valeur, desactive, onChange }: { etiquette: string; valeur: string; desactive: boolean; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
      <input inputMode="decimal" value={valeur} disabled={desactive} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Entrée : champ suivant (saisie rapide de la feuille au clavier)
          if (e.key !== "Enter") return;
          e.preventDefault();
          const champs = [...document.querySelectorAll<HTMLInputElement>("input[inputmode=decimal]:not([disabled])")];
          champs[champs.indexOf(e.currentTarget) + 1]?.focus();
        }}
        style={{
          width: 64, height: 40, borderRadius: 10, border: "1.5px solid #ddd6c8", textAlign: "center", fontSize: 17, fontWeight: 700,
          background: desactive ? "#f3efe7" : "#fff", boxSizing: "border-box",
        }} />
      <span style={{ fontSize: 10.5, color: "#8a8378" }}>{etiquette}</span>
    </label>
  );
}

const bouton = (bg: string, fg: string): React.CSSProperties => ({
  height: 40, padding: "0 14px", borderRadius: 10, border: bg === "#fff" ? "1px solid #ddd6c8" : "none", background: bg, color: fg,
  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
});

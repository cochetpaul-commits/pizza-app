import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pdfToText } from "@/lib/pdfToText";
import { parseComboDocument } from "@/lib/combo/comboParser";
import { matchEmployes } from "@/lib/combo/matchEmployes";
import { estRapportEmargements, parseRapportEmargements, type LigneRapport } from "@/lib/combo/rapportEmargements";
import { resolveEtabId, EtabError, roleDenied } from "@/lib/getEtablissement";

export const runtime = "nodejs";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  const refus = await roleDenied(req, ["group_admin"]);
  if (refus) return refus;
  try {
    const form = await req.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") ?? "preview");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Fichier manquant." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    // Rapport « Émargements et validations » (xlsx) : heures validées, par établissement et par semaine
    if (/\.xlsx?$/i.test(file.name)) return importerRapportEmargements(req, bytes, file.name, mode);
    const text = await pdfToText(bytes);

    const parsed = parseComboDocument(text);

    if (!parsed.periode_debut || !parsed.periode_fin) {
      return NextResponse.json({ ok: false, error: "Impossible de detecter la periode dans le PDF." }, { status: 400 });
    }
    if (parsed.employes.length === 0) {
      return NextResponse.json({ ok: false, error: "Aucun employe trouve dans le PDF." }, { status: 400 });
    }

    // Auth
    const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
    });
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });
    const userId = auth?.user?.id ?? null;
    if (!userId) return NextResponse.json({ ok: false, error: "Non authentifie." }, { status: 401 });

    let etabId: string;
    try {
      ({ etabId } = await resolveEtabId(userId, req.headers));
    } catch (e) {
      if (e instanceof EtabError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      throw e;
    }

    // Match employees
    const matches = await matchEmployes(supabase, etabId, parsed.employes);
    const employeSummary = parsed.employes.map(e => ({
      combo_nom: e.combo_nom,
      prenom: e.prenom,
      nom: e.nom,
      equipe: e.equipe,
      employe_id: matches.get(e.combo_nom) ?? null,
      matched: !!matches.get(e.combo_nom),
      heures_planifiees: e.heures_planifiees,
      heures_travaillees: e.heures_travaillees,
      heures_contrat: e.heures_contrat,
      nb_repas: e.nb_repas,
      nb_jours_travailles: e.nb_jours_travailles,
    }));

    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        periode: { debut: parsed.periode_debut, fin: parsed.periode_fin },
        etablissement: parsed.etablissement_nom,
        equipe: parsed.equipe,
        nb_employes: parsed.employes.length,
        employes: employeSummary,
        totaux: {
          heures_planifiees: parsed.employes.reduce((s, e) => s + e.heures_planifiees, 0),
          heures_travaillees: parsed.employes.reduce((s, e) => s + e.heures_travaillees, 0),
          nb_repas: parsed.employes.reduce((s, e) => s + e.nb_repas, 0),
        },
      });
    }

    // Commit mode — upsert import + presences

    // Delete existing import for same period+etab+equipe (replace)
    await supabase
      .from("combo_imports")
      .delete()
      .eq("etablissement_id", etabId)
      .eq("periode_debut", parsed.periode_debut)
      .eq("periode_fin", parsed.periode_fin)
      .eq("equipe", parsed.equipe ?? "");

    // Insert import record
    const { data: importRow, error: importErr } = await supabase
      .from("combo_imports")
      .insert({
        etablissement_id: etabId,
        uploaded_by: userId,
        periode_debut: parsed.periode_debut,
        periode_fin: parsed.periode_fin,
        equipe: parsed.equipe,
        source_file_name: file.name,
        raw_text: text,
        nb_employes: parsed.employes.length,
      })
      .select("id")
      .single();

    if (importErr) {
      return NextResponse.json({ ok: false, error: `Erreur import: ${importErr.message}` }, { status: 500 });
    }

    const importId = importRow.id;

    // Insert presences
    const presenceRows = parsed.employes.map(e => ({
      combo_import_id: importId,
      etablissement_id: etabId,
      employe_id: matches.get(e.combo_nom) ?? null,
      combo_nom: e.combo_nom,
      equipe: e.equipe,
      periode_debut: parsed.periode_debut,
      periode_fin: parsed.periode_fin,
      heures_planifiees: e.heures_planifiees,
      heures_travaillees: e.heures_travaillees,
      heures_contrat: e.heures_contrat,
      nb_repas: e.nb_repas,
      nb_jours_travailles: e.nb_jours_travailles,
      ecart_total: Math.round((e.heures_travaillees - e.heures_planifiees) * 100) / 100,
      detail_jours: e.detail_jours,
      matched: !!matches.get(e.combo_nom),
    }));

    const { error: presErr } = await supabase.from("combo_presences").insert(presenceRows);
    if (presErr) {
      return NextResponse.json({ ok: false, error: `Erreur presences: ${presErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      import_id: importId,
      periode: { debut: parsed.periode_debut, fin: parsed.periode_fin },
      etablissement: parsed.etablissement_nom,
      equipe: parsed.equipe,
      nb_employes: parsed.employes.length,
      employes: employeSummary,
      totaux: {
        heures_planifiees: parsed.employes.reduce((s, e) => s + e.heures_planifiees, 0),
        heures_travaillees: parsed.employes.reduce((s, e) => s + e.heures_travaillees, 0),
        nb_repas: parsed.employes.reduce((s, e) => s + e.nb_repas, 0),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * Import du rapport xlsx des émargements (27/10/2026) : pour chaque semaine du fichier concernant
 * l'établissement, les lignes de combo_presences (synchronisées depuis le planning ou importées) sont
 * remplacées par les heures validées. Un enregistrement combo_imports par semaine protège ensuite la
 * semaine de la synchronisation automatique.
 */
async function importerRapportEmargements(req: Request, bytes: Uint8Array, nomFichier: string, mode: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array" });
  const lignes = wb.SheetNames.flatMap((n) => XLSX.utils.sheet_to_json<LigneRapport>(wb.Sheets[n], { raw: false, defval: "" }));
  if (!estRapportEmargements(lignes)) return NextResponse.json({ ok: false, error: "Ce fichier n'est pas le rapport Combo « Émargements et validations »." }, { status: 400 });

  const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
  });
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user?.id) return NextResponse.json({ ok: false, error: authErr?.message ?? "Non authentifie." }, { status: 401 });
  const userId = auth.user.id;
  let etabId: string;
  try { ({ etabId } = await resolveEtabId(userId, req.headers)); } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
  const { data: etab } = await supabase.from("etablissements").select("slug").eq("id", etabId).maybeSingle();
  const piccola = String(etab?.slug ?? "").includes("piccola");
  const docs = parseRapportEmargements(lignes).filter((d) => /piccola/i.test(d.etablissement_nom) === piccola);
  if (!docs.length) return NextResponse.json({ ok: false, error: "Aucune ligne de cet établissement dans le rapport." }, { status: 400 });

  const resume = [];
  for (const parsed of docs) {
    const matches = await matchEmployes(supabase, etabId, parsed.employes);
    const employes = parsed.employes.map((e) => ({ combo_nom: e.combo_nom, employe_id: matches.get(e.combo_nom) ?? null, matched: !!matches.get(e.combo_nom), heures_planifiees: e.heures_planifiees, heures_travaillees: e.heures_travaillees, nb_jours_travailles: e.nb_jours_travailles }));
    resume.push({ periode: { debut: parsed.periode_debut, fin: parsed.periode_fin }, nb_employes: employes.length, non_relies: employes.filter((e) => !e.matched).map((e) => e.combo_nom), heures_travaillees: Math.round(employes.reduce((t, e) => t + e.heures_travaillees, 0) * 100) / 100 });
    if (mode === "preview") continue;
    await supabase.from("combo_presences").delete().eq("etablissement_id", etabId).eq("periode_debut", parsed.periode_debut).eq("periode_fin", parsed.periode_fin);
    await supabase.from("combo_imports").delete().eq("etablissement_id", etabId).eq("periode_debut", parsed.periode_debut).eq("periode_fin", parsed.periode_fin);
    const { data: imp, error: impErr } = await supabase.from("combo_imports")
      .insert({ etablissement_id: etabId, uploaded_by: userId, periode_debut: parsed.periode_debut, periode_fin: parsed.periode_fin, equipe: null, source_file_name: nomFichier, raw_text: null, nb_employes: parsed.employes.length })
      .select("id").single();
    if (impErr) return NextResponse.json({ ok: false, error: `Erreur import: ${impErr.message}` }, { status: 500 });
    const { error: presErr } = await supabase.from("combo_presences").insert(parsed.employes.map((e) => ({
      combo_import_id: imp.id, etablissement_id: etabId, employe_id: matches.get(e.combo_nom) ?? null, combo_nom: e.combo_nom, equipe: e.equipe,
      periode_debut: parsed.periode_debut, periode_fin: parsed.periode_fin, heures_planifiees: e.heures_planifiees, heures_travaillees: e.heures_travaillees, heures_contrat: e.heures_contrat,
      nb_repas: e.nb_repas, nb_jours_travailles: e.nb_jours_travailles, ecart_total: Math.round((e.heures_travaillees - e.heures_planifiees) * 100) / 100, detail_jours: e.detail_jours, matched: !!matches.get(e.combo_nom),
    })));
    if (presErr) return NextResponse.json({ ok: false, error: `Erreur presences: ${presErr.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, source: "emargements", semaines: resume, nb_employes: Math.max(...resume.map((r) => r.nb_employes)), heures_travaillees: Math.round(resume.reduce((t, r) => t + r.heures_travaillees, 0) * 100) / 100 });
}

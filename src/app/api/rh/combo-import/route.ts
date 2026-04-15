import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pdfToText } from "@/lib/pdfToText";
import { parseComboDocument } from "@/lib/combo/comboParser";
import { matchEmployes } from "@/lib/combo/matchEmployes";
import { resolveEtabId, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") ?? "preview");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Fichier manquant." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
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

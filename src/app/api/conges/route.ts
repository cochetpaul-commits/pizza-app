import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifierReglesConges, formatViolations } from "@/lib/conges/regles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Congés de l'employé connecté.
 *  GET    → ses absences + compteurs + planning d'équipe (absences des
 *           collègues du même établissement) + règles d'absences
 *  POST   → nouvelle demande (statut en_attente) ; refusée si une règle
 *           d'absences simultanées serait dépassée ; notifie les managers
 *  DELETE → annule une de SES demandes encore en attente
 */

async function getMe(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return null;
  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  if (!auth?.user) return null;
  const { data: emps } = await supabaseAdmin
    .from("employes")
    .select("id, prenom, nom, etablissement_id, equipes_access")
    .eq("auth_user_id", auth.user.id)
    .eq("actif", true);
  if (!emps || emps.length === 0) return null;
  return { userId: auth.user.id, emps };
}

export async function GET(req: NextRequest) {
  const me = await getMe(req);
  if (!me) return NextResponse.json({ error: "Aucune fiche employé liée" }, { status: 404 });

  const empIds = me.emps.map(e => e.id);
  const etabIds = [...new Set(me.emps.map(e => e.etablissement_id).filter(Boolean))] as string[];

  // Fenêtre du planning : du 1er du mois précédent à +12 mois
  const now = new Date();
  const winFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const winTo = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), 0)).toISOString().slice(0, 10);

  const [{ data: absences }, { data: collegues }, { data: regles }] = await Promise.all([
    supabaseAdmin
      .from("absences")
      .select("id, date_debut, date_fin, type, nb_jours, statut, note, source, motif_refus, created_at")
      .in("employe_id", empIds)
      .order("date_debut", { ascending: false })
      .limit(60),
    supabaseAdmin
      .from("employes")
      .select("id, prenom, nom, equipes_access, etablissement_id")
      .in("etablissement_id", etabIds.length ? etabIds : ["-"])
      .eq("actif", true),
    supabaseAdmin
      .from("conges_regles")
      .select("etablissement_id, equipe, max_absents")
      .in("etablissement_id", etabIds.length ? etabIds : ["-"])
      .eq("actif", true),
  ]);

  // Absences des collègues (planning) — validées et en attente
  const collegueIds = (collegues ?? []).map(c => c.id);
  const { data: absPlanning } = collegueIds.length
    ? await supabaseAdmin
        .from("absences")
        .select("id, employe_id, date_debut, date_fin, type, statut")
        .in("employe_id", collegueIds)
        .in("statut", ["valide", "en_attente"])
        .lte("date_debut", winTo)
        .gte("date_fin", winFrom)
    : { data: [] };

  const parId = new Map((collegues ?? []).map(c => [c.id, c]));
  const planning = (absPlanning ?? []).map(a => {
    const c = parId.get(a.employe_id);
    return {
      id: a.id,
      employe_id: a.employe_id,
      prenom: c?.prenom ?? "?",
      initiales: `${(c?.prenom ?? "?").charAt(0)}${(c?.nom ?? "").charAt(0)}`.toUpperCase(),
      equipes: (c?.equipes_access as string[] | null) ?? [],
      type: a.type,
      statut: a.statut,
      date_debut: a.date_debut,
      date_fin: a.date_fin,
      mien: empIds.includes(a.employe_id),
    };
  });

  const year = now.getFullYear();
  let prisCP = 0, enAttente = 0;
  for (const a of absences ?? []) {
    if (a.statut === "valide" && a.type === "CP" && String(a.date_debut).startsWith(String(year))) {
      prisCP += Number(a.nb_jours ?? 0);
    }
    if (a.statut === "en_attente") enAttente++;
  }

  return NextResponse.json({
    prenom: me.emps[0].prenom,
    equipes: (me.emps[0].equipes_access as string[] | null) ?? [],
    absences: absences ?? [],
    planning,
    regles: regles ?? [],
    stats: { prisCP, enAttente, annee: year },
  });
}

export async function POST(req: NextRequest) {
  const me = await getMe(req);
  if (!me) return NextResponse.json({ error: "Aucune fiche employé liée" }, { status: 404 });

  const { type, date_debut, date_fin, note } = (await req.json()) as {
    type?: string; date_debut?: string; date_fin?: string; note?: string;
  };
  if (!type || !date_debut || !date_fin) {
    return NextResponse.json({ error: "type, date_debut et date_fin requis" }, { status: 400 });
  }
  if (date_fin < date_debut) {
    return NextResponse.json({ error: "La date de fin est avant la date de début" }, { status: 400 });
  }

  const emp = me.emps[0];

  // Règles d'absences simultanées : on refuse la demande d'emblée plutôt
  // que de laisser un manager la refuser plus tard — l'employé voit tout
  // de suite pourquoi et peut choisir d'autres dates.
  const violations = await verifierReglesConges(emp.id, date_debut, date_fin);
  if (violations.length > 0) {
    return NextResponse.json(
      { error: `Ces dates ne sont pas disponibles — ${formatViolations(violations)}. Choisis d'autres dates ou vois avec un responsable.` },
      { status: 409 },
    );
  }

  const nbJours = Math.round((new Date(date_fin).getTime() - new Date(date_debut).getTime()) / 86400000) + 1;

  const { data: abs, error } = await supabaseAdmin.from("absences").insert({
    employe_id: emp.id,
    etablissement_id: emp.etablissement_id,
    date_debut, date_fin,
    type,
    nb_jours: nbJours,
    statut: "en_attente",
    demandeur_id: emp.id,
    note: note || null,
    source: "app",
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notifier les managers et admins
  const { data: bosses } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .in("role", ["group_admin", "manager"]);
  const fmt = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
  const notifs = (bosses ?? []).map(b => ({
    user_id: b.id,
    type: "conge",
    titre: "Demande de congé",
    corps: `${emp.prenom} ${emp.nom} : du ${fmt(date_debut)} au ${fmt(date_fin)} (${nbJours} j)`,
    lien: "/rh/conges",
  }));
  if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);

  return NextResponse.json({ ok: true, id: abs.id });
}

export async function DELETE(req: NextRequest) {
  const me = await getMe(req);
  if (!me) return NextResponse.json({ error: "Aucune fiche employé liée" }, { status: 404 });
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const empIds = me.emps.map(e => e.id);
  const { data: del, error } = await supabaseAdmin
    .from("absences")
    .delete()
    .eq("id", id)
    .eq("statut", "en_attente")
    .in("employe_id", empIds)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!del || del.length === 0) return NextResponse.json({ error: "Demande introuvable ou déjà traitée" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

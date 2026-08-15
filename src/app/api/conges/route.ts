import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Congés de l'employé connecté.
 *  GET    → ses absences (toutes sources) + compteurs de l'année
 *  POST   → nouvelle demande (statut en_attente) + notification managers
 *  DELETE → annule une de SES demandes encore en attente
 */

async function getMe(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return null;
  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  if (!auth?.user) return null;
  const { data: emps } = await supabaseAdmin
    .from("employes")
    .select("id, prenom, nom, etablissement_id")
    .eq("auth_user_id", auth.user.id)
    .eq("actif", true);
  if (!emps || emps.length === 0) return null;
  return { userId: auth.user.id, emps };
}

export async function GET(req: NextRequest) {
  const me = await getMe(req);
  if (!me) return NextResponse.json({ error: "Aucune fiche employé liée" }, { status: 404 });

  const empIds = me.emps.map(e => e.id);
  const { data: absences } = await supabaseAdmin
    .from("absences")
    .select("id, date_debut, date_fin, type, nb_jours, statut, note, source, motif_refus, created_at")
    .in("employe_id", empIds)
    .order("date_debut", { ascending: false })
    .limit(60);

  const year = new Date().getFullYear();
  let prisCP = 0, enAttente = 0;
  for (const a of absences ?? []) {
    if (a.statut === "valide" && a.type === "CP" && String(a.date_debut).startsWith(String(year))) {
      prisCP += Number(a.nb_jours ?? 0);
    }
    if (a.statut === "en_attente") enAttente++;
  }

  return NextResponse.json({
    prenom: me.emps[0].prenom,
    absences: absences ?? [],
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

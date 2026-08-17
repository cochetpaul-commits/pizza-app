import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifierReglesConges, formatViolations } from "@/lib/conges/regles";

export const runtime = "nodejs";

/**
 * POST /api/conges/decision — un manager/admin tranche une demande de congé.
 * body: { id, action: "valide" | "refuse", motif?, force? }
 * Si la validation dépasse une règle d'absences simultanées, renvoie 409
 * (code "regle") — le manager peut outrepasser en renvoyant force: true.
 * Met à jour l'absence + notifie l'employé concerné.
 */
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  if (!auth?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data: caller } = await supabaseAdmin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (caller?.role !== "group_admin" && caller?.role !== "manager") {
    return NextResponse.json({ error: "Réservé aux managers" }, { status: 403 });
  }

  const { id, action, motif, force } = (await req.json()) as { id?: string; action?: string; motif?: string; force?: boolean };
  if (!id || (action !== "valide" && action !== "refuse")) {
    return NextResponse.json({ error: "id et action (valide|refuse) requis" }, { status: 400 });
  }

  // À la validation : vérifier les règles d'absences simultanées.
  // Le manager reste maître — il peut forcer en connaissance de cause.
  if (action === "valide" && !force) {
    const { data: demande } = await supabaseAdmin
      .from("absences").select("employe_id, date_debut, date_fin").eq("id", id).maybeSingle();
    if (demande) {
      const violations = await verifierReglesConges(
        demande.employe_id, demande.date_debut, demande.date_fin, id,
      );
      if (violations.length > 0) {
        return NextResponse.json(
          { error: formatViolations(violations), code: "regle" },
          { status: 409 },
        );
      }
    }
  }

  // Le valideur est la fiche employé du compte qui tranche (si elle existe)
  const { data: valideurFiche } = await supabaseAdmin
    .from("employes").select("id").eq("auth_user_id", auth.user.id).eq("actif", true).limit(1).maybeSingle();

  const { data: abs, error } = await supabaseAdmin
    .from("absences")
    .update({
      statut: action,
      motif_refus: action === "refuse" ? (motif || null) : null,
      valideur_id: valideurFiche?.id ?? null,
      validated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, date_debut, date_fin, employe_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notifier l'employé s'il a un compte
  const { data: emp } = await supabaseAdmin
    .from("employes").select("auth_user_id, prenom").eq("id", abs.employe_id).maybeSingle();
  if (emp?.auth_user_id) {
    const fmt = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
    await supabaseAdmin.from("notifications").insert({
      user_id: emp.auth_user_id,
      type: "conge",
      titre: action === "valide" ? "Congé accepté ✅" : "Congé refusé",
      corps: `Ta demande du ${fmt(abs.date_debut)} au ${fmt(abs.date_fin)} a été ${action === "valide" ? "acceptée" : `refusée${motif ? ` : ${motif}` : ""}`}`,
      lien: "/mes-conges",
    });
  }

  return NextResponse.json({ ok: true });
}

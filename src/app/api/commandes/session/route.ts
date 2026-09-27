import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { notifyGroupAdmins } from "@/lib/pushNotify";
import { refusDroit } from "@/lib/commandeEnvoi";

/**
 * POST /api/commandes/session
 * Crée une nouvelle session de commande.
 * Body: { supplier_id: string }
 */
export async function POST(req: NextRequest) {
  let etabId: string;
  let userId: string;
  try {
    ({ etabId, userId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { supplier_id } = await req.json();
  if (!supplier_id) {
    return NextResponse.json({ error: "supplier_id requis" }, { status: 400 });
  }

  const { data: session, error } = await supabaseAdmin
    .from("commande_sessions")
    .insert({
      supplier_id,
      etablissement_id: etabId,
      status: "brouillon",
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session });
}

/**
 * GET /api/commandes/session?id=xxx
 * Récupère une session par ID avec ses lignes.
 */
export async function GET(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: session } = await supabaseAdmin
    .from("commande_sessions")
    .select("*")
    .eq("id", id)
    .eq("etablissement_id", etabId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "session introuvable" }, { status: 404 });
  }

  const { data: lignes } = await supabaseAdmin
    .from("commande_lignes")
    .select("*, ingredients(name, category, default_unit)")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ session: { ...session, lignes: lignes ?? [] } });
}

/**
 * PATCH /api/commandes/session
 * Met à jour le statut d'une session.
 * Body: { id: string, status: string, notes?: string }
 */
export async function PATCH(req: NextRequest) {
  let etabId: string;
  let userId: string;
  try {
    ({ etabId, userId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { id, status, notes } = await req.json();
  if (!id || !status) {
    return NextResponse.json({ error: "id et status requis" }, { status: 400 });
  }

  // Verify session belongs to this etablissement
  const { data: existing } = await supabaseAdmin
    .from("commande_sessions")
    .select("id, status, supplier_id")
    .eq("id", id)
    .eq("etablissement_id", etabId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "session introuvable" }, { status: 404 });
  }

  // « envoyee » n'est posé que par l'envoi du mail (send-email), jamais à la main
  if (status === "envoyee") {
    return NextResponse.json({ error: "Une commande passe en « envoyée » uniquement par l'envoi du mail" }, { status: 400 });
  }
  // Valider, ou rouvrir une commande validée / envoyée : contrôlé ici, pas seulement à l'écran
  if (status === "validee" || (status === "brouillon" && (existing.status === "validee" || existing.status === "envoyee"))) {
    const refus = await refusDroit(userId, existing.supplier_id as string);
    if (refus) return NextResponse.json({ error: refus }, { status: 403 });
  }

  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (notes !== undefined) update.notes = notes;

  // Recalculer total_ht
  const { data: lignes } = await supabaseAdmin
    .from("commande_lignes")
    .select("total_ligne_ht")
    .eq("session_id", id);

  if (lignes) {
    update.total_ht = lignes.reduce((sum, l) => sum + (Number(l.total_ligne_ht) || 0), 0);
  }

  const { data: session, error } = await supabaseAdmin
    .from("commande_sessions")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notification quand une commande passe en "validee"
  if (status === "validee" && session) {
    const { data: supplier } = await supabaseAdmin
      .from("suppliers")
      .select("name")
      .eq("id", session.supplier_id)
      .single();
    const supplierName = supplier?.name ?? "fournisseur";

    // In-app notifications pour tous les group_admin
    const { data: admins } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "group_admin");

    const commandeLink = `/commandes?supplier_id=${session.supplier_id}`;

    if (admins?.length) {
      await supabaseAdmin.from("notifications").insert(
        admins.map((a: { id: string }) => ({
          user_id: a.id,
          type: "alerte",
          titre: `Commande ${supplierName} a valider`,
          corps: `Une commande ${supplierName} attend votre validation.`,
          lien: commandeLink,
          lu: false,
        })),
      );
    }

    // Push notification (fire & forget)
    void notifyGroupAdmins({
      title: `Commande ${supplierName}`,
      body: `Une commande ${supplierName} attend votre validation.`,
      url: commandeLink,
    });
  }

  return NextResponse.json({ session });
}

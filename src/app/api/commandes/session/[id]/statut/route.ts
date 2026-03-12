import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/commandes/auth";

export const runtime = "nodejs";

const STATUTS = ["brouillon", "en_attente", "valide", "commande", "recu"] as const;
type Statut = (typeof STATUTS)[number];

/** Transitions autorisées : statut actuel → statuts suivants possibles */
const TRANSITIONS: Record<Statut, Statut[]> = {
  brouillon: ["en_attente"],
  en_attente: ["brouillon", "valide"],
  valide: ["commande", "en_attente"],
  commande: ["recu"],
  recu: [],
};

/** Rôles autorisés pour chaque transition */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  "brouillon->en_attente": ["cuisine", "direction", "admin"],
  "en_attente->brouillon": ["direction", "admin"],
  "en_attente->valide": ["direction", "admin"],
  "valide->en_attente": ["direction", "admin"],
  "valide->commande": ["direction", "admin"],
  "commande->recu": ["direction", "admin"],
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/commandes/session/[id]/statut
 * Change the status of an order session.
 * Body: { statut: string }
 */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await authenticateRequest(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase, userId, role } = auth;

    const body = await req.json();
    const newStatut = body.statut as Statut | undefined;

    if (!newStatut || !STATUTS.includes(newStatut)) {
      return NextResponse.json(
        { ok: false, error: `statut invalide. Valeurs possibles: ${STATUTS.join(", ")}` },
        { status: 400 }
      );
    }

    // Fetch current session
    const { data: session, error: fetchErr } = await supabase
      .from("commande_sessions")
      .select("id, statut")
      .eq("id", id)
      .single();

    if (fetchErr || !session) {
      return NextResponse.json(
        { ok: false, error: fetchErr?.message ?? "Session introuvable." },
        { status: 404 }
      );
    }

    const currentStatut = session.statut as Statut;

    // Check transition is valid
    if (!TRANSITIONS[currentStatut]?.includes(newStatut)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Transition ${currentStatut} → ${newStatut} non autorisée.`,
        },
        { status: 400 }
      );
    }

    // Check role permission
    const transitionKey = `${currentStatut}->${newStatut}`;
    const allowedRoles = ROLE_PERMISSIONS[transitionKey] ?? [];
    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { ok: false, error: `Rôle '${role}' non autorisé pour cette transition.` },
        { status: 403 }
      );
    }

    // Build update payload
    const updates: Record<string, unknown> = { statut: newStatut };
    if (newStatut === "valide") {
      updates.validated_by = userId;
      updates.validated_at = new Date().toISOString();
    } else if (newStatut === "commande") {
      updates.ordered_at = new Date().toISOString();
    } else if (newStatut === "recu") {
      updates.received_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("commande_sessions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, session: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

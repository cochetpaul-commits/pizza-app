import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import { destinatairesBloques, DOMAINE_AUTORISE_HORS_PRODUCTION } from "@/lib/envoiGardeFou";

/**
 * Accès de l'équipe (admins uniquement, toujours côté serveur) :
 * invitation, rôle, établissements, désactivation / réactivation, renvoi d'invitation.
 * Règles (Paul, 29/09) :
 *  - rôle parmi équipier, manager, admin ; au moins un établissement existant ;
 *  - un admin ne modifie pas son propre rôle et ne se désactive pas lui-même ;
 *  - on ne retire ni ne désactive jamais le dernier admin actif ;
 *  - désactiver bloque le compte sans le supprimer et coupe ses sessions ;
 *  - chaque changement est inscrit au journal (acces_journal).
 */

export const ROLES = ["equipier", "manager", "group_admin"] as const;
export type RoleApp = (typeof ROLES)[number];
export const LIBELLE_ROLE: Record<RoleApp, string> = { equipier: "Équipier", manager: "Manager", group_admin: "Admin" };

export class AccesErreur extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** Validation pure (testée) : rôle connu, au moins un établissement, tous existants */
export function verifierRoleEtablissements(role: unknown, etablissements: unknown, existants: string[]): { role: RoleApp; etablissements: string[] } {
  if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) {
    throw new AccesErreur("Rôle invalide : équipier, manager ou admin");
  }
  const liste = Array.isArray(etablissements) ? [...new Set(etablissements.map(String))] : [];
  if (liste.length === 0) throw new AccesErreur("Choisissez au moins un établissement");
  const inconnus = liste.filter((e) => !existants.includes(e));
  if (inconnus.length) throw new AccesErreur("Établissement inconnu");
  return { role: role as RoleApp, etablissements: liste };
}

/** Règles pures (testées) sur un changement de rôle ou une désactivation */
export function verifierRegles(p: {
  parId: string; cibleId: string; roleActuel: string | null; cibleActive: boolean;
  nouveauRole?: string; desactiver?: boolean; adminsActifs: string[];
}): void {
  const soiMeme = p.parId === p.cibleId;
  if (soiMeme && p.nouveauRole && p.nouveauRole !== p.roleActuel) throw new AccesErreur("Vous ne pouvez pas modifier votre propre rôle", 403);
  if (soiMeme && p.desactiver) throw new AccesErreur("Vous ne pouvez pas désactiver votre propre compte", 403);
  const estAdminActif = p.roleActuel === "group_admin" && p.cibleActive;
  const perdAdmin = (p.nouveauRole !== undefined && p.nouveauRole !== "group_admin") || p.desactiver === true;
  if (estAdminActif && perdAdmin && p.adminsActifs.filter((id) => id !== p.cibleId).length === 0) {
    throw new AccesErreur("Impossible : c'est le dernier admin actif", 409);
  }
}

async function etablissementsExistants(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("etablissements").select("id");
  return (data ?? []).map((e) => e.id as string);
}

async function adminsActifs(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("profiles").select("id").eq("role", "group_admin").is("desactive_le", null);
  return (data ?? []).map((p) => p.id as string);
}

async function journaliser(e: { par: string; cible: string | null; cible_email?: string | null; action: string; avant?: unknown; apres?: unknown; note?: string }) {
  await supabaseAdmin.from("acces_journal").insert({
    par: e.par, cible: e.cible, cible_email: e.cible_email ?? null, action: e.action,
    avant: e.avant ?? null, apres: e.apres ?? null, note: e.note ?? null,
  });
}

type UtilisateurAuth = { id: string; email?: string; last_sign_in_at?: string | null; email_confirmed_at?: string | null; invited_at?: string | null; banned_until?: string | null };

async function tousLesUtilisateurs(): Promise<UtilisateurAuth[]> {
  const tous: UtilisateurAuth[] = [];
  for (let page = 1; page < 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new AccesErreur(error.message, 500);
    tous.push(...(data.users as unknown as UtilisateurAuth[]));
    if (data.users.length < 200) break;
  }
  return tous;
}

export type Compte = {
  id: string; email: string | null; nom: string | null; role: string | null; etablissements: string[];
  statut: "actif" | "invitation" | "desactive"; derniere_connexion: string | null; invite_le: string | null;
};

export async function listerComptes(): Promise<{ comptes: Compte[]; etablissements: { id: string; nom: string }[]; journal: unknown[] }> {
  const [utilisateurs, { data: profils }, { data: etabs }, { data: journal }] = await Promise.all([
    tousLesUtilisateurs(),
    supabaseAdmin.from("profiles").select("id, display_name, role, etablissements_access, desactive_le"),
    supabaseAdmin.from("etablissements").select("id, nom").order("nom"),
    supabaseAdmin.from("acces_journal").select("fait_le, action, cible, cible_email, avant, apres, note, par").order("fait_le", { ascending: false }).limit(30),
  ]);
  const parId = new Map((profils ?? []).map((p) => [p.id as string, p]));
  const comptes: Compte[] = utilisateurs.map((u) => {
    const p = parId.get(u.id);
    const desactive = !!p?.desactive_le;
    const enAttente = !u.email_confirmed_at && !u.last_sign_in_at;
    return {
      id: u.id, email: u.email ?? null, nom: (p?.display_name as string | null) ?? null, role: (p?.role as string | null) ?? null,
      etablissements: (p?.etablissements_access as string[] | null) ?? [],
      statut: (desactive ? "desactive" : enAttente ? "invitation" : "actif") as Compte["statut"],
      derniere_connexion: u.last_sign_in_at ?? null, invite_le: u.invited_at ?? null,
    };
  }).sort((a, b) => (a.nom ?? a.email ?? "").localeCompare(b.nom ?? b.email ?? "", "fr", { sensitivity: "base" }));
  const noms = new Map((profils ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? ""]));
  const journalLisible = (journal ?? []).map((j) => ({ ...j, par_nom: noms.get(j.par as string) ?? null, cible_nom: j.cible ? noms.get(j.cible as string) ?? null : null }));
  return { comptes, etablissements: (etabs ?? []) as { id: string; nom: string }[], journal: journalLisible };
}

/** Garde-fou hors production (preview, local) : pas d'invitation vers une adresse extérieure à @bellomio.fr */
function verifierHorsProduction(email: string) {
  if (destinatairesBloques([email]).length) {
    throw new AccesErreur(`Invitation bloquée hors production : seules les adresses @${DOMAINE_AUTORISE_HORS_PRODUCTION} sont autorisées`, 403);
  }
}

export async function inviter(entree: { email?: unknown; nom?: unknown; role?: unknown; etablissements?: unknown }, parId: string, origine: string) {
  const email = String(entree.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccesErreur("Adresse e-mail invalide");
  const { role, etablissements } = verifierRoleEtablissements(entree.role, entree.etablissements, await etablissementsExistants());
  const nom = String(entree.nom ?? "").trim() || email;
  const existant = (await tousLesUtilisateurs()).find((u) => (u.email ?? "").toLowerCase() === email);
  if (existant) throw new AccesErreur("Un compte existe déjà pour cette adresse : modifiez-le dans la liste", 409);
  verifierHorsProduction(email);

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: nom, role },
    redirectTo: `${origine}/auth/setup-password`,
  });
  if (error || !data.user) throw new AccesErreur(`Invitation impossible : ${error?.message ?? "erreur inconnue"}`, 500);
  const id = data.user.id;

  // Profil fixé côté serveur (le déclencheur de création peut l'avoir déjà créé)
  await supabaseAdmin.from("profiles").upsert({ id, role, display_name: nom, etablissements_access: etablissements, desactive_le: null }, { onConflict: "id" });
  // Fiches employés actives à la même adresse : reliées au compte
  const { data: fiches } = await supabaseAdmin.from("employes").select("id").ilike("email", email).eq("actif", true);
  if (fiches?.length) await supabaseAdmin.from("employes").update({ auth_user_id: id }).in("id", fiches.map((f) => f.id));

  await journaliser({ par: parId, cible: id, cible_email: email, action: "invitation", apres: { role, etablissements, nom } });
  return { id };
}

export async function modifierCompte(cibleId: string, entree: { role?: unknown; etablissements?: unknown }, parId: string) {
  const { data: p } = await supabaseAdmin.from("profiles").select("id, role, etablissements_access, desactive_le").eq("id", cibleId).maybeSingle();
  if (!p) throw new AccesErreur("Compte introuvable", 404);
  const { role, etablissements } = verifierRoleEtablissements(entree.role ?? p.role, entree.etablissements ?? p.etablissements_access, await etablissementsExistants());
  verifierRegles({ parId, cibleId, roleActuel: p.role as string, cibleActive: !p.desactive_le, nouveauRole: role, adminsActifs: await adminsActifs() });

  const avant = { role: p.role, etablissements: (p.etablissements_access as string[] | null) ?? [] };
  if (avant.role === role && JSON.stringify([...avant.etablissements].sort()) === JSON.stringify([...etablissements].sort())) return { inchange: true };

  const { error } = await supabaseAdmin.from("profiles").update({ role, etablissements_access: etablissements, updated_at: new Date().toISOString() }).eq("id", cibleId);
  if (error) throw new AccesErreur(error.message, 500);
  // Les fiches employés reliées portent le même rôle (affichage RH) ; la seule source des droits reste le profil
  await supabaseAdmin.from("employes").update({ role }).eq("auth_user_id", cibleId);

  if (avant.role !== role) await journaliser({ par: parId, cible: cibleId, action: "role", avant: { role: avant.role }, apres: { role } });
  if (JSON.stringify([...avant.etablissements].sort()) !== JSON.stringify([...etablissements].sort())) {
    await journaliser({ par: parId, cible: cibleId, action: "etablissements", avant: { etablissements: avant.etablissements }, apres: { etablissements } });
  }
  return { inchange: false };
}

export async function changerActivation(cibleId: string, actif: boolean, parId: string, note?: string) {
  const { data: p } = await supabaseAdmin.from("profiles").select("id, role, desactive_le").eq("id", cibleId).maybeSingle();
  if (!p) throw new AccesErreur("Compte introuvable", 404);
  if (!actif) verifierRegles({ parId, cibleId, roleActuel: p.role as string, cibleActive: !p.desactive_le, desactiver: true, adminsActifs: await adminsActifs() });
  if (actif === !p.desactive_le) return { inchange: true };

  // Blocage de connexion (sans suppression) + droits coupés immédiatement (profil) + sessions fermées
  const { error: e1 } = await supabaseAdmin.auth.admin.updateUserById(cibleId, { ban_duration: actif ? "none" : "876000h" });
  if (e1) throw new AccesErreur(e1.message, 500);
  await supabaseAdmin.from("profiles").update({ desactive_le: actif ? null : new Date().toISOString() }).eq("id", cibleId);
  if (!actif) await supabaseAdmin.rpc("couper_sessions", { p_user: cibleId });

  await journaliser({ par: parId, cible: cibleId, action: actif ? "reactivation" : "desactivation", note });
  return { inchange: false };
}

export async function renvoyerInvitation(cibleId: string, parId: string, origine: string) {
  const u = (await tousLesUtilisateurs()).find((x) => x.id === cibleId);
  if (!u?.email) throw new AccesErreur("Compte introuvable", 404);
  if (u.email_confirmed_at || u.last_sign_in_at) throw new AccesErreur("Ce compte a déjà accepté son invitation", 409);
  verifierHorsProduction(u.email);

  // Nouveau lien sans supprimer le compte ; envoyé par notre propre mail
  const redirectTo = `${origine}/auth/setup-password`;
  let lien: string | undefined;
  const essai = await supabaseAdmin.auth.admin.generateLink({ type: "invite", email: u.email, options: { redirectTo } });
  lien = essai.data?.properties?.action_link;
  if (!lien) {
    const repli = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: u.email, options: { redirectTo } });
    lien = repli.data?.properties?.action_link;
    if (!lien) throw new AccesErreur(`Lien impossible : ${repli.error?.message ?? essai.error?.message ?? "erreur inconnue"}`, 500);
  }
  if (!process.env.RESEND_API_KEY) throw new AccesErreur("RESEND_API_KEY manquante", 500);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: `iFratelli <${process.env.RESEND_FROM ?? "commande@bellomio.fr"}>`,
    to: [u.email],
    subject: "Votre accès à l'application iFratelli",
    html: `<div style="font-family:-apple-system,Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#1a1a1a">
      <p>Bonjour,</p>
      <p>Voici votre lien pour créer votre mot de passe et accéder à l'application iFratelli :</p>
      <p><a href="${lien}" style="display:inline-block;padding:12px 20px;background:#D4775A;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">Créer mon mot de passe</a></p>
      <p style="color:#6f6656;font-size:13px">Ce lien est personnel. Si vous n'êtes pas concerné, ignorez ce message.</p></div>`,
  });
  if (error) throw new AccesErreur(`Envoi impossible : ${error.message}`, 500);
  await journaliser({ par: parId, cible: cibleId, cible_email: u.email, action: "renvoi_invitation" });
  return { ok: true };
}

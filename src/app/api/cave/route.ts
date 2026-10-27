import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { hasPermission } from "@/lib/permissions";
import { permissionsEmploye } from "@/lib/commandeEnvoi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cave Bello Mio (27/10/2026) : les fiches vin pour la salle, les accords avec la carte, le stock à J-1.
 * GET : vins de la carte (?tous=1 : aussi l'archive), accords, plats de la carte, stock par vin ; les prix
 *      d'achat et la marge seulement avec « Voir les valeurs monétaires ». ?plat=NOM : les vins d'un plat.
 * PUT { id, ...champs } : modifie une fiche (« Créer et modifier les recettes ») ; { id, valider: true } la valide.
 * POST { vin_id, plat_nom, raison } : ajoute un accord ; DELETE ?accord= : le retire.
 */
export type VinCave = {
  id: string; cle: string; nom: string; couleur: string; nom_complet: string | null; domaine: string | null; region: string | null; appellation: string | null;
  cepages: string | null; vinification: string | null; degre: string | null; millesime: string | null;
  profil: { corps: number; fruit: number; fraicheur: number; tanins: number } | null;
  oeil: string | null; nez: string | null; bouche: string | null; garde: string | null; service: string | null; carafage: string | null;
  histoire: string | null; anecdote: string | null; accords_generiques: string | null; pitch: string | null; astuce: string | null; note: string | null;
  sources: unknown[]; statut: string; sur_carte: boolean; carte_popina: string | null; ingredient_id: string | null;
  prix: { b?: number; v?: number; d?: number; m?: number } | null;
  /** Bouteilles en cave à J-1 (stock théorique du produit relié), null si pas de produit */
  stock: number | null;
  /** Direction seulement */
  achat: { prix_ht: number | null; coefficient: number | null } | null;
  accords: { id: string; plat_nom: string; plat_popina_id: string | null; raison: string | null; ordre: number; source: string }[];
};

const CHAMPS = ["nom", "couleur", "nom_complet", "domaine", "region", "appellation", "cepages", "vinification", "degre", "millesime", "profil", "oeil", "nez", "bouche", "garde", "service", "carafage", "histoire", "anecdote", "accords_generiques", "pitch", "astuce", "note", "sur_carte", "carte_popina", "ingredient_id", "prix"] as const;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

async function acces(req: NextRequest) {
  let a: { etabId: string; userId: string };
  try { a = await getEtablissement(req); } catch (e) {
    if (e instanceof EtabError) return { erreur: NextResponse.json({ error: e.message }, { status: e.status }) };
    throw e;
  }
  const [{ data: profil }, perms] = await Promise.all([supabaseAdmin.from("profiles").select("role").eq("id", a.userId).maybeSingle(), permissionsEmploye(a.userId)]);
  const role = String(profil?.role ?? "");
  return { ...a, edition: hasPermission(role, "operations.edit_recettes", perms), argent: hasPermission(role, "performances.show_money", perms) };
}

/** Stock théorique des produits (dernier inventaire clôturé + mouvements), même règle que /api/stock */
async function stockProduits(etabId: string, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const { data: inv } = await supabaseAdmin.from("inventaires").select("id, cloture_at").eq("etablissement_id", etabId).eq("statut", "cloture").order("date", { ascending: false }).limit(1).maybeSingle();
  if (inv?.id) {
    const { data: lignes } = await supabaseAdmin.from("inventaire_lignes").select("ingredient_id, quantite").eq("inventaire_id", inv.id).in("ingredient_id", ids);
    for (const l of lignes ?? []) out.set(l.ingredient_id as string, Number(l.quantite) || 0);
  }
  let q = supabaseAdmin.from("stock_movements").select("ingredient_id, quantity").eq("etablissement_id", etabId).in("ingredient_id", ids);
  if (inv?.cloture_at) q = q.gte("created_at", inv.cloture_at as string);
  const { data: mv } = await q;
  for (const m of mv ?? []) out.set(m.ingredient_id as string, (out.get(m.ingredient_id as string) ?? 0) + (Number(m.quantity) || 0));
  return out;
}

export async function GET(req: NextRequest) {
  const a = await acces(req);
  if ("erreur" in a) return a.erreur;
  const tous = !!req.nextUrl.searchParams.get("tous");
  const plat = req.nextUrl.searchParams.get("plat");
  let q = supabaseAdmin.from("vins").select("*").order("couleur").order("nom");
  if (!tous) q = q.eq("sur_carte", true);
  const [{ data: vins, error }, { data: accords }, { data: plats }, { data: touches }] = await Promise.all([
    q,
    supabaseAdmin.from("vins_accords").select("id, vin_id, plat_nom, plat_popina_id, raison, ordre, source").order("ordre"),
    supabaseAdmin.from("popina_products").select("id, name, category, price_ttc").eq("active", true).in("category", ["ANTIPASTI", "PIZZE", "CUCINA", "DOLCI"]).order("category").order("name"),
    supabaseAdmin.from("popina_products").select("id, name, ingredient_id").eq("active", true).eq("category", "VINI"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Produit relié : la fiche, sinon la touche Popina « Btl. … » de la carte
  const touchePar = new Map((touches ?? []).map((t) => [norm(String(t.name)), t]));
  const ingredientDe = (v: { ingredient_id: string | null; carte_popina: string | null }) => v.ingredient_id ?? (v.carte_popina ? (touchePar.get(norm(v.carte_popina))?.ingredient_id as string | null) ?? null : null);
  const ids = [...new Set((vins ?? []).map(ingredientDe).filter((x): x is string => !!x))];
  const [stock, { data: produits }] = await Promise.all([
    stockProduits(a.etabId, ids),
    a.argent && ids.length ? supabaseAdmin.from("ingredients").select("id, purchase_price, cost_per_unit, purchase_unit").in("id", ids) : Promise.resolve({ data: [] as { id: string; purchase_price: number | null; cost_per_unit: number | null; purchase_unit: number | null }[] }),
  ]);
  const produitPar = new Map((produits ?? []).map((p) => [p.id as string, p]));
  const platPar = new Map((plats ?? []).map((p) => [norm(String(p.name)), p]));
  const sortie: VinCave[] = (vins ?? []).map((v) => {
    const ingredientId = ingredientDe(v);
    const prod = ingredientId ? produitPar.get(ingredientId) : null;
    const prixHt = prod ? Number(prod.purchase_price) || null : null;
    const prixB = (v.prix as { b?: number } | null)?.b ?? null;
    return {
      ...(v as unknown as VinCave), ingredient_id: ingredientId,
      stock: ingredientId && stock.has(ingredientId) ? Math.round(stock.get(ingredientId)! * 100) / 100 : null,
      achat: a.argent ? { prix_ht: prixHt, coefficient: prixHt && prixB ? Math.round((prixB / 1.2 / prixHt) * 10) / 10 : null } : null,
      accords: (accords ?? []).filter((x, i, l) => x.vin_id === v.id && l.findIndex((y) => y.vin_id === v.id && norm(y.plat_nom) === norm(x.plat_nom)) === i).map((x) => ({ id: x.id, plat_nom: x.plat_nom, plat_popina_id: x.plat_popina_id ?? platPar.get(norm(x.plat_nom))?.id ?? null, raison: x.raison, ordre: x.ordre, source: x.source })),
    };
  });
  if (plat) {
    const n = norm(plat);
    const pour = sortie.filter((v) => v.sur_carte && v.accords.some((x) => norm(x.plat_nom) === n || (x.plat_popina_id && platPar.get(n)?.id === x.plat_popina_id)))
      .map((v) => ({ id: v.id, nom: v.nom, couleur: v.couleur, pitch: v.pitch, prix: v.prix, stock: v.stock, raison: v.accords.find((x) => norm(x.plat_nom) === n)?.raison ?? null }));
    return NextResponse.json({ plat, vins: pour });
  }
  return NextResponse.json({
    vins: sortie, edition: a.edition, argent: a.argent,
    plats: (plats ?? []).map((p) => ({ id: p.id, nom: String(p.name).trim(), categorie: p.category, prix: Number(p.price_ttc) || 0 })),
  });
}

export async function PUT(req: NextRequest) {
  const a = await acces(req);
  if ("erreur" in a) return a.erreur;
  if (!a.edition) return NextResponse.json({ error: "Réservé : « Créer et modifier les recettes »." }, { status: 403 });
  const body = await req.json().catch(() => null) as (Record<string, unknown> & { id?: string; valider?: boolean }) | null;
  if (!body?.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const maj: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const c of CHAMPS) if (c in body) maj[c] = body[c];
  if (body.valider === true) { maj.statut = "valide"; maj.valide_par = a.userId; maj.valide_at = new Date().toISOString(); }
  if (body.valider === false) { maj.statut = "a_valider"; maj.valide_par = null; maj.valide_at = null; }
  const { data, error } = await supabaseAdmin.from("vins").update(maj).eq("id", body.id).select("id, statut").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const a = await acces(req);
  if ("erreur" in a) return a.erreur;
  if (!a.edition) return NextResponse.json({ error: "Réservé : « Créer et modifier les recettes »." }, { status: 403 });
  const body = await req.json().catch(() => null) as { vin_id?: string; plat_nom?: string; plat_popina_id?: string | null; raison?: string } | null;
  if (!body?.vin_id || !body.plat_nom?.trim()) return NextResponse.json({ error: "vin_id et plat_nom requis" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("vins_accords").insert({ vin_id: body.vin_id, plat_nom: body.plat_nom.trim(), plat_popina_id: body.plat_popina_id ?? null, raison: body.raison?.trim() || null, ordre: 9, source: "main" }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function DELETE(req: NextRequest) {
  const a = await acces(req);
  if ("erreur" in a) return a.erreur;
  if (!a.edition) return NextResponse.json({ error: "Réservé : « Créer et modifier les recettes »." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("accord");
  if (!id) return NextResponse.json({ error: "accord requis" }, { status: 400 });
  const { error } = await supabaseAdmin.from("vins_accords").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

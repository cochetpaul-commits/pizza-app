import { NextRequest, NextResponse } from "next/server";
import React from "react";
import fs from "fs";
import path from "path";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FicheTechniquePdf, type FicheTechniquePdfData } from "@/lib/ficheTechniquePdf";
import { clairCategorie, couleurCategorie, LIBELLES_CATEGORIE, moisAnnee, nomLisible, titreFiche } from "@/lib/ficheTechnique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/recettes/pdf?id=…&portions=N | &facteur=F — la fiche technique d'une recette (kitchen_recipes), appelée
 * par tous les boutons « Imprimer » (Carte, Fiches, éditeur, Produire).
 * 25/11/2026 (brief de Paul) : nouveau modèle à deux colonnes (lib/ficheTechniquePdf), couleur de la catégorie,
 * sans coûts, fournisseurs, pertes, allergènes, référence ni établissement.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
function logo(): string | null {
  try { return `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), "public", "logo-ifratelli-filigrane.png")).toString("base64")}`; } catch { return null; }
}
function listeEtapes(v: unknown): string[] {
  if (v == null) return [];
  try { const p = typeof v === "string" ? JSON.parse(v) : v; if (Array.isArray(p)) return p.map(String).filter((x) => x.trim()); } catch { /* texte simple */ }
  return typeof v === "string" ? v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [];
}
/** Préparations vendues ou produites au poids : la fiche affiche le poids plutôt que des portions */
const CATEGORIES_AU_POIDS = new Set(["preparation", "sauce"]);

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const portions = parseInt(req.nextUrl.searchParams.get("portions") ?? "") || null;
  const facteurParam = parseFloat(req.nextUrl.searchParams.get("facteur") ?? "");

  const { data: r, error } = await supabaseAdmin.from("kitchen_recipes").select("*").eq("id", id).maybeSingle();
  if (error || !r) return NextResponse.json({ error: "Recette introuvable" }, { status: 404 });

  const portionsFiche = Math.max(1, Number(r.portions_count) || Number(r.nb_parts) || 1);
  // « Produire » : facteur sur toute la fiche ; ?portions=N : la fiche ramenée à N portions
  const facteur = Number.isFinite(facteurParam) && facteurParam > 0 ? facteurParam : portions ? portions / portionsFiche : 1;

  const { data: lignes } = await supabaseAdmin.from("kitchen_recipe_lines").select("ingredient_id, qty, unit, sort_order, stage").eq("recipe_id", id).order("sort_order");
  const ids = [...new Set((lignes ?? []).map((l) => l.ingredient_id).filter(Boolean))] as string[];
  const { data: ings } = ids.length ? await supabaseAdmin.from("ingredients").select("id, name").in("id", ids) : { data: [] as never[] };
  const nomIng = new Map((ings ?? []).map((i) => [i.id as string, String(i.name)]));
  type LignePdf = { name: string; qty: number | null; unit: string; stage: string | null };
  const lignesPdf: LignePdf[] = (lignes ?? []).map((l) => ({
    name: (l.ingredient_id ? nomIng.get(l.ingredient_id as string) : undefined) ?? "—",
    qty: l.qty == null ? null : r2(Number(l.qty) * facteur),
    unit: (l.unit as string | null) ?? "g",
    stage: (l.stage as string | null) ?? null,
  }));
  // Pizza : le pâton en première ligne
  const estPizza = r.category === "pizza";
  if (estPizza && Number(r.ball_weight_g) > 0) {
    let pate = "Pâton";
    if (r.dough_recipe_id) { const { data: d } = await supabaseAdmin.from("recipes").select("name").eq("id", r.dough_recipe_id).maybeSingle(); if (d?.name) pate = `Pâton · ${d.name}`; }
    lignesPdf.unshift({ name: pate, qty: r2(Number(r.ball_weight_g) * facteur), unit: "g", stage: "pre" });
  }

  // Nouveau modèle (25/11/2026, brief de Paul) : pas de coûts, pas de fournisseur, pas d'allergènes
  const portionsTexte = (() => {
    const n = Math.round(portionsFiche * facteur * 10) / 10;
    const poids = Number(r.yield_grams) > 0 ? Number(r.yield_grams) * facteur : null;
    if (CATEGORIES_AU_POIDS.has(String(r.category)) && poids) return poids >= 1000 ? `${(Math.round(poids / 10) / 100).toLocaleString("fr-FR")} kg` : `${Math.round(poids)} g`;
    return `${n.toLocaleString("fr-FR")} ${estPizza ? (n > 1 ? "pizzas" : "pizza") : n > 1 ? "portions" : "portion"}`;
  })();
  const data: FicheTechniquePdfData = {
    nom: titreFiche(String(r.name ?? "Recette")),
    categorie: LIBELLES_CATEGORIE[String(r.category)] ?? String(r.category ?? "Fiche"),
    couleur: couleurCategorie(r.category as string | null),
    clair: clairCategorie(r.category as string | null),
    portions: portionsTexte,
    miseAJour: moisAnnee(new Date(String(r.updated_at ?? new Date().toISOString()))),
    logo: logo(),
    lignes: lignesPdf.map((l) => ({ nom: l.name ? nomLisible(l.name) : "—", qte: l.qty, unite: l.unit ?? "g", stage: l.stage })),
    etapes: listeEtapes(r.procedure).length ? listeEtapes(r.procedure) : listeEtapes(r.notes),
    // « À retenir » : les notes, seulement quand elles ne servent pas déjà d'instructions
    notes: listeEtapes(r.procedure).length && typeof r.notes === "string" ? r.notes : null,
  };

  const buffer = await renderToBuffer(FicheTechniquePdf({ data }) as unknown as React.ReactElement<DocumentProps>);
  const nom = String(r.name ?? "fiche").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="fiche-${nom || "recette"}${facteur !== 1 ? `-x${r2(facteur)}` : ""}.pdf"` },
  });
}

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type AppCategory = {
  id: string;
  nom: string;
  slug: string;
  couleur: string;
  famille_id: string;
  sous_categories: string[];
  sort_order: number;
  establishments?: string[] | null;
};

let cached: AppCategory[] | null = null;
let loading = false;
const listeners = new Set<(cats: AppCategory[]) => void>();

async function fetchCategories() {
  if (loading) return;
  loading = true;
  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order")
    .order("nom");
  cached = (data ?? []) as AppCategory[];
  loading = false;
  for (const fn of listeners) fn(cached);
}

/** Hook: returns all categories from the `categories` table, cached globally. */
export function useCategories(): { categories: AppCategory[]; reload: () => void } {
  const [cats, setCats] = useState<AppCategory[]>(cached ?? []);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const listener = (c: AppCategory[]) => { if (mounted.current) setCats(c); };
    listeners.add(listener);
    if (!cached) fetchCategories();
    return () => { mounted.current = false; listeners.delete(listener); };
  }, []);

  return {
    categories: cats,
    reload: () => { cached = null; fetchCategories(); },
  };
}

/** Filter categories for a specific establishment. */
export function filterCategoriesForEtab(cats: AppCategory[], etabSlug: string | null | undefined): AppCategory[] {
  if (!etabSlug) return cats;
  const key = etabSlug.includes("piccola") ? "piccola" : "bellomio";
  return cats.filter(c => !c.establishments || c.establishments.includes(key));
}

/** Get category color by slug (synchronous, uses cache). */
export function getCategoryColorBySlug(slug: string): string {
  const cat = cached?.find(c => c.slug === slug);
  return cat?.couleur ?? "#4a6741";
}

/** Get category label by slug. */
export function getCategoryLabelBySlug(slug: string): string {
  const cat = cached?.find(c => c.slug === slug);
  return cat?.nom ?? slug;
}

import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase simulé : session et contenu des tables réglables par test
const etat = vi.hoisted(() => ({ session: true as boolean, categories: [] as unknown[], appels: 0 }));
vi.mock("@/lib/supabaseClient", () => {
  const reponse = (table: string) => {
    etat.appels++;
    const data = table === "familles" ? [{ id: "pizza" }] : table === "categories" ? etat.categories : [];
    const r: Record<string, unknown> = { data, error: null };
    const chaine = new Proxy(r, { get: (cible, cle) => (cle === "then" ? (ok: (v: unknown) => void) => ok({ data, error: null }) : cle in cible ? cible[cle as string] : () => chaine) });
    return chaine;
  };
  return { supabase: { auth: { getSession: async () => ({ data: { session: etat.session ? { access_token: "x" } : null } }) }, from: (t: string) => ({ select: () => reponse(t) }) } };
});

import { chargerReferentielFiche, chargerReferentielFicheSur, invaliderReferentielFiche } from "@/lib/referentielFiche";

beforeEach(() => { invaliderReferentielFiche(); etat.session = true; etat.categories = []; etat.appels = 0; });

describe("référentiel de la fiche", () => {
  it("sans session : refusé, rien de gardé", async () => {
    etat.session = false;
    await expect(chargerReferentielFiche("bello_mio")).rejects.toThrow(/Session/);
    etat.session = true; etat.categories = [{ slug: "pizza" }];
    const r = await chargerReferentielFiche("bello_mio");
    expect(r.categories).toHaveLength(1);
  });
  it("catégories vides : renvoyé mais pas gardé, rechargé à l'ouverture suivante", async () => {
    const r1 = await chargerReferentielFiche("bello_mio");
    expect(r1.categories).toHaveLength(0);
    etat.categories = [{ slug: "pizza" }, { slug: "preparation" }];
    const r2 = await chargerReferentielFiche("bello_mio");
    expect(r2.categories).toHaveLength(2);
  });
  it("complet : gardé et resservi sans requête", async () => {
    etat.categories = [{ slug: "pizza" }];
    await chargerReferentielFiche("bello_mio");
    const avant = etat.appels;
    await chargerReferentielFiche("bello_mio");
    expect(etat.appels).toBe(avant);
  });
  it("la fiche attend la session puis obtient un référentiel complet", async () => {
    etat.session = false; etat.categories = [{ slug: "pizza" }];
    setTimeout(() => { etat.session = true; }, 300);
    const r = await chargerReferentielFicheSur("bello_mio");
    expect(r.categories).toHaveLength(1);
  });
});

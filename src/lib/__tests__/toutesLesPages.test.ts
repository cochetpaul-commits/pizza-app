import { describe, expect, it } from "vitest";
import { toutesLesPages } from "@/lib/supabaseChunks";

/** Serveur simulé : rend au plus 1 000 lignes par appel, comme PostgREST */
const serveur = (total: number, panneA?: number) => async (de: number, a: number) => {
  if (panneA !== undefined && de >= panneA) return { data: null, error: { message: "timeout" } };
  const fin = Math.min(a, de + 999, total - 1);
  return { data: Array.from({ length: Math.max(0, fin - de + 1) }, (_, i) => de + i), error: null };
};

describe("toutesLesPages", () => {
  it("lit toutes les lignes au delà de 1 000", async () => {
    const r = await toutesLesPages(serveur(2166));
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(2166);
    expect(r.data[2165]).toBe(2165);
  });
  it("s'arrête juste sur un multiple de la page", async () => {
    expect((await toutesLesPages(serveur(2000))).data).toHaveLength(2000);
    expect((await toutesLesPages(serveur(0))).data).toHaveLength(0);
  });
  it("remonte l'erreur d'une page au lieu de rendre une liste partielle comme complète", async () => {
    const r = await toutesLesPages(serveur(5000, 2000));
    expect(r.error?.message).toBe("timeout");
  });
});

-- 04/11/2026 : l'import de facture depuis l'application (compte connecté) range les baisses de prix de plus de 20 %
-- dans supplier_offers_a_valider. Seule la lecture était permise : l'import échouait (« new row violates row-level
-- security policy »). Même règle que supplier_offers : tout compte connecté peut écrire ; la validation reste côté serveur.
create policy "a_valider insertion authentifiée" on public.supplier_offers_a_valider for insert to authenticated with check (true);

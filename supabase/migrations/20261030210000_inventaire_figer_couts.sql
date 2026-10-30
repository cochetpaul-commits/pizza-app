-- Clôture d'inventaire (30/10/2026) : coûts figés en un appel, au lieu d'une écriture par ligne.
create or replace function inventaire_figer_couts(p_lignes jsonb)
returns integer language sql volatile security definer set search_path = public as $$
  with maj as (
    update inventaire_lignes l set cout_unitaire = (x->>'cout')::numeric
    from jsonb_array_elements(p_lignes) x
    where l.id = (x->>'id')::uuid
    returning l.id
  ) select count(*)::integer from maj;
$$;
revoke all on function inventaire_figer_couts(jsonb) from public, anon, authenticated;
grant execute on function inventaire_figer_couts(jsonb) to service_role;

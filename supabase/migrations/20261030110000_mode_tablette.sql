-- Mode tablette (30/10/2026) : la tablette partagée reste connectée, chacun s'identifie par un code à 4 chiffres (comme Popina).
alter table employes add column if not exists code_pin_hash text;
comment on column employes.code_pin_hash is 'Mode tablette : code à 4 chiffres (haché, scrypt) pour s''identifier sur la tablette partagée';
alter table courses_personnel add column if not exists employe_id uuid references employes(id) on delete set null;

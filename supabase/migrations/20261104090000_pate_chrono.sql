-- Pétrissage chronométré (04/11/2026, retour terrain) : un chrono continu depuis le début de la vitesse 1,
-- avance manuelle, fin du pétrissage, confirmation d'une biga hors fenêtre, reste d'eau de bassinage relevé.
alter table public.pate_lots
  add column if not exists chrono_debut_at timestamptz,
  add column if not exists chrono_avance integer not null default 0,
  add column if not exists petrissage_fin_at timestamptz,
  add column if not exists biga_confirmee boolean not null default false,
  add column if not exists eau_bassinage_restante_g numeric;

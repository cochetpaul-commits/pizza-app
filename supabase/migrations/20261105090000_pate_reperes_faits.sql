-- 05/11/2026 : frise verticale du pétrissage, chaque repère coché à la main (le chrono surligne, il ne valide rien)
alter table public.pate_lots add column if not exists reperes_faits integer[] not null default '{}';

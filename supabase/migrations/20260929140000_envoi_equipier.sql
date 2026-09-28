-- commande_simplifiee = le fournisseur utilise le nouvel écran ; envoi_equipier = un équipier peut envoyer lui-même.
-- Sinon l'équipier prépare la commande et un admin (ou un manager) l'envoie.
alter table public.suppliers add column if not exists envoi_equipier boolean not null default false;
-- Maël et Terre Azur : envoi par un équipier (règle en vigueur jusqu'ici pour les fournisseurs en commande simplifiée)
update public.suppliers set envoi_equipier = true where commande_simplifiee;

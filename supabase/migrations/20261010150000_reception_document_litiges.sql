-- Contrôle de réception, étapes 2 et 3 (10/10/2026) :
-- 1. le bon de livraison ou la facture joint à la réception (photo ou PDF), lu et rapproché
--    des lignes de la commande ;
-- 2. le suivi des réclamations fournisseur (date d'envoi du mail, note).
alter table public.commande_sessions
  add column if not exists document_path text,
  add column if not exists document_nom text,
  add column if not exists document_type text,
  add column if not exists document_lu jsonb,
  add column if not exists document_at timestamptz;

alter table public.commande_lignes
  add column if not exists litige_reclame_at timestamptz,
  add column if not exists litige_note text;

-- Espace privé des documents de réception (lecture par lien signé côté serveur)
insert into storage.buckets (id, name, public)
values ('reception-documents', 'reception-documents', false)
on conflict (id) do nothing;

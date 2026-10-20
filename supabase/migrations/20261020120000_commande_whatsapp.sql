-- Commandes par WhatsApp (20/10/2026) : Maël préfère recevoir le bon en PDF dans son groupe WhatsApp.
-- canal_commande : 'email' (Resend, par défaut) ou 'whatsapp' (le PDF est partagé depuis le téléphone).
alter table public.suppliers add column if not exists canal_commande text not null default 'email';
alter table public.suppliers drop constraint if exists suppliers_canal_commande_check;
alter table public.suppliers add constraint suppliers_canal_commande_check check (canal_commande in ('email', 'whatsapp'));
alter table public.suppliers add column if not exists whatsapp_numero text;
alter table public.suppliers add column if not exists whatsapp_groupe text;
-- Journal des envois : le canal utilisé
alter table public.commande_envois add column if not exists canal text not null default 'email';

update public.suppliers set canal_commande = 'whatsapp', whatsapp_numero = '+33684253895', whatsapp_groupe = '177 commande de NUIT (après 20h)'
where id = 'a0fb4bfd-c21b-42f8-b8d5-e13c2b9e3cb0';

-- Track when/where a commande was sent via the native mail client
ALTER TABLE public.commande_sessions
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sent_to text;

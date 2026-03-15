-- Table de suivi des imports automatiques depuis les boites mail
CREATE TABLE IF NOT EXISTS public.email_imports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  email_from TEXT,
  email_subject TEXT,
  email_date TIMESTAMPTZ,
  email_uid TEXT,                -- UID IMAP pour dédoublonnage
  mailbox TEXT,                  -- facture@bellomio.fr ou facture@piccolamia.fr
  filename TEXT,
  fournisseur TEXT,
  etablissement_id UUID REFERENCES public.etablissements(id),
  invoice_number TEXT,
  nb_lignes INT DEFAULT 0,
  status TEXT DEFAULT 'ok',      -- ok, error, duplicate, no_match, skipped
  error_detail TEXT,
  invoice_id UUID REFERENCES public.supplier_invoices(id)
);

-- Index pour vérifier les doublons rapidement
CREATE INDEX IF NOT EXISTS idx_email_imports_uid ON public.email_imports(mailbox, email_uid);
CREATE INDEX IF NOT EXISTS idx_email_imports_invoice ON public.email_imports(fournisseur, invoice_number);

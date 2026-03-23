-- Gmail webhook support: add gmail_message_id for dedup + missing columns on supplier_invoices

-- Extend email_imports for Gmail webhook
ALTER TABLE email_imports
  ADD COLUMN IF NOT EXISTS gmail_message_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_email_imports_gmail_id
  ON email_imports(gmail_message_id);

-- supplier_invoices needs source + source_filename for email auto-import
ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_filename TEXT;

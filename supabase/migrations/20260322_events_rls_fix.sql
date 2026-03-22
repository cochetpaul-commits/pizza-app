-- Fix events RLS: allow all authenticated users (not just owner)
-- This matches the pattern used for devis/factures tables
DROP POLICY IF EXISTS "events_user" ON events;
CREATE POLICY "events_auth" ON events FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "event_recipes_user" ON event_recipes;
CREATE POLICY "event_recipes_auth" ON event_recipes FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "event_documents_user" ON event_documents;
CREATE POLICY "event_documents_auth" ON event_documents FOR ALL USING (auth.role() = 'authenticated');

-- Add client_id column if missing
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

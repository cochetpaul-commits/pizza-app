-- ============================================================
-- ÉVÉNEMENTS : tables + storage + RLS
-- ============================================================

-- 1. Table principale
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'autre',
  date date,
  time time,
  location text,
  address text,
  covers integer DEFAULT 0,
  establishment text DEFAULT 'both',
  status text DEFAULT 'prospect',
  -- contact client
  contact_name text,
  contact_phone text,
  contact_email text,
  contact_notes text,
  -- pricing
  sell_price numeric,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_user" ON events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Recettes liées
CREATE TABLE IF NOT EXISTS event_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  recipe_type text NOT NULL,
  recipe_id uuid NOT NULL,
  recipe_name text,
  portions integer DEFAULT 1,
  cost_per_portion numeric,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE event_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_recipes_user" ON event_recipes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Documents
CREATE TABLE IF NOT EXISTS event_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'autre',
  file_url text NOT NULL,
  file_size integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE event_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_documents_user" ON event_documents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-documents', 'event-documents', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "event_docs_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'event-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY "event_docs_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'event-documents');
CREATE POLICY "event_docs_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'event-documents' AND auth.uid() IS NOT NULL);

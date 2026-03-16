-- Messagerie interne — canaux + messages

CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  etablissement_id UUID REFERENCES etablissements(id) ON DELETE CASCADE,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel
  ON chat_messages (channel_id, created_at DESC);

-- RLS
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Tout utilisateur authentifié peut lire les canaux
CREATE POLICY "Authenticated users can read channels"
  ON chat_channels FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admin/direction peuvent créer des canaux
CREATE POLICY "Admins can create channels"
  ON chat_channels FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'direction')
    )
  );

-- Tout utilisateur authentifié peut lire les messages
CREATE POLICY "Authenticated users can read messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Tout utilisateur authentifié peut poster des messages
CREATE POLICY "Authenticated users can send messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Un utilisateur peut supprimer ses propres messages
CREATE POLICY "Users can delete own messages"
  ON chat_messages FOR DELETE
  USING (auth.uid() = sender_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- Journal des synchronisations Popina API → ventes_lignes
CREATE TABLE IF NOT EXISTS popina_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES etablissements(id),
  date_service date NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','empty','error')),
  nb_lignes integer NOT NULL DEFAULT 0,
  nb_orders integer NOT NULL DEFAULT 0,
  duration_ms integer,
  error_msg text,
  triggered_by text NOT NULL DEFAULT 'cron', -- cron | manual | backfill
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_popina_sync_log_etab_date
  ON popina_sync_log (etablissement_id, date_service DESC);

CREATE INDEX IF NOT EXISTS idx_popina_sync_log_created_at
  ON popina_sync_log (created_at DESC);

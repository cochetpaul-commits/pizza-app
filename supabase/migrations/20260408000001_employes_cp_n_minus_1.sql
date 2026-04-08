-- CP counters: store N-1 (previous reference period) values manually
-- editable by admin. The current period (N) is still computed from
-- absences + contract start date.

ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS cp_n_minus_1 jsonb NOT NULL DEFAULT '{"acquis": 0, "pris": 0}'::jsonb;

-- Custom permissions per employee (overrides for toggle permissions)
ALTER TABLE employes
  ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT '{}';

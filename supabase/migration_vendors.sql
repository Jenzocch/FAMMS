-- Adds a reusable vendor/contractor roster so assignment doesn't rely on
-- retyping the same external names (typos split KPI stats across "ABC 外包"
-- vs "ABC维修"). Safe to re-run on an existing database.

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID REFERENCES factories(id),  -- NULL = available to every factory
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vendors_factory ON vendors(factory_id);

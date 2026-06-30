-- ============================================================================
-- MIGRATION: multi-assignee + "technician sees only own cases".
-- assigned_to stays as the free-text display summary (incl. external vendors);
-- assigned_user_ids holds the linked account ids used for visibility filtering.
-- Safe to re-run.
-- ============================================================================

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_user_ids UUID[] DEFAULT '{}';

-- GIN index so "assigned_user_ids @> [me]" filtering stays fast
CREATE INDEX IF NOT EXISTS idx_incidents_assigned_user_ids
  ON incidents USING GIN (assigned_user_ids);

NOTIFY pgrst, 'reload schema';

-- Adds a "private/public" visibility flag
-- SQLite-compatible (BOOLEAN is stored as integer affinity)

ALTER TABLE dashboards ADD COLUMN is_private BOOLEAN DEFAULT 1;

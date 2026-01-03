-- Adds a "main dashboard" flag
-- SQLite-compatible (BOOLEAN is stored as integer affinity)

ALTER TABLE dashboards ADD COLUMN is_main BOOLEAN DEFAULT 0;

-- Migration: Add is_insight flag to dashboards
-- Date: 2025-12-31
-- Description: Distinguish Insights (created via Insights workflows) from Dashboards

ALTER TABLE dashboards ADD COLUMN is_insight BOOLEAN DEFAULT 0;

-- SQLite doesn't support COMMENT ON COLUMN, so this is just documentation:
-- is_insight: True for insights created via Insights workflows; false for dashboards created via dashboard builder/publish

CREATE INDEX IF NOT EXISTS idx_dashboards_is_insight ON dashboards(is_insight);

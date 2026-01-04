-- Add optional linkage fields so dashboard tiles can reference an upstream Insight chart.
-- Postgres migration.

ALTER TABLE dashboard_charts
  ADD COLUMN IF NOT EXISTS source_dashboard_id TEXT;

ALTER TABLE dashboard_charts
  ADD COLUMN IF NOT EXISTS source_chart_id TEXT;

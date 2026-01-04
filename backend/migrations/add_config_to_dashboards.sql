-- Add dashboard-level JSON config column for global filters and other settings
-- Compatible with Postgres; SQLite uses lightweight startup migration in app/main.py

ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS config JSON;

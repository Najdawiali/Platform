-- Migration: Add execution mode support to dashboards
-- Date: 2025-12-26
-- Description: Adds snapshot, live query, and scheduled refresh capabilities

-- Add execution mode columns to dashboards table
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(20) DEFAULT 'snapshot';
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS refresh_schedule VARCHAR(100);
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS auto_refresh_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS cache_ttl_seconds INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN dashboards.execution_mode IS 'Execution mode: snapshot (default), live, or scheduled';
COMMENT ON COLUMN dashboards.refresh_schedule IS 'Cron expression for scheduled refresh (e.g., "0 */6 * * *" for every 6 hours)';
COMMENT ON COLUMN dashboards.auto_refresh_enabled IS 'Whether automatic refresh is enabled';
COMMENT ON COLUMN dashboards.last_refreshed_at IS 'Timestamp of last data refresh';
COMMENT ON COLUMN dashboards.cache_ttl_seconds IS 'Cache duration in seconds (for live mode)';

-- Create index on execution_mode for faster filtering
CREATE INDEX IF NOT EXISTS idx_dashboards_execution_mode ON dashboards(execution_mode);

-- Create index on auto_refresh_enabled for background job queries
CREATE INDEX IF NOT EXISTS idx_dashboards_auto_refresh ON dashboards(auto_refresh_enabled) WHERE auto_refresh_enabled = TRUE;

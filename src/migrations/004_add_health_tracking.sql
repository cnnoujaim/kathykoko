-- 004_add_health_tracking.sql
-- Health check-ins, metrics, and Lyra work hours tracking

-- Health Check-ins (8 PM Bloom tracking)
CREATE TABLE IF NOT EXISTS health_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_date DATE NOT NULL,
  checkin_type VARCHAR(50) NOT NULL CHECK (checkin_type IN ('edibles', 'workout', 'wealth', 'milestone', 'vibe')),
  prompt_sent_at TIMESTAMP,
  response_text TEXT,
  response_received_at TIMESTAMP,
  parsed_data JSONB,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_checkins_date ON health_checkins(checkin_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_checkins_type ON health_checkins(checkin_type);
CREATE INDEX IF NOT EXISTS idx_health_checkins_created ON health_checkins(created_at DESC);

-- Metrics Snapshots (Spotify, Meta Ads)
CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('spotify_listeners', 'spotify_streams', 'meta_ad_spend', 'meta_impressions', 'meta_clicks')),
  value NUMERIC,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_snapshots_date ON metrics_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_snapshots_type ON metrics_snapshots(metric_type);
CREATE INDEX IF NOT EXISTS idx_metrics_snapshots_type_date ON metrics_snapshots(metric_type, snapshot_date DESC);

-- Lyra Work Hours Tracking (for 40-hour killswitch)
CREATE TABLE IF NOT EXISTS lyra_work_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date DATE NOT NULL,
  total_hours NUMERIC DEFAULT 0,
  events JSONB,
  alert_sent_at TIMESTAMP,
  killswitch_triggered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_lyra_work_hours_week ON lyra_work_hours(week_start_date DESC);

-- Update timestamp trigger
CREATE TRIGGER update_lyra_work_hours_updated_at BEFORE UPDATE ON lyra_work_hours
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

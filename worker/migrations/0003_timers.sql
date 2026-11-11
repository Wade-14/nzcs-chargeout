-- Time tracking on the Environmental Enhancement Charge Out (11-11-2026):
-- a crew taps Start in the morning; any crew phone can find it and tap Stop at the end of the day.
CREATE TABLE IF NOT EXISTS timers (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'enviro',
  job_id      TEXT,                 -- set when tracking a new day on a job in progress
  job_name    TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  stopped_at  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS timers_kind ON timers(kind, started_at);

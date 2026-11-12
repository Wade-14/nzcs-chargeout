-- NZCS charge out storage. One row per charge out (job), one row per day of work on it.
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  job_name      TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'pest',   -- 'pest' (Pest Control) or 'enviro' (Environmental Enhancement)
  status        TEXT NOT NULL DEFAULT 'open',   -- 'open' (in progress) or 'complete'
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  completed_at  TEXT
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, updated_at);

CREATE TABLE IF NOT EXISTS days (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  day_date    TEXT NOT NULL,                   -- YYYY-MM-DD
  data        TEXT NOT NULL,                   -- JSON: people, hours, km, materials, tasks, comments
  signature   TEXT NOT NULL DEFAULT '',        -- PNG data URL
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS days_job ON days(job_id, day_date);

-- Incident reports: the employee's part is stored until a manager completes the investigation.
CREATE TABLE IF NOT EXISTS incidents (
  id             TEXT PRIMARY KEY,
  status         TEXT NOT NULL DEFAULT 'open',   -- 'open' (awaiting investigation) or 'complete'
  reported_by    TEXT NOT NULL DEFAULT '',
  summary        TEXT NOT NULL DEFAULT '',
  report         TEXT NOT NULL,                  -- JSON: the employee's answers + signature
  investigation  TEXT NOT NULL DEFAULT '{}',     -- JSON: the manager's answers + signature
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  completed_at   TEXT
);
CREATE INDEX IF NOT EXISTS incidents_status ON incidents(status, created_at);

-- Phones that asked for incident alerts (Web Push subscriptions).
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint    TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL
);
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
-- What each push "ping" was about (12-11-2026). Pushes carry no message, so the app's service worker
-- asks for recent notices to show the right notification: an incident, or the monthly jobs-in-progress reminder.
CREATE TABLE IF NOT EXISTS notices (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,            -- 'incident' | 'jobs'
  count       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notices_time ON notices(created_at);

-- NZCS charge out storage. One row per charge out (job), one row per day of work on it.
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  job_name      TEXT NOT NULL,
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

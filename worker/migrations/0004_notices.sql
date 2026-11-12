-- What each push "ping" was about (12-11-2026). Pushes carry no message, so the app's service worker
-- asks for recent notices to show the right notification: an incident, or the monthly jobs-in-progress reminder.
CREATE TABLE IF NOT EXISTS notices (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,            -- 'incident' | 'jobs'
  count       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notices_time ON notices(created_at);

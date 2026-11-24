-- Job sheets saved for later by managers (24-11-2026). Text only (no photos or map images), so tiny.
CREATE TABLE IF NOT EXISTS jobsheets (
  id          TEXT PRIMARY KEY,
  client      TEXT NOT NULL DEFAULT '',
  data        TEXT NOT NULL,          -- JSON: the form's answers
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobsheets_updated ON jobsheets(updated_at);

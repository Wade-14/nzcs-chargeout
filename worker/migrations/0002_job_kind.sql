-- Split the Charge Out into Pest Control and Environmental Enhancement (11-11-2026).
-- Existing jobs become Pest Control unless moved below.
ALTER TABLE jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'pest';

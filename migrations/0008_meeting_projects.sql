ALTER TABLE meetings ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id, date DESC);

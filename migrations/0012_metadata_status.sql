ALTER TABLE project_metadata ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));
ALTER TABLE project_metadata ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1));
UPDATE project_metadata SET status = 'active', archived = 0 WHERE status IS NULL OR archived IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_metadata_status ON project_metadata(project_id, type, status);

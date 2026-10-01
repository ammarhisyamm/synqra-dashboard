CREATE TABLE IF NOT EXISTS project_invitations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('viewer','editor')),
  status TEXT NOT NULL DEFAULT 'invited',
  token_hash TEXT,
  invited_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, email),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_invitations_email ON project_invitations(email);
-- Legacy invitations belonged to the original workspace, not future projects.
INSERT OR IGNORE INTO project_invitations(id, project_id, email, role, status, invited_by, created_at)
SELECT m.id, 'default', m.email, COALESCE(r.role, m.role, 'viewer'), m.status, m.invited_by, m.created_at
FROM project_members m LEFT JOIN project_member_roles r ON r.member_id = m.id
WHERE EXISTS (SELECT 1 FROM projects WHERE id = 'default');

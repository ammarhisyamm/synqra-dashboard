CREATE TABLE meeting_captures (
  meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('google_meet','zoom')),
  native_meeting_id TEXT NOT NULL,
  meeting_url TEXT NOT NULL,
  provider_meeting_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'requested',
  consent_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  consent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recording_enabled INTEGER NOT NULL DEFAULT 1,
  transcript TEXT NOT NULL DEFAULT '',
  segments TEXT NOT NULL DEFAULT '[]',
  recordings TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '{}',
  summary_source TEXT NOT NULL DEFAULT '',
  summary_fingerprint TEXT NOT NULL DEFAULT '',
  summary_edited INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL DEFAULT '',
  poll_after TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sync_lease TEXT,
  sync_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX meeting_capture_live_url ON meeting_captures(platform,native_meeting_id)
  WHERE status NOT IN ('completed','failed');
-- The free Lite engine shares one display/audio stack. Do not mix calls.
CREATE UNIQUE INDEX meeting_capture_single_engine ON meeting_captures((1))
  WHERE status NOT IN ('completed','failed');
CREATE INDEX meeting_capture_poll ON meeting_captures(poll_after,status);
CREATE TABLE meeting_summaries (
  meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE meeting_shares (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  snapshot TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX meeting_share_active ON meeting_shares(meeting_id,revoked_at,expires_at);
CREATE TRIGGER meeting_capture_delete_guard BEFORE DELETE ON meetings
WHEN EXISTS(SELECT 1 FROM meeting_captures WHERE meeting_id=OLD.id AND status NOT IN ('completed','failed'))
BEGIN SELECT RAISE(ABORT,'Stop the meeting bot before deleting this meeting'); END;

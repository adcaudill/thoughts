-- Soft delete for notes and note version history
ALTER TABLE notes ADD COLUMN deleted_at TEXT; -- NULL means active

CREATE TABLE IF NOT EXISTS note_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  content_encrypted TEXT NOT NULL,
  nonce TEXT NOT NULL,
  title_encrypted TEXT,
  word_count INTEGER DEFAULT 0,
  reason TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(note_id) REFERENCES notes(id)
);

CREATE INDEX IF NOT EXISTS idx_note_versions_note_created ON note_versions (note_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_versions_user_created ON note_versions (user_id, created_at DESC);

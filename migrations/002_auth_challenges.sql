CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at INTEGER
);

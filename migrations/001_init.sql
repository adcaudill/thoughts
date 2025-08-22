CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  server_password_hash TEXT NOT NULL,
  server_salt TEXT NOT NULL,
  client_salt TEXT NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  parent_id TEXT,
  name_encrypted TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  "order" INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  title_encrypted TEXT,
  content_encrypted TEXT,
  nonce TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(folder_id) REFERENCES folders(id)
);

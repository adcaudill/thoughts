// Minimal in-memory SQLite mock implementing a subset of D1 API used by the worker routes
import Database from 'better-sqlite3'

export function createMockD1() {
    const db = new Database(':memory:')
    // apply migrations
    const schema = `
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
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );
  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    title_encrypted TEXT,
    content_encrypted TEXT,
    nonce TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );
  CREATE TABLE auth_challenges (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    nonce TEXT NOT NULL,
    created_at INTEGER
  );
  ALTER TABLE users ADD COLUMN client_pubkey TEXT;
  ALTER TABLE users ADD COLUMN recovery_hash TEXT;
  ALTER TABLE users ADD COLUMN recovery_encrypted_key TEXT;
  `
    db.exec(schema)

    function prepare(sql: string) {
        const stmt = db.prepare(sql)
        return {
            bind: function (...args: any[]) {
                return { run: () => stmt.run(...args), first: () => stmt.get(...args), all: () => stmt.all(...args) }
            },
            run: (...args: any[]) => stmt.run(...args),
            get: (...args: any[]) => stmt.get(...args),
            all: (...args: any[]) => stmt.all(...args)
        }
    }

    return { prepare }
}

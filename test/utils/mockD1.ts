// Pure TypeScript in-memory mock of a minimal D1-like API used by tests.
// This avoids native dependencies like better-sqlite3 and supports only the
// small subset of SQL strings our code actually issues.

type Row = Record<string, any>

export function createMockD1() {
  const tables = {
    users: [] as Row[],
    folders: [] as Row[],
    notes: [] as Row[],
    auth_challenges: [] as Row[],
  }

  function select(table: keyof typeof tables, predicate: (r: Row) => boolean): Row[] {
    return tables[table].filter(predicate)
  }

  function update(table: keyof typeof tables, predicate: (r: Row) => boolean, updater: (r: Row) => void) {
    for (const r of tables[table]) if (predicate(r)) updater(r)
  }

  function remove(table: keyof typeof tables, predicate: (r: Row) => boolean) {
    const next: Row[] = []
    for (const r of tables[table]) if (!predicate(r)) next.push(r)
    tables[table] = next
  }

  function prepare(sql: string) {
    function execBound(args: any[]) {
      // USERS
      if (sql.startsWith('INSERT INTO users')) {
        const [id, username, email, server_password_hash, server_salt, client_salt, recovery_hash, recovery_encrypted_key] = args
        tables.users.push({ id, username, email, server_password_hash, server_salt, client_salt, recovery_hash, recovery_encrypted_key, settings: null })
        return { success: true }
      }
      if (sql === 'SELECT id, client_salt FROM users WHERE username = ?') {
        const [username] = args
        const row = select('users', u => u.username === username)[0]
        return row ? { id: row.id, client_salt: row.client_salt } : undefined
      }
      if (sql === 'SELECT * FROM users WHERE username = ?') {
        const [username] = args
        return select('users', u => u.username === username)[0]
      }
      if (sql === 'SELECT settings FROM users WHERE id = ?') {
        const [id] = args
        const row = select('users', u => u.id === id)[0]
        return row ? { settings: row.settings ?? null } : undefined
      }
      if (sql === 'UPDATE users SET settings = ? WHERE id = ?') {
        const [settings, id] = args
        update('users', u => u.id === id, u => { u.settings = settings })
        return { success: true }
      }

      // FOLDERS
      if (sql.startsWith('INSERT INTO folders (id, user_id, parent_id, name_encrypted, is_default) VALUES')) {
        const [id, user_id, parent_id, name_encrypted, is_default] = args
        tables.folders.push({ id, user_id, parent_id: parent_id ?? null, name_encrypted, is_default: !!is_default ? 1 : 0, order: 0, created_at: new Date().toISOString() })
        return { success: true }
      }
      if (sql.startsWith('INSERT INTO folders (id, user_id, parent_id, name_encrypted, is_default, "order") VALUES')) {
        const [id, user_id, parent_id, name_encrypted, is_default, order] = args
        tables.folders.push({ id, user_id, parent_id: parent_id ?? null, name_encrypted, is_default: !!is_default ? 1 : 0, order: order ?? 0, created_at: new Date().toISOString() })
        return { success: true }
      }
      if (sql === 'SELECT id FROM folders WHERE user_id = ? AND is_default = 1') {
        const [user_id] = args
        const row = select('folders', f => f.user_id === user_id && f.is_default === 1)[0]
        return row ? { id: row.id } : undefined
      }
      if (sql === 'SELECT * FROM folders WHERE id = ? AND user_id = ?') {
        const [id, user_id] = args
        return select('folders', f => f.id === id && f.user_id === user_id)[0]
      }
      if (sql === 'SELECT id, parent_id, name_encrypted, is_default, "order", created_at FROM folders WHERE user_id = ? ORDER BY "order" ASC') {
        const [user_id] = args
        const rows = select('folders', f => f.user_id === user_id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        return { results: rows.map(r => ({ id: r.id, parent_id: r.parent_id ?? null, name_encrypted: r.name_encrypted, is_default: r.is_default, order: r.order ?? 0, created_at: r.created_at })) }
      }
      if (sql === 'SELECT id, parent_id, name_encrypted, is_default, "order", created_at, goal_word_count FROM folders WHERE user_id = ? ORDER BY "order" ASC') {
        const [user_id] = args
        const rows = select('folders', f => f.user_id === user_id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        return { results: rows.map(r => ({ id: r.id, parent_id: r.parent_id ?? null, name_encrypted: r.name_encrypted, is_default: r.is_default, order: r.order ?? 0, created_at: r.created_at, goal_word_count: r.goal_word_count ?? null })) }
      }
      if (sql.startsWith('UPDATE folders SET ')) {
        // supports dynamic set list built by server; last arg is id
        const setClause = sql.slice('UPDATE folders SET '.length, sql.indexOf(' WHERE id = ?'))
        const fields = setClause.split(',').map(s => s.trim().replace(/\s*=\s*\?$/, '').replace(/^"|"$/g, ''))
        const id = args[args.length - 1]
        const values = args.slice(0, -1)
        update('folders', f => f.id === id, f => {
          fields.forEach((field, i) => {
            const key = field === 'order' ? 'order' : field
              ; (f as any)[key] = values[i]
          })
        })
        return { success: true }
      }
      if (sql === 'DELETE FROM folders WHERE id = ?') {
        const [id] = args
        remove('folders', f => f.id === id)
        return { success: true }
      }

      // NOTES
      if (sql.startsWith('INSERT INTO notes (id, user_id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at)')) {
        const [id, user_id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at] = args
        tables.notes.push({ id, user_id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count: 0 })
        return { success: true }
      }
      if (sql.startsWith('INSERT INTO notes (id, user_id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count)')) {
        const [id, user_id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count] = args
        tables.notes.push({ id, user_id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count: word_count ?? 0 })
        return { success: true }
      }
      if (sql === 'SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at FROM notes WHERE user_id = ? AND folder_id = ?') {
        const [user_id, folder_id] = args
        const rows = select('notes', n => n.user_id === user_id && n.folder_id === folder_id)
        return { results: rows.map(n => ({ id: n.id, folder_id: n.folder_id, title_encrypted: n.title_encrypted, content_encrypted: n.content_encrypted, nonce: n.nonce, created_at: n.created_at, updated_at: n.updated_at })) }
      }
      if (sql === 'SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count FROM notes WHERE user_id = ? AND folder_id = ?') {
        const [user_id, folder_id] = args
        const rows = select('notes', n => n.user_id === user_id && n.folder_id === folder_id)
        return { results: rows.map(n => ({ id: n.id, folder_id: n.folder_id, title_encrypted: n.title_encrypted, content_encrypted: n.content_encrypted, nonce: n.nonce, created_at: n.created_at, updated_at: n.updated_at, word_count: n.word_count ?? 0 })) }
      }
      if (sql === 'SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at FROM notes WHERE user_id = ?') {
        const [user_id] = args
        const rows = select('notes', n => n.user_id === user_id)
        return { results: rows.map(n => ({ id: n.id, folder_id: n.folder_id, title_encrypted: n.title_encrypted, content_encrypted: n.content_encrypted, nonce: n.nonce, created_at: n.created_at, updated_at: n.updated_at })) }
      }
      if (sql === 'SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count FROM notes WHERE user_id = ?') {
        const [user_id] = args
        const rows = select('notes', n => n.user_id === user_id)
        return { results: rows.map(n => ({ id: n.id, folder_id: n.folder_id, title_encrypted: n.title_encrypted, content_encrypted: n.content_encrypted, nonce: n.nonce, created_at: n.created_at, updated_at: n.updated_at, word_count: n.word_count ?? 0 })) }
      }
      if (sql === 'SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at FROM notes WHERE id = ? AND user_id = ?') {
        const [id, user_id] = args
        const row = select('notes', n => n.id === id && n.user_id === user_id)[0]
        return row ? { id: row.id, folder_id: row.folder_id, title_encrypted: row.title_encrypted, content_encrypted: row.content_encrypted, nonce: row.nonce, created_at: row.created_at, updated_at: row.updated_at } : undefined
      }
      if (sql === 'SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count FROM notes WHERE id = ? AND user_id = ?') {
        const [id, user_id] = args
        const row = select('notes', n => n.id === id && n.user_id === user_id)[0]
        return row ? { id: row.id, folder_id: row.folder_id, title_encrypted: row.title_encrypted, content_encrypted: row.content_encrypted, nonce: row.nonce, created_at: row.created_at, updated_at: row.updated_at, word_count: row.word_count ?? 0 } : undefined
      }
      if (sql === 'SELECT * FROM notes WHERE id = ?') {
        const [id] = args
        const row = select('notes', n => n.id === id)[0]
        return row
      }
      if (sql.startsWith('UPDATE notes SET ')) {
        const setClause = sql.slice('UPDATE notes SET '.length, sql.indexOf(' WHERE id = ?'))
        const fields = setClause.split(',').map(s => s.trim().replace(/\s*=\s*\?$/, ''))
        const id = args[args.length - 1]
        const values = args.slice(0, -1)
        update('notes', n => n.id === id, n => {
          fields.forEach((field, i) => {
            const key = field.replace(/^"|"$/g, '')
              ; (n as any)[key] = values[i]
          })
        })
        return { success: true }
      }
      if (sql === 'UPDATE notes SET folder_id = ? WHERE folder_id = ?') {
        const [newFolder, oldFolder] = args
        update('notes', n => n.folder_id === oldFolder, n => { n.folder_id = newFolder })
        return { success: true }
      }
      if (sql === 'DELETE FROM notes WHERE id = ?') {
        const [id] = args
        remove('notes', n => n.id === id)
        return { success: true }
      }

      // Aggregations
      if (sql === 'SELECT folder_id as id, SUM(word_count) as total_words FROM notes WHERE user_id = ? GROUP BY folder_id') {
        const [user_id] = args
        const rows = select('notes', n => n.user_id === user_id)
        const map: Record<string, number> = {}
        for (const n of rows) {
          const fid = n.folder_id
          map[fid] = (map[fid] || 0) + (n.word_count ?? 0)
        }
        return { results: Object.keys(map).map(id => ({ id, total_words: map[id] })) }
      }

      // AUTH CHALLENGES
      if (sql.startsWith('INSERT INTO auth_challenges')) {
        const [id, username, nonce, created_at] = args
        tables.auth_challenges.push({ id, username, nonce, created_at })
        return { success: true }
      }
      if (sql === 'SELECT * FROM auth_challenges WHERE id = ?') {
        const [id] = args
        return select('auth_challenges', c => c.id === id)[0]
      }
      if (sql === 'DELETE FROM auth_challenges WHERE id = ?') {
        const [id] = args
        remove('auth_challenges', c => c.id === id)
        return { success: true }
      }

      throw new Error(`Unsupported SQL in mockD1: ${sql}`)
    }

    return {
      bind: (...args: any[]) => ({
        run: () => execBound(args),
        first: () => execBound(args),
        all: () => execBound(args),
      }),
      run: (...args: any[]) => execBound(args),
      get: (...args: any[]) => execBound(args),
      all: (...args: any[]) => execBound(args),
    }
  }

  return { prepare }
}

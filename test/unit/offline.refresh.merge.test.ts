import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as offline from '../../src/lib/offlineApi'
import { getDB } from '../../src/lib/db'

let origFetch: any

beforeEach(async () => {
    const db = await getDB()
    for (const store of ['notes', 'folders', 'settings', 'outbox', 'history']) {
        const all = await (db as any).getAll(store)
        for (const r of all) await (db as any).transaction(store, 'readwrite').store.delete(r.id ?? r.key ?? r)
    }
    origFetch = (globalThis as any).fetch
})

afterEach(() => { (globalThis as any).fetch = origFetch })

describe('background refresh preserves local dirty edits', () => {
    it('does not overwrite dirty local note when remote refresh runs', async () => {
        const db = await getDB()
        // Seed local dirty note with locally_edited_at
        await (db as any).put('notes', { id: 'n-dirty', folder_id: 'f-inbox', content_encrypted: 'L', nonce: 'n', word_count: 1, dirty: true, locally_edited_at: Date.now(), server_updated_at: '2025-01-01T00:00:00.000Z' })

            // Remote returns a clean note with different content and newer updated_at
            ; (globalThis as any).fetch = async (input: any, init?: any) => {
                const url = typeof input === 'string' ? input : (input && input.url) || ''
                if (url.startsWith('/api/notes')) {
                    return { json: async () => ({ ok: true, notes: [{ id: 'n-dirty', folder_id: 'f-inbox', content_encrypted: 'R', nonce: 'n2', word_count: 5, updated_at: '2025-01-01T01:00:00.000Z' }] }) } as any
                }
                return { json: async () => ({ ok: true }) } as any
            }

        // Trigger cache-first read which also fires background refresh
        const res = await offline.getNotes()
        expect(res.ok).toBe(true)
        // Wait a tick for background refresh to complete
        await new Promise((r) => setTimeout(r, 5))

        const after = await (db as any).get('notes', 'n-dirty')
        // Dirty flag and locally_edited_at should be preserved
        expect(after.dirty).toBe(true)
        expect(after.locally_edited_at).toBeTypeOf('number')
        // server_updated_at is merged from remote for awareness
        expect(typeof after.server_updated_at === 'string' || after.server_updated_at === null).toBe(true)
    })
})

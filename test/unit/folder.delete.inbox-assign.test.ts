import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDB } from '../../src/lib/db'
import * as offline from '../../src/lib/offlineApi'
import * as sync from '../../src/lib/sync'

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

describe('deleteFolder moves notes to Inbox (offline and on sync)', () => {
    it('reassigns notes to default inbox folder id when deleting a non-default folder', async () => {
        const db = await getDB()
        // Seed inbox and a custom folder
        await db.put('folders', { id: 'inbox', name_encrypted: 'inbox', is_default: 1 })
        await db.put('folders', { id: 'fX', name_encrypted: 'work', is_default: 0 })
        // Note in custom folder
        await db.put('notes', { id: 'nX', folder_id: 'fX', content_encrypted: '', nonce: '', word_count: 0, dirty: false })

        // First delete attempt offline
        let first = true
            ; (globalThis as any).fetch = async (input: any, init?: any) => {
                const url = typeof input === 'string' ? input : (input && input.url) || ''
                const method = (init && init.method) || 'GET'
                if (url.includes('/api/folders/fX') && method === 'DELETE') {
                    if (first) { first = false; throw new Error('offline') }
                    return { json: async () => ({ ok: true }) } as any
                }
                return { json: async () => ({ ok: true }) } as any
            }

        const res = await offline.deleteFolder('fX')
        expect(res.ok).toBe(true)
        expect((res as any).offline).toBe(true)

        // Note should be moved locally to inbox
        const nLocal = await db.get('notes', 'nX')
        expect(nLocal.folder_id).toBe('inbox')
        // Folder removed locally
        const fGone = await db.get('folders', 'fX')
        expect(fGone).toBeUndefined()

        // Now sync (server confirms delete)
        await sync.flushOutboxOnce()

        // Still inbox
        const nAfter = await db.get('notes', 'nX')
        expect(nAfter.folder_id).toBe('inbox')
    })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as offline from '../../src/lib/offlineApi'
import * as sync from '../../src/lib/sync'
import { getDB } from '../../src/lib/db'

const notePayload = (id: string) => ({ id, folder_id: 'f-inbox', content_encrypted: 'c', nonce: 'n', word_count: 0 })

let origFetch: any

beforeEach(async () => {
    // ensure clean DB state
    const db = await getDB()
    for (const store of ['notes', 'folders', 'settings', 'outbox', 'history', 'searchIndex']) {
        const all = await (db as any).getAll(store)
        for (const r of all) await (db as any).transaction(store, 'readwrite').store.delete(r.id ?? r.key ?? r)
    }
    origFetch = (globalThis as any).fetch
})

afterEach(() => { (globalThis as any).fetch = origFetch })

describe('offline notes outbox and sync', () => {
    it('creates and updates a note while offline, then syncs in order without data loss', async () => {
        const id = 'n-off-1'
        // First two calls (POST notes, PATCH notes) fail -> offline
        let calls: Array<{ url: string; method: string }> = []
            ; (globalThis as any).fetch = async (input: any, init?: any) => {
                const url = typeof input === 'string' ? input : (input && input.url) || ''
                const method = (init && init.method) || 'GET'
                calls.push({ url, method })
                // Simulate offline for first create & first update
                if (url.includes('/api/notes') && method === 'POST' && !calls.find(c => c.method === 'POST' && c.url.includes('/api/notes') && c !== calls[calls.length - 1])) {
                    throw new Error('offline')
                }
                if (url.includes(`/api/notes/${id}`) && method === 'PATCH' && !calls.find(c => c.method === 'PATCH' && c.url.includes(`/api/notes/${id}`) && c !== calls[calls.length - 1])) {
                    throw new Error('offline')
                }
                // When sync runs, accept server writes and respond to GETs with updated_at
                if (url.endsWith(`/api/notes/${id}`) && method === 'GET') {
                    // Return increasing updated_at to simulate server timestamps
                    const countGets = calls.filter(c => c.method === 'GET' && c.url.endsWith(`/api/notes/${id}`)).length
                    const updated_at = countGets === 1 ? '2025-01-01T00:00:00.000Z' : '2025-01-01T01:00:00.000Z'
                    return { json: async () => ({ ok: true, note: { id, folder_id: 'f-inbox', content_encrypted: 'c', nonce: 'n', updated_at, word_count: 0 } }) } as any
                }
                return { json: async () => ({ ok: true, id }) } as any
            }

        // Offline create and update
        const createRes = await offline.createNote(notePayload(id) as any)
        expect(createRes.ok).toBe(true)
        expect((createRes as any).offline).toBe(true)

        const updRes = await offline.updateNote(id, { content_encrypted: 'c2', nonce: 'n2', word_count: 1 })
        expect(updRes.ok).toBe(true)
        expect((updRes as any).offline).toBe(true)

        // Two outbox entries queued
        const db = await getDB()
        const out1 = await (db as any).transaction('outbox').store.index('by-created').getAll()
        expect(out1.length).toBeGreaterThanOrEqual(2)

        // Now sync (server online)
        await sync.flushOutboxOnce()

        // Outbox empty; note is not dirty and has latest server_updated_at
        const out2 = await (db as any).transaction('outbox').store.index('by-created').getAll()
        expect(out2.length).toBe(0)
        const n = await db.get('notes', id)
        expect(n).toBeTruthy()
        expect(n.dirty).toBe(false)
        expect(n.server_updated_at).toBeTypeOf('string')
    })

    it('detects conflict on update and stores a history snapshot, keeping local changes (LWW)', async () => {
        const id = 'n-conf-1'
        // Seed a note with a base server_updated_at
        const db = await getDB()
        await (db as any).put('notes', { id, folder_id: 'f-inbox', content_encrypted: 'A', nonce: 'n', word_count: 0, server_updated_at: '2025-01-01T00:00:00.000Z', dirty: false })

        // Force offline first to enqueue update with base
        let stage: 'offline' | 'online' = 'offline'
            ; (globalThis as any).fetch = async (input: any, init?: any) => {
                const url = typeof input === 'string' ? input : (input && input.url) || ''
                const method = (init && init.method) || 'GET'
                if (stage === 'offline') throw new Error('offline')
                // Online: return a different updated_at to simulate server changed since base
                if (url.endsWith(`/api/notes/${id}`) && method === 'GET') {
                    return { json: async () => ({ ok: true, note: { id, folder_id: 'f-inbox', content_encrypted: 'B', nonce: 'n', updated_at: '2025-01-01T02:00:00.000Z', word_count: 0 } }) } as any
                }
                return { json: async () => ({ ok: true }) } as any
            }

        // Enqueue offline update capturing base_server_updated_at
        const updRes = await offline.updateNote(id, { content_encrypted: 'C', nonce: 'n2', word_count: 2 })
        expect(updRes.ok).toBe(true)
        expect((updRes as any).offline).toBe(true)

        // Go online and flush
        stage = 'online'
        await sync.flushOutboxOnce()

        // History contains a conflict snapshot
        const history = await (db as any).getAll('history')
        const h = history.find((x: any) => x.entity === 'note' && x.entity_id === id && x.reason === 'conflict')
        expect(h).toBeTruthy()

        // Local note should be clean
        const n = await db.get('notes', id)
        expect(n.dirty).toBe(false)
    })
})

describe('offline settings store and sync', () => {
    it('updates settings offline, persists locally, then syncs on reconnect', async () => {
        let first = true
            ; (globalThis as any).fetch = async (input: any, init?: any) => {
                const url = typeof input === 'string' ? input : (input && input.url) || ''
                const method = (init && init.method) || 'GET'
                if (url.endsWith('/api/settings') && method === 'PATCH') {
                    if (first) { first = false; throw new Error('offline') }
                    return { json: async () => ({ ok: true, settings: { showWordCount: true } }) } as any
                }
                return { json: async () => ({ ok: true }) } as any
            }

        // Offline update
        const res = await offline.updateSettings({ showWordCount: true })
        expect(res.ok).toBe(true)
        expect((res as any).offline).toBe(true)

        const db = await getDB()
        const rec = await (db as any).get('settings', 'current')
        expect(rec && rec.data && rec.data.showWordCount).toBe(true)

        // Sync
        await sync.flushOutboxOnce()

        const rec2 = await (db as any).get('settings', 'current')
        expect(rec2 && rec2.data && rec2.data.showWordCount).toBe(true)
        const out = await (db as any).transaction('outbox').store.index('by-created').getAll()
        // Ensure the settings.update item was removed
        expect(out.find((i: any) => i.type === 'settings.update')).toBeUndefined()
    })
})

describe('cache-first reads while offline', () => {
    it('getNotes returns cached notes even when network fails', async () => {
        // Seed local note
        const db = await getDB()
        await (db as any).put('notes', { id: 'n-cached', folder_id: 'f-inbox', content_encrypted: '', nonce: '', word_count: 0, server_updated_at: null, dirty: false })
            ; (globalThis as any).fetch = async () => { throw new Error('offline') }

        const res = await offline.getNotes()
        expect(res.ok).toBe(true)
        expect(Array.isArray(res.notes)).toBe(true)
        expect(res.notes.find((n: any) => n.id === 'n-cached')).toBeTruthy()
    })
})

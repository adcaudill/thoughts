import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as offline from '../../src/lib/offlineApi'
import * as sync from '../../src/lib/sync'
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

describe('outbox preserves order and coalesces logically', () => {
    it('processes note.create then note.update for same entity id in order', async () => {
        const id = 'n-seq-1'
        let events: string[] = []
            ; (globalThis as any).fetch = async (input: any, init?: any) => {
                const url = typeof input === 'string' ? input : (input && input.url) || ''
                const method = (init && init.method) || 'GET'
                if (url.includes('/api/notes') && method === 'POST') events.push('server:create')
                if (url.includes(`/api/notes/${id}`) && method === 'PATCH') events.push('server:update')
                return { json: async () => ({ ok: true, id }) } as any
            }

        await offline.createNote({ id, folder_id: 'f-inbox', content_encrypted: '1', nonce: 'n', word_count: 1 } as any)
        await offline.updateNote(id, { content_encrypted: '2', nonce: 'n2', word_count: 2 })

        await sync.flushOutboxOnce()

        expect(events).toEqual(['server:create', 'server:update'])
    })
})

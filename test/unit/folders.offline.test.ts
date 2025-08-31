import { describe, it, expect } from 'vitest'
import { getDB } from '../../src/lib/db'
import * as offline from '../../src/lib/offlineApi'
import * as sync from '../../src/lib/sync'

// These tests rely on the in-memory DB fallback (no indexedDB under jsdom)

describe('offline folders mutations', () => {
    it('creates a folder offline and remaps to server id on sync', async () => {
        const db = await getDB()

        // Arrange: mock fetch to simulate offline first, then success
        const origFetch = (globalThis as any).fetch
        let firstCreate = true
            ; (globalThis as any).fetch = async (input: any, init?: any) => {
                const url = typeof input === 'string' ? input : (input && input.url) || ''
                const method = (init && init.method) || 'GET'
                if (url.includes('/api/folders') && method === 'POST') {
                    if (firstCreate) { firstCreate = false; throw new Error('offline') }
                    return { json: async () => ({ ok: true, id: 'server-123' }) } as any
                }
                // default noop
                return { json: async () => ({ ok: true }) } as any
            }

        // Act: create offline
        const res = await offline.createFolder({ name_encrypted: 'foo' } as any)
        expect(res.ok).toBe(true)
        expect(res.offline).toBe(true)
        const localFolders = await db.getAll('folders')
        const local = localFolders.find((f: any) => String(f.name_encrypted) === 'foo')
        expect(local).toBeTruthy()
        const clientId = local!.id
        expect(clientId).toMatch(/^local-/)

        // Also add a note that references the temp folder id
        await db.put('notes', { id: 'n1', folder_id: clientId, content_encrypted: '', nonce: '', word_count: 0, dirty: false })

        // Queue a dependent outbox item that references the temp folder id (note.update with folder change)
        await (await getDB()).add('outbox', { type: 'note.update', payload: { id: 'n1', patch: { folder_id: clientId } }, created_at: Date.now() })

        // Act: run sync flush, which should call createFolder again and then remap ids
        await sync.flushOutboxOnce()

        // Assert: folder id replaced, notes and outbox payloads updated
        const foldersAfter = await db.getAll('folders')
        const mapped = foldersAfter.find((f: any) => f.id === 'server-123')
        expect(mapped).toBeTruthy()
        const old = await db.get('folders', clientId)
        expect(old).toBeUndefined()

        const note = await db.get('notes', 'n1')
        expect(note.folder_id).toBe('server-123')

        const outbox = await db.transaction('outbox').store.index('by-created').getAll()
        // no pending folder.create; note.update should remain but with remapped id
        expect(outbox.find((i: any) => i.type === 'folder.create')).toBeUndefined()
        const noteUpd = outbox.find((i: any) => i.type === 'note.update')
        if (noteUpd) expect(noteUpd.payload.patch.folder_id).toBe('server-123')

            ; (globalThis as any).fetch = origFetch
    })

    it('updates and deletes folder offline with optimistic local changes', async () => {
        const db = await getDB()
        // seed a folder
        await db.put('folders', { id: 'f1', name_encrypted: 'bar', is_default: 0, server_updated_at: null })
        const origFetch = (globalThis as any).fetch
        let updFirst = true
        let delFirst = true
            ; (globalThis as any).fetch = async (input: any, init?: any) => {
                const url = typeof input === 'string' ? input : (input && input.url) || ''
                const method = (init && init.method) || 'GET'
                if (url.includes('/api/folders/') && method === 'PATCH') {
                    if (updFirst) { updFirst = false; throw new Error('offline') }
                    return { json: async () => ({ ok: true }) } as any
                }
                if (url.includes('/api/folders/') && method === 'DELETE') {
                    if (delFirst) { delFirst = false; throw new Error('offline') }
                    return { json: async () => ({ ok: true }) } as any
                }
                return { json: async () => ({ ok: true }) } as any
            }

        // Update offline
        await offline.updateFolder('f1', { name_encrypted: 'baz' })
        const f1 = await db.get('folders', 'f1')
        expect(f1.name_encrypted).toBe('baz')

        // Delete offline (should enqueue and remove locally)
        await offline.deleteFolder('f1')
        const gone = await db.get('folders', 'f1')
        expect(gone).toBeUndefined()

        // Now flush (calls server successfully)
        await sync.flushOutboxOnce()

        // No outbox leftovers referencing f1
        const outbox = await db.transaction('outbox').store.index('by-created').getAll()
        expect(outbox.find((i: any) => i.type.startsWith('folder.') && i.payload.id === 'f1')).toBeUndefined()
            ; (globalThis as any).fetch = origFetch
    })
})

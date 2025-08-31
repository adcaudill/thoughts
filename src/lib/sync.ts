import { getDB } from './db'
import * as api from './api'
import { getLocalNote, LocalNoteRecord } from './offlineApi'
import { getNoteKey } from './session'
import { encryptNotePayload } from './crypto'

export async function flushOutboxOnce() {
    const db = await getDB()
    const tx = db.transaction(['outbox', 'notes', 'history', 'settings', 'folders'], 'readwrite')
    const outboxIdx = tx.objectStore('outbox').index('by-created')
    const items = await outboxIdx.getAll()
    for (const item of items) {
        try {
            if (item.type === 'note.create') {
                const payload = item.payload as { id?: string; folder_id?: string; title_encrypted?: string; content_encrypted: string; nonce?: string; word_count?: number }
                const res = await api.createNote(payload)
                if (res && res.ok) {
                    // Update local note's server_updated_at and clear dirty
                    const noteId = (payload.id as string) || res.id
                    let serverUpdatedAt: string | null = null
                    try {
                        const fetched = await api.getNote(noteId)
                        if (fetched && fetched.ok && fetched.note) serverUpdatedAt = fetched.note.updated_at || null
                    } catch { }
                    const n = await tx.objectStore('notes').get(noteId)
                    if (n) {
                        n.server_updated_at = serverUpdatedAt || n.server_updated_at || new Date().toISOString()
                        n.dirty = false
                        await tx.objectStore('notes').put(n)
                    }
                    await tx.objectStore('outbox').delete(item.id as any)
                }
            } else if (item.type === 'note.update') {
                const { id, patch } = item.payload as { id: string; patch: Partial<LocalNoteRecord> }
                // LWW: fetch server's current updated_at to detect conflict
                const noteRes = await api.getNote(id)
                const server = noteRes && noteRes.ok ? noteRes.note : null
                const base = item.base_server_updated_at || null
                const serverUpdated = server?.updated_at || null
                const conflict = base && serverUpdated && serverUpdated !== base
                if (conflict) {
                    // Save local snapshot into history for recovery, then proceed with update (we choose local wins)
                    const local = await getLocalNote(id)
                    if (local) {
                        const snapshot = { id: local.id, folder_id: local.folder_id, content_encrypted: local.content_encrypted, nonce: local.nonce, word_count: local.word_count, server_updated_at: local.server_updated_at }
                        let enc = { snapshot_encrypted: JSON.stringify(snapshot), nonce: '' }
                        try {
                            const key = getNoteKey()
                            if (key) {
                                const result = await encryptNotePayload(key, JSON.stringify(snapshot))
                                enc = { snapshot_encrypted: result.ciphertext, nonce: result.nonce }
                            }
                        } catch { /* keep plaintext fallback */ }
                        await tx.objectStore('history').add({ entity: 'note', entity_id: id, ...enc, created_at: Date.now(), reason: 'conflict' })
                    }
                }
                const res = await api.updateNote(id, patch as any)
                if (res && res.ok) {
                    let serverUpdatedAt: string | null = null
                    try {
                        const fetched = await api.getNote(id)
                        if (fetched && fetched.ok && fetched.note) serverUpdatedAt = fetched.note.updated_at || null
                    } catch { }
                    const n = await tx.objectStore('notes').get(id)
                    if (n) {
                        n.server_updated_at = serverUpdatedAt || new Date().toISOString()
                        n.dirty = false
                        n.locally_edited_at = null
                        await tx.objectStore('notes').put(n)
                    }
                    await tx.objectStore('outbox').delete(item.id as any)
                }
            } else if (item.type === 'settings.update') {
                const payload = item.payload
                try {
                    const res = await api.updateSettings(payload)
                    if (res && res.ok) {
                        await tx.objectStore('settings').put({ data: res.settings || payload, updated_at: Date.now() }, 'current' as any)
                        await tx.objectStore('outbox').delete(item.id as any)
                    }
                } catch {
                    // leave for retry
                }
            } else if (item.type === 'folder.create') {
                // payload contains client_id and creation fields
                const payload = item.payload as { client_id: string; parent_id?: string; name_encrypted: string; is_default?: boolean; order?: number; goal_word_count?: number | null }
                try {
                    const res = await api.createFolder({ parent_id: payload.parent_id, name_encrypted: payload.name_encrypted, is_default: payload.is_default, order: payload.order, goal_word_count: payload.goal_word_count ?? null })
                    if (res && res.ok && res.id) {
                        // Replace local folder id with server id; update notes referencing this folder
                        const serverId = res.id as string
                        const clientId = payload.client_id
                        if (clientId && clientId !== serverId) {
                            // move folder record
                            const f = await tx.objectStore('folders').get(clientId)
                            if (f) {
                                await tx.objectStore('folders').delete(clientId)
                                await tx.objectStore('folders').put({ ...f, id: serverId })
                            }
                            // update notes.folder_id
                            const nIdx = tx.objectStore('notes').index('by-folder')
                            const affected = await nIdx.getAll(clientId)
                            for (const n of affected) {
                                n.folder_id = serverId
                                await tx.objectStore('notes').put(n)
                            }
                            // update any outbox entries that reference the client folder id
                            const allOut = await tx.objectStore('outbox').index('by-created').getAll()
                            for (const ob of allOut) {
                                if (ob.type === 'note.create' || ob.type === 'note.update') {
                                    const p = ob.payload
                                    if (p && p.folder_id === clientId) {
                                        p.folder_id = serverId
                                        await tx.objectStore('outbox').put(ob)
                                    }
                                    if (ob.type === 'note.update' && p && p.patch && p.patch.folder_id === clientId) {
                                        p.patch.folder_id = serverId
                                        await tx.objectStore('outbox').put(ob)
                                    }
                                }
                                if (ob.type === 'folder.update' && ob.payload && ob.payload.id === clientId) {
                                    ob.payload.id = serverId
                                    await tx.objectStore('outbox').put(ob)
                                }
                                if (ob.type === 'folder.delete' && ob.payload && ob.payload.id === clientId) {
                                    ob.payload.id = serverId
                                    await tx.objectStore('outbox').put(ob)
                                }
                            }
                        }
                        await tx.objectStore('outbox').delete(item.id as any)
                    }
                } catch {
                    // leave for retry
                }
            } else if (item.type === 'folder.update') {
                const { id, patch } = item.payload as { id: string; patch: any }
                try {
                    const res = await api.updateFolder(id, patch)
                    if (res && res.ok) {
                        const f = await tx.objectStore('folders').get(id)
                        if (f) await tx.objectStore('folders').put({ ...f, ...patch })
                        await tx.objectStore('outbox').delete(item.id as any)
                    }
                } catch {
                    // leave for retry
                }
            } else if (item.type === 'folder.delete') {
                const { id } = item.payload as { id: string }
                try {
                    const res = await api.deleteFolder(id)
                    if (res && res.ok) {
                        // mirror server behavior: move notes to Inbox locally, then delete folder
                        const folders = await tx.objectStore('folders').getAll()
                        const inbox = (folders as any[]).find((x: any) => Number(x.is_default) === 1)
                        if (inbox) {
                            const nIdx = tx.objectStore('notes').index('by-folder')
                            const affected = await nIdx.getAll(id)
                            for (const n of affected) {
                                n.folder_id = inbox.id
                                await tx.objectStore('notes').put(n)
                            }
                        }
                        await tx.objectStore('folders').delete(id)
                        await tx.objectStore('outbox').delete(item.id as any)
                    }
                } catch {
                    // leave for retry
                }
            } else if (item.type === 'note.softDelete') {
                const { id } = item.payload as { id: string }
                try {
                    const res = await api.deleteNote(id)
                    if (res && res.ok) {
                        const n = await tx.objectStore('notes').get(id)
                        if (n) {
                            n.deleted_at = new Date().toISOString()
                            await tx.objectStore('notes').put(n)
                        }
                        await tx.objectStore('outbox').delete(item.id as any)
                    }
                } catch { /* leave for retry */ }
            } else if (item.type === 'note.restore') {
                const { id } = item.payload as { id: string }
                try {
                    const res = await api.restoreNote(id)
                    if (res && res.ok) {
                        const n = await tx.objectStore('notes').get(id)
                        if (n) {
                            n.deleted_at = null
                            await tx.objectStore('notes').put(n)
                        }
                        await tx.objectStore('outbox').delete(item.id as any)
                    }
                } catch { /* leave for retry */ }
            }
        } catch (e) {
            // leave item in outbox for retry
        }
    }
    await tx.done
}

export function setupOnlineSync() {
    const handler = () => { flushOutboxOnce().catch(() => { }) }
    window.addEventListener('app-online', handler)
    window.addEventListener('note-saved', handler)
    // Try once on load
    queueMicrotask(() => handler())
    return () => {
        window.removeEventListener('app-online', handler)
        window.removeEventListener('note-saved', handler)
    }
}

// Offline-first API wrapper around existing lib/api.ts
// - Reads: return local cache immediately (if any), then refresh in background
// - Writes: attempt network; if offline/fails, enqueue into outbox; update local cache optimistically

import * as api from './api'
import { getDB } from './db'
import { getNoteKey } from './session'
import { encryptNotePayload } from './crypto'
import { upsertIndexDoc, persistIndex } from './search'
import { v4 as uuidv4 } from 'uuid'

function now() { return Date.now() }

type GetNotesResponse = any

export async function getNotes(folderId?: string, opts?: { trashed?: boolean }): Promise<GetNotesResponse> {
    const db = await getDB()
    // Repair any notes missing a valid folder assignment so they appear in Inbox
    try { await repairNotesFolderAssignments() } catch { /* non-fatal */ }
    // Return cached notes immediately
    const tx = db.transaction('notes')
    const store = tx.objectStore('notes')
    const idx = folderId ? store.index('by-folder') : null
    let cached = folderId ? await idx!.getAll(folderId) : await store.getAll()
    if (!opts || !opts.trashed) {
        cached = (cached as any[]).filter((n: any) => !n.deleted_at)
    } else {
        cached = (cached as any[]).filter((n: any) => !!n.deleted_at)
    }
    const local = { ok: true, notes: cached }

        // Fire and forget background refresh
        ; (async () => {
            try {
                const remote = await api.getNotes({ folderId, trashed: !!(opts && opts.trashed) })
                if (remote && remote.ok && Array.isArray(remote.notes)) {
                    const txw = (await getDB()).transaction(['notes'], 'readwrite')
                    const nstore = txw.objectStore('notes')
                    for (const n of remote.notes) {
                        const ex = await nstore.get(n.id)
                        // Preserve local dirty edits
                        const merged = ex && ex.dirty ? { ...n, ...ex, server_updated_at: n.updated_at || ex.server_updated_at } : { ...n, server_updated_at: n.updated_at }
                        await nstore.put({
                            id: merged.id,
                            folder_id: merged.folder_id,
                            content_encrypted: merged.content_encrypted,
                            nonce: merged.nonce,
                            word_count: Number(merged.word_count || 0),
                            server_updated_at: merged.server_updated_at || null,
                            locally_edited_at: ex?.locally_edited_at || null,
                            dirty: !!ex?.dirty,
                            deleted_at: merged.deleted_at || null,
                        })
                    }
                    await txw.done
                    // After refresh, run repair again in case folders/notes arrived and some notes lacked folder_id
                    try { await repairNotesFolderAssignments() } catch { }
                    try { window.dispatchEvent(new Event('notes-refreshed')) } catch { }
                }
            } catch {
                // ignore network errors; offline
            }
        })()

    return local
}

export async function createNote(payload: any) {
    try {
        const res = await api.createNote(payload)
        if (res && res.ok) {
            // Ensure local record has the correct folder_id even if server defaulted it (e.g., to Inbox)
            // Prefer server-assigned id over any client-provided temporary id
            const id = (res as any).id || (payload && payload.id)
            let folderId = payload.folder_id
            if (!folderId && id) {
                try {
                    const fetched = await api.getNote(id)
                    folderId = fetched && fetched.ok && fetched.note ? fetched.note.folder_id : undefined
                } catch { /* ignore */ }
            }
            await upsertLocalNoteFromPayload({ ...payload, id, folder_id: folderId || payload.folder_id }, { server_updated_at: (res as any)?.updated_at || null, dirty: false })
        }
        return res
    } catch {
        await upsertLocalNoteFromPayload(payload, { dirty: true, locally_edited_at: now() })
        await enqueue('note.create', payload, null)
        return { ok: true, offline: true, id: payload.id }
    }
}

export async function updateNote(id: string, patch: any) {
    try {
        // Capture a local history snapshot before applying the update (safety net)
        try {
            const db = await getDB()
            const current = await db.get('notes', id)
            if (current) {
                const snapshot = { id: current.id, folder_id: current.folder_id, content_encrypted: current.content_encrypted, nonce: current.nonce, word_count: current.word_count, server_updated_at: current.server_updated_at }
                let enc = { snapshot_encrypted: JSON.stringify(snapshot), nonce: '' }
                try {
                    const key = getNoteKey()
                    if (key) {
                        const result = await encryptNotePayload(key, JSON.stringify(snapshot))
                        enc = { snapshot_encrypted: result.ciphertext, nonce: result.nonce }
                    }
                } catch { /* keep plaintext fallback */ }
                await (db as any).add('history', { entity: 'note', entity_id: id, ...enc, created_at: Date.now(), reason: 'autosave' })
            }
        } catch { /* non-fatal */ }
        const res = await api.updateNote(id, patch)
        await upsertLocalNoteFromPayload({ id, ...patch }, { dirty: false, server_updated_at: res?.updated_at || null })
        return res
    } catch {
        // capture base version for conflict detection
        const db = await getDB()
        const current = await db.get('notes', id)
        const base = current?.server_updated_at || null
        // Also capture a local snapshot when offline (same as online path)
        try {
            if (current) {
                const snapshot = { id: current.id, folder_id: current.folder_id, content_encrypted: current.content_encrypted, nonce: current.nonce, word_count: current.word_count, server_updated_at: current.server_updated_at }
                let enc = { snapshot_encrypted: JSON.stringify(snapshot), nonce: '' }
                try {
                    const key = getNoteKey()
                    if (key) {
                        const result = await encryptNotePayload(key, JSON.stringify(snapshot))
                        enc = { snapshot_encrypted: result.ciphertext, nonce: result.nonce }
                    }
                } catch { }
                await (db as any).add('history', { entity: 'note', entity_id: id, ...enc, created_at: Date.now(), reason: 'autosave' })
            }
        } catch { }
        await upsertLocalNoteFromPayload({ id, ...patch }, { dirty: true, locally_edited_at: now() })
        await enqueue('note.update', { id, patch }, base)
        return { ok: true, offline: true }
    }
}

export async function deleteNote(id: string): Promise<{ ok: boolean; offline?: true }> {
    try {
        const res = await api.deleteNote(id)
        if (res && res.ok) {
            const db = await getDB()
            const n = await db.get('notes', id)
            if (n) {
                n.deleted_at = new Date().toISOString()
                await db.put('notes', n)
            }
            try { const { deleteIndexDoc } = await import('./search'); deleteIndexDoc(id) } catch { }
            try { window.dispatchEvent(new Event('notes-refreshed')) } catch { }
        }
        return res
    } catch {
        const db = await getDB()
        const n = await db.get('notes', id)
        if (n) { n.deleted_at = new Date().toISOString(); await db.put('notes', n) }
        await enqueue('note.softDelete', { id }, null)
        try { const { deleteIndexDoc } = await import('./search'); deleteIndexDoc(id) } catch { }
        try { window.dispatchEvent(new Event('notes-refreshed')) } catch { }
        return { ok: true, offline: true }
    }
}

export async function restoreNote(id: string): Promise<{ ok: boolean; offline?: true }> {
    try {
        const res = await api.restoreNote(id)
        if (res && res.ok) {
            const db = await getDB()
            const n = await db.get('notes', id)
            if (n) { n.deleted_at = null; await db.put('notes', n) }
            try {
                const key = getNoteKey()
                if (key && n && n.content_encrypted && n.nonce) {
                    const { upsertIndexDoc, persistIndex } = await import('./search')
                    await upsertIndexDoc(key, { id, content_encrypted: n.content_encrypted, nonce: n.nonce })
                    await persistIndex(key)
                }
            } catch { }
            try { window.dispatchEvent(new Event('notes-refreshed')) } catch { }
        }
        return res
    } catch {
        const db = await getDB()
        const n = await db.get('notes', id)
        if (n) { n.deleted_at = null; await db.put('notes', n) }
        await enqueue('note.restore', { id }, null)
        try { window.dispatchEvent(new Event('notes-refreshed')) } catch { }
        return { ok: true, offline: true }
    }
}

// Folders: cache-first reads; mutations still go through network for now (to avoid complex ID reconciliation offline)
export async function getFolders(): Promise<{ ok: boolean; folders: any[] }> {
    const db = await getDB()
    const local = await db.getAll('folders')
        // background refresh
        ; (async () => {
            try {
                const res = await api.getFolders()
                if (res && res.ok && Array.isArray(res.folders)) {
                    const tx = (await getDB()).transaction('folders', 'readwrite')
                    const store = tx.objectStore('folders')
                    for (const f of res.folders) {
                        await store.put({ id: f.id, parent_id: f.parent_id ?? null, name_encrypted: f.name_encrypted, is_default: Number(f.is_default || 0), goal_word_count: f.goal_word_count ?? null, server_updated_at: f.updated_at || null, order: f.order ?? 0, created_at: f.created_at })
                    }
                    await tx.done
                    // Now that folders (including Inbox) are up to date, repair orphan notes
                    try { await repairNotesFolderAssignments() } catch { }
                    try { window.dispatchEvent(new Event('folders-refreshed')) } catch { }
                }
            } catch { /* ignore offline */ }
        })()
    return { ok: true, folders: local }
}

// Folders: offline-capable mutations with outbox
type CreateFolderPayload = { parent_id?: string; name_encrypted: string; is_default?: boolean; order?: number; goal_word_count?: number | null }
type UpdateFolderPayload = { name_encrypted?: string; parent_id?: string | null; order?: number; goal_word_count?: number | null }

export async function createFolder(payload: CreateFolderPayload): Promise<{ ok: boolean; id?: string; offline?: true }> {
    try {
        const res = await api.createFolder(payload)
        if (res && res.ok && res.id) {
            const db = await getDB()
            await db.put('folders', {
                id: res.id,
                parent_id: payload.parent_id ?? null,
                name_encrypted: payload.name_encrypted,
                is_default: payload.is_default ? 1 : 0,
                goal_word_count: payload.goal_word_count ?? null,
                server_updated_at: new Date().toISOString(),
                order: payload.order ?? 0,
            })
            try { window.dispatchEvent(new Event('folders-refreshed')) } catch { }
        }
        return res
    } catch {
        // Create locally with a client-generated id and enqueue for server sync
        const clientId = `local-${uuidv4()}`
        const db = await getDB()
        await db.put('folders', {
            id: clientId,
            parent_id: payload.parent_id ?? null,
            name_encrypted: payload.name_encrypted,
            is_default: payload.is_default ? 1 : 0,
            goal_word_count: payload.goal_word_count ?? null,
            server_updated_at: null,
            order: payload.order ?? 0,
        })
        await enqueue('folder.create', { client_id: clientId, ...payload }, null)
        try { window.dispatchEvent(new Event('folders-refreshed')) } catch { }
        return { ok: true, id: clientId, offline: true }
    }
}

export async function updateFolder(id: string, patch: UpdateFolderPayload): Promise<{ ok: boolean; offline?: true }> {
    try {
        const res = await api.updateFolder(id, patch)
        if (res && res.ok) {
            const db = await getDB()
            const f = await db.get('folders', id)
            if (f) {
                await db.put('folders', { ...f, ...patch })
                try { window.dispatchEvent(new Event('folders-refreshed')) } catch { }
            }
        }
        return res
    } catch {
        // Optimistic local update and enqueue
        const db = await getDB()
        const f = await db.get('folders', id)
        if (f) await db.put('folders', { ...f, ...patch })
        await enqueue('folder.update', { id, patch }, null)
        try { window.dispatchEvent(new Event('folders-refreshed')) } catch { }
        return { ok: true, offline: true }
    }
}

export async function deleteFolder(id: string): Promise<{ ok: boolean; offline?: true }> {
    try {
        const res = await api.deleteFolder(id)
        if (res && res.ok) {
            const db = await getDB()
            // move notes to Inbox locally if we can find it
            const folders = await db.getAll('folders')
            const inbox = folders.find((x: any) => Number(x.is_default) === 1)
            if (inbox) {
                // reassign notes
                const tx = (await getDB()).transaction(['notes', 'folders'], 'readwrite')
                const idx = tx.objectStore('notes').index('by-folder')
                const affected = await idx.getAll(id)
                for (const n of affected) {
                    n.folder_id = inbox.id
                    await tx.objectStore('notes').put(n)
                }
                // reparent child folders to root
                const fstore = tx.objectStore('folders')
                const allFolders = await (await getDB()).getAll('folders')
                for (const f of allFolders as any[]) {
                    if (f.parent_id === id) {
                        await fstore.put({ ...f, parent_id: null })
                    }
                }
                await tx.objectStore('folders').delete(id)
                await tx.done
            } else {
                // Still delete and reparent children to root if possible
                const tx = (await getDB()).transaction('folders', 'readwrite')
                const fstore = tx.objectStore('folders')
                const allFolders = await (await getDB()).getAll('folders')
                for (const f of allFolders as any[]) {
                    if (f.parent_id === id) {
                        await fstore.put({ ...f, parent_id: null })
                    }
                }
                await fstore.delete(id)
                await tx.done
            }
            try { window.dispatchEvent(new Event('folders-refreshed')) } catch { }
        }
        return res
    } catch {
        // Optimistic local delete and enqueue
        const db = await getDB()
        const folders = await db.getAll('folders')
        const inbox = folders.find((x: any) => Number(x.is_default) === 1)
        if (inbox) {
            const tx = (await getDB()).transaction(['notes', 'folders'], 'readwrite')
            const idx = tx.objectStore('notes').index('by-folder')
            const affected = await idx.getAll(id)
            for (const n of affected) {
                n.folder_id = inbox.id
                await tx.objectStore('notes').put(n)
            }
            // reparent child folders
            const fstore = tx.objectStore('folders')
            const allFolders = await (await getDB()).getAll('folders')
            for (const f of allFolders as any[]) {
                if (f.parent_id === id) {
                    await fstore.put({ ...f, parent_id: null })
                }
            }
            await fstore.delete(id)
            await tx.done
        } else {
            const tx = (await getDB()).transaction('folders', 'readwrite')
            const fstore = tx.objectStore('folders')
            const allFolders = await (await getDB()).getAll('folders')
            for (const f of allFolders as any[]) {
                if (f.parent_id === id) {
                    await fstore.put({ ...f, parent_id: null })
                }
            }
            await fstore.delete(id)
            await tx.done
        }
        await enqueue('folder.delete', { id }, null)
        try { window.dispatchEvent(new Event('folders-refreshed')) } catch { }
        return { ok: true, offline: true }
    }
}

// Settings: full offline support with outbox for updates
type SettingsPayload = any

export async function getSettings(): Promise<{ ok: boolean; settings: SettingsPayload }> {
    const db = await getDB()
    const rec = await (db as any).get('settings', 'current')
    const local = rec?.data ?? {}
        // background refresh
        ; (async () => {
            try {
                const res = await api.getSettings()
                if (res && res.ok) {
                    await (await getDB()).put('settings', { data: res.settings || {}, updated_at: Date.now() }, 'current' as any)
                    try { window.dispatchEvent(new Event('settings-refreshed')) } catch { }
                }
            } catch { /* ignore offline */ }
        })()
    return { ok: true, settings: local }
}

export async function updateSettings(payload: SettingsPayload): Promise<{ ok: boolean; settings?: SettingsPayload; offline?: true }> {
    try {
        const res = await api.updateSettings(payload)
        if (res && res.ok) {
            await (await getDB()).put('settings', { data: res.settings || payload, updated_at: Date.now() }, 'current' as any)
            try { window.dispatchEvent(new Event('settings-updated')) } catch { }
        }
        return res
    } catch {
        await (await getDB()).put('settings', { data: payload, updated_at: Date.now() }, 'current' as any)
        await enqueue('settings.update', payload, null)
        try { window.dispatchEvent(new Event('settings-updated')) } catch { }
        return { ok: true, settings: payload, offline: true }
    }
}

// Helpers
async function upsertLocalNoteFromPayload(payload: any, extras: Partial<{ dirty: boolean; locally_edited_at: number; server_updated_at: string | null }>) {
    const db = await getDB()
    const n = await db.get('notes', payload.id)
    // Resolve folder_id, defaulting to local Inbox if none present (prevents hidden notes in folder views)
    let resolvedFolderId: string = payload.folder_id || n?.folder_id || ''
    if (!resolvedFolderId) {
        try {
            const folders = await db.getAll('folders')
            const inbox = (folders as any[]).find((x: any) => Number(x.is_default) === 1)
            if (inbox && inbox.id) resolvedFolderId = inbox.id
        } catch { /* ignore */ }
    }
    await db.put('notes', {
        id: payload.id,
        folder_id: resolvedFolderId,
        content_encrypted: payload.content_encrypted || n?.content_encrypted || '',
        nonce: payload.nonce || n?.nonce || '',
        word_count: Number(payload.word_count ?? n?.word_count ?? 0),
        server_updated_at: extras.server_updated_at ?? n?.server_updated_at ?? null,
        locally_edited_at: extras.locally_edited_at ?? n?.locally_edited_at ?? null,
        dirty: extras.dirty ?? n?.dirty ?? false,
    })
    // Update search index in the background if we have encryption key and content
    try {
        const key = getNoteKey()
        const contentEncrypted = payload.content_encrypted || n?.content_encrypted
        const nonce = payload.nonce || n?.nonce
        if (key && contentEncrypted && nonce) {
            upsertIndexDoc(key, { id: payload.id, content_encrypted: contentEncrypted, nonce })
                .then(() => persistIndex(key))
                .catch(() => { /* ignore */ })
        }
    } catch { /* ignore */ }
}

async function enqueue(type: string, payload: any, base_server_updated_at: string | null) {
    const db = await getDB()
    await db.add('outbox', { type, payload, base_server_updated_at: base_server_updated_at || null, created_at: now() })
}

export type LocalNoteRecord = {
    id: string
    folder_id: string
    content_encrypted: string
    nonce: string
    word_count: number
    server_updated_at?: string | null
    locally_edited_at?: number | null
    dirty?: boolean
}

export async function getLocalNote(id: string): Promise<LocalNoteRecord | undefined> {
    const db = await getDB()
    return db.get('notes', id)
}

// Maintenance: ensure any notes without a valid folder_id are assigned to Inbox locally,
// and soft-delete exact duplicate notes (same ciphertext + nonce) keeping a canonical record.
async function repairNotesFolderAssignments() {
    const db = await getDB()
    const folders = await db.getAll('folders')
    if (!folders || folders.length === 0) return
    const inbox = (folders as any[]).find((x: any) => Number(x.is_default) === 1)
    if (!inbox || !inbox.id) return
    const validFolderIds = new Set((folders as any[]).map((f: any) => f.id))
    const tx = (await getDB()).transaction('notes', 'readwrite')
    const store = tx.objectStore('notes')
    const allNotes = await store.getAll()
    let changed = 0
    for (const n of allNotes as any[]) {
        const fid = n.folder_id
        if (!fid || !validFolderIds.has(fid)) {
            n.folder_id = inbox.id
            await store.put(n)
            changed++
        }
    }
    // Deduplicate by content signature (ciphertext + nonce). Keep server-backed or dirty note.
    const bySig = new Map<string, any[]>()
    for (const n of allNotes as any[]) {
        const sig = `${n.content_encrypted || ''}::${n.nonce || ''}`
        if (!sig || sig === '::') continue
        const arr = bySig.get(sig) || []
        arr.push(n)
        bySig.set(sig, arr)
    }
    for (const [, group] of bySig) {
        if (!group || group.length <= 1) continue
        // Pick canonical: prefer one with server_updated_at, then dirty, else first
        let canonical = group.find(g => !!g.server_updated_at) || group.find(g => !!g.dirty) || group[0]
        for (const n of group) {
            if (n.id === canonical.id) continue
            // Only soft-delete clearly duplicate local-only notes (no server_updated_at and not dirty)
            if (!n.server_updated_at && !n.dirty && !n.deleted_at) {
                n.deleted_at = new Date().toISOString()
                await store.put(n)
                // Remove from search index if present
                try { const { deleteIndexDoc } = await import('./search'); deleteIndexDoc(n.id) } catch { }
                changed++
            }
        }
    }
    await tx.done
    if (changed > 0) {
        try { window.dispatchEvent(new Event('notes-refreshed')) } catch { }
    }
}

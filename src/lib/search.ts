import MiniSearch, { Options, SearchResult } from 'minisearch'
import { getDB, getDecryptedBlob, putEncryptedBlob } from './db'
import { decryptNotePayload } from './crypto'

let index: MiniSearch | null = null

export function getIndex(): MiniSearch | null { return index }

export async function buildIndexFromNotes(noteKeyB64: string) {
    const db = await getDB()
    const notes: Array<{ id: string; content_encrypted?: string; nonce?: string }> = await db.getAll('notes')
    const options: Options = { fields: ['title', 'content'], storeFields: ['id'] }
    index = new MiniSearch(options as any)
    const docs = await Promise.all(notes.map(async (n) => {
        try {
            if (n.content_encrypted && n.nonce) {
                const plain = await decryptNotePayload(noteKeyB64, n.content_encrypted, n.nonce)
                try {
                    const parsed = JSON.parse(plain)
                    const title = parsed.title || ''
                    const content = parsed.content || ''
                    return { id: n.id, title, content }
                } catch {
                    return { id: n.id, title: '', content: plain || '' }
                }
            }
        } catch { /* ignore single-note decrypt failure */ }
        return { id: n.id, title: '', content: '' }
    }))
    index.addAll(docs)
    await persistIndex(noteKeyB64)
}

export async function loadIndex(noteKeyB64: string) {
    const dump = await getDecryptedBlob('searchIndex', 'minisearch-v1', noteKeyB64)
    const options: Options = { fields: ['title', 'content'], storeFields: ['id'] }
    if (dump) {
        try {
            const obj = JSON.parse(dump)
            index = MiniSearch.loadJS(obj, options)
            return
        } catch {
            // fall through to fresh index
        }
    }
    index = new MiniSearch(options as any)
}

export async function persistIndex(noteKeyB64: string) {
    if (!index) return
    const dump = JSON.stringify(index.toJSON())
    await putEncryptedBlob('searchIndex', 'minisearch-v1', dump, noteKeyB64)
}

export function search(q: string): Array<SearchResult & { id: string }> {
    if (!index) return []
    return index.search(q) as any
}

export async function upsertIndexDoc(noteKeyB64: string, note: { id: string; content_encrypted?: string; nonce?: string }) {
    if (!index) return
    try {
        if (note.content_encrypted && note.nonce) {
            const plain = await decryptNotePayload(noteKeyB64, note.content_encrypted, note.nonce)
            let title = ''
            let content = ''
            try {
                const parsed = JSON.parse(plain)
                title = parsed.title || ''
                content = parsed.content || ''
            } catch { content = plain || '' }
            index.add({ id: note.id, title, content } as any)
        }
    } catch { /* ignore */ }
}

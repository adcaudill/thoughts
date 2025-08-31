import { openDB, DBSchema, IDBPDatabase } from 'idb'
import { encryptNotePayload, decryptNotePayload } from './crypto'

export interface ThoughtsDB extends DBSchema {
    notes: {
        key: string
        value: {
            id: string
            folder_id: string
            content_encrypted: string
            nonce: string
            word_count: number
            server_updated_at?: string | null
            locally_edited_at?: number | null
            dirty?: boolean
            deleted_at?: string | null
        }
        indexes: { 'by-folder': string; 'by-dirty': string }
    }
    folders: {
        key: string
        value: {
            id: string
            name_encrypted: string
            is_default: number
            goal_word_count?: number | null
            server_updated_at?: string | null
        }
    }
    settings: { key: string; value: any }
    outbox: {
        key: number
        value: {
            id?: number
            type: string
            payload: any
            base_server_updated_at?: string | null
            created_at: number
        }
        indexes: { 'by-created': number }
    }
    history: {
        key: number
        value: {
            id?: number
            entity: 'note' | 'folder'
            entity_id: string
            snapshot_encrypted: string
            nonce: string
            created_at: number
            reason: 'conflict' | 'manual' | 'autosave'
        }
    }
    searchIndex: {
        key: string
        value: { ciphertext: string; nonce: string; updated_at: number; docCount?: number }
    }
}

let dbPromise: Promise<IDBPDatabase<ThoughtsDB>> | null = null

function hasIndexedDB() {
    try { return typeof indexedDB !== 'undefined' } catch { return false }
}

// Minimal in-memory fallback for tests/SSR where indexedDB is not available
let memDB: any | null = null
function getMemDB() {
    if (memDB) return memDB
    const stores: Record<string, Map<any, any>> = {
        notes: new Map(),
        folders: new Map(),
        settings: new Map(),
        outbox: new Map(),
        history: new Map(),
        searchIndex: new Map(),
    }
    let outboxAuto = 1
    let historyAuto = 1
    const api: any = {
        async get(store: string, key: any) { return stores[store].get(key) || undefined },
        async getAll(store: string) { return Array.from(stores[store].values()) },
        async put(store: string, value: any, key?: any) {
            const k = key ?? value?.id ?? value?.key
            if (k == null) throw new Error('put requires key or value.id')
            stores[store].set(k, { ...value })
            return k
        },
        async add(store: string, value: any) {
            if (store === 'outbox') {
                const id = outboxAuto++
                const v = { ...value, id }
                if (v.created_at == null) v.created_at = Date.now()
                stores.outbox.set(id, v)
                return id
            }
            if (store === 'history') {
                const id = historyAuto++
                const v = { ...value, id }
                stores.history.set(id, v)
                return id
            }
            return api.put(store, value)
        },
        transaction(storeNames: string | string[], _mode?: 'readonly' | 'readwrite') {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames]
            const self = this
            function mkStore(name: string) {
                return {
                    get: (key: any) => self.get(name, key),
                    getAll: () => self.getAll(name),
                    // Support idb signature: put(value, key?)
                    put: (val: any, key?: any) => self.put(name, val, key),
                    // Support idb signature: add(value, key?)
                    add: (val: any, key?: any) => (key !== undefined ? self.put(name, val, key) : self.add(name, val)),
                    delete: (key: any) => { stores[name].delete(key); return Promise.resolve() },
                    index: (idxName: string) => ({
                        getAll: (arg?: any) => {
                            if (name === 'notes') {
                                const arr = Array.from(stores.notes.values())
                                if (idxName === 'by-folder' && arg != null) return Promise.resolve(arr.filter((n: any) => n.folder_id === arg))
                                if (idxName === 'by-dirty') return Promise.resolve(arr.filter((n: any) => !!n.dirty))
                            }
                            if (name === 'outbox' && idxName === 'by-created') {
                                const arr = Array.from(stores.outbox.values())
                                arr.sort((a: any, b: any) => Number(a.created_at) - Number(b.created_at))
                                return Promise.resolve(arr)
                            }
                            return Promise.resolve([])
                        },
                    }),
                }
            }
            const obj = {
                objectStore: (n: string) => mkStore(n),
                get store() { return mkStore(names[0]) },
                done: Promise.resolve(),
            }
            return obj
        },
    }
    memDB = api
    return memDB
}

export function getDB() {
    if (!hasIndexedDB()) return Promise.resolve(getMemDB()) as any
    if (!dbPromise) {
        dbPromise = openDB<ThoughtsDB>('thoughts-db', 1, {
            upgrade(db: IDBPDatabase<ThoughtsDB>) {
                const notes = db.createObjectStore('notes', { keyPath: 'id' })
                notes.createIndex('by-folder', 'folder_id')
                notes.createIndex('by-dirty', 'dirty')
                db.createObjectStore('folders', { keyPath: 'id' })
                db.createObjectStore('settings')
                const outbox = db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true })
                outbox.createIndex('by-created', 'created_at')
                db.createObjectStore('history', { keyPath: 'id', autoIncrement: true })
                db.createObjectStore('searchIndex')
            },
        })
    }
    return dbPromise
}

// Helpers for encrypted storage of small blobs with a given note key
export async function putEncryptedBlob(store: 'settings' | 'searchIndex', key: string, plaintext: string, noteKeyB64: string) {
    const { ciphertext, nonce } = await encryptNotePayload(noteKeyB64, plaintext)
    const db = await getDB()
    // Some DBs (like idb) support third param for key; our memDB supports too
    await (db as any).put(store, { ciphertext, nonce, updated_at: Date.now() }, key as any)
}

export async function getDecryptedBlob(store: 'settings' | 'searchIndex', key: string, noteKeyB64: string): Promise<string | null> {
    const db = await getDB()
    const rec: any = await (db as any).get(store, key as any)
    if (!rec) return null
    try {
        return await decryptNotePayload(noteKeyB64, rec.ciphertext, rec.nonce)
    } catch {
        return null
    }
}

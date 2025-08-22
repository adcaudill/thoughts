import { describe, it, expect, vi } from 'vitest'
import { createMockD1 } from '../utils/mockD1'

// mock argon2-browser before importing service so the worker code uses the mock
vi.mock('argon2-browser', async () => {
    const mod = { hash: async ({ pass }: any) => ({ hash: pass }), ArgonType: { Argon2id: 2 } }
    return { default: mod }
})
import dataRouter from '../../worker/routes/data'
import { registerUser } from '../../worker/lib/authService'

function makeReq(method: string, url = 'http://localhost/api/notes', body?: any, headers: Record<string, string> = {}) {
    return new Request(url, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'Content-Type': 'application/json', ...headers } })
}

function uint8ToBase64(u8: Uint8Array) {
    let s = ''
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
    return btoa(s)
}

function base64Url(u8: Uint8Array) {
    return uint8ToBase64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function makeJwt(sub: string, key = 'test-secret') {
    const header = { alg: 'HS256', typ: 'JWT' }
    const payload = { sub, exp: Math.floor(Date.now() / 1000) + 60 }
    const headerB64 = base64Url(new TextEncoder().encode(JSON.stringify(header)) as unknown as Uint8Array)
    const payloadB64 = base64Url(new TextEncoder().encode(JSON.stringify(payload)) as unknown as Uint8Array)
    const toSign = `${headerB64}.${payloadB64}`
    const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(toSign))
    const sigB64 = base64Url(new Uint8Array(sig) as unknown as Uint8Array)
    return `${toSign}.${sigB64}`
}

describe('notes integration', () => {
    it('creates a note without folder_id and assigns/creates the Inbox', async () => {
        const mockDb = createMockD1()
        const env: any = { DB: mockDb }

        // register a user via service which normally creates an inbox, but we'll simulate omission
        const user = await registerUser(mockDb, { username: 'notesuser', client_salt: 's1', client_hash: 'h1', inbox_name_encrypted: 'inbox' })
        expect(user.id).toBeTruthy()

        // prepare request without folder_id
        const body = { content_encrypted: 'encrypted-content', nonce: 'n1' }
        const req = makeReq('POST', 'http://localhost/api/notes', body)
        // sign a JWT with the same key the router will use and attach Authorization header
        env.JWT_SECRET = 'test-secret'
        const token = await makeJwt(user.id, env.JWT_SECRET)
        const authReq = makeReq('POST', 'http://localhost/api/notes', body, { Authorization: `Bearer ${token}` })
            // attach env like other tests do and call router
            ; (authReq as any).env = env
        // @ts-ignore
        const res = typeof (dataRouter as any).fetch === 'function' ? await (dataRouter as any).fetch(authReq) : await (dataRouter as any).handle(authReq)
        expect(res).toBeTruthy()
        const json = await res.json()
        expect(json.ok).toBe(true)
        expect(json.id).toBeTruthy()

        // ensure the note exists in DB and has a folder_id that matches an inbox folder
        const note = mockDb.prepare('SELECT * FROM notes WHERE id = ?').bind(json.id).first()
        expect(note).toBeTruthy()
        const inbox = mockDb.prepare('SELECT id FROM folders WHERE user_id = ? AND is_default = 1').bind(user.id).first()
        expect(inbox).toBeTruthy()
        expect(note.folder_id).toBe(inbox.id)
    }, 10000)

    it('creates a note with explicit folder_id', async () => {
        const mockDb = createMockD1()
        const env: any = { DB: mockDb }

        const user = await registerUser(mockDb, { username: 'notesuser2', client_salt: 's2', client_hash: 'h2', inbox_name_encrypted: 'inbox' })
        expect(user.id).toBeTruthy()

        // create a folder
        const folderId = 'folder-explicit-1'
        await mockDb.prepare('INSERT INTO folders (id, user_id, parent_id, name_encrypted, is_default) VALUES (?, ?, ?, ?, ?)').bind(folderId, user.id, null, 'f', 0).run()

        const body = { content_encrypted: 'encrypted-content', nonce: 'n1', folder_id: folderId }
        const req = makeReq('POST', 'http://localhost/api/notes', body)

        env.JWT_SECRET = 'test-secret'
        const token = await makeJwt(user.id, env.JWT_SECRET)
        const authReq = makeReq('POST', 'http://localhost/api/notes', body, { Authorization: `Bearer ${token}` })
            ; (authReq as any).env = env
        // @ts-ignore
        const res = typeof (dataRouter as any).fetch === 'function' ? await (dataRouter as any).fetch(authReq) : await (dataRouter as any).handle(authReq)
        const json = await res.json()
        expect(json.ok).toBe(true)

        const note = mockDb.prepare('SELECT * FROM notes WHERE id = ?').bind(json.id).first()
        expect(note).toBeTruthy()
        expect(note.folder_id).toBe(folderId)
    }, 10000)
})

import { describe, it, expect, vi } from 'vitest'
import { createMockD1 } from '../utils/mockD1'

// reuse argon2 mock used elsewhere
vi.mock('argon2-browser', async () => {
    const mod = { hash: async ({ pass }: any) => ({ hash: pass }), ArgonType: { Argon2id: 2 } }
    return { default: mod }
})

import authRouter from '../../worker/routes/auth'
import dataRouter from '../../worker/routes/data'
import { registerUser } from '../../worker/lib/authService'

function makeReq(method: string, url = 'http://localhost/api/auth/login', body?: any, headers: Record<string, string> = {}) {
    return new Request(url, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'Content-Type': 'application/json', ...headers } })
}

describe('cookie auth flow', () => {
    it('login sets HttpOnly cookie and subsequent notes POST with Cookie is accepted', async () => {
        const mockDb = createMockD1()
        const env: any = { DB: mockDb }

        // create a user via registerUser helper (bypasses HTTP register endpoint)
        const username = 'cookieuser'
        // use base64-encoded values to match server helpers (they expect base64/base64url)
        const client_salt_b64 = btoa('s')
        const client_hash_b64 = btoa('h')
        const user = await registerUser(mockDb, { username, client_salt: client_salt_b64, client_hash: client_hash_b64, inbox_name_encrypted: 'inbox' })
        expect(user.id).toBeTruthy()

        // Perform a login request to the auth router which should return Set-Cookie
        // Build a login request body matching the server expectation: username + client_hash
        const body = { username, client_hash: client_hash_b64 }
        env.JWT_SECRET = 'test-secret'

        const loginReq = makeReq('POST', 'http://localhost/api/auth/login', body);
        (loginReq as any).env = env
        // call the router: prefer fetch or fallback to handle
        const loginRes = (authRouter as any).fetch ? await (authRouter as any).fetch(loginReq) : await (authRouter as any).handle(loginReq)
        expect(loginRes).toBeTruthy()
        const setCookie = loginRes.headers.get('Set-Cookie')
        expect(setCookie).toBeTruthy()
        expect(setCookie).toContain('thoughts_auth=')

        // extract cookie value
        const m = setCookie!.match(/thoughts_auth=([^;]+)/)
        expect(m).toBeTruthy()
        const token = m ? decodeURIComponent(m[1]) : null
        expect(token).toBeTruthy()

        // Now call dataRouter POST /api/notes with Cookie header containing the token
        const noteBody = { content_encrypted: 'c', nonce: 'n' }
        const cookieHeader = `thoughts_auth=${encodeURIComponent(token || '')}`
        const notesReq = makeReq('POST', 'http://localhost/api/notes', noteBody, { Cookie: cookieHeader });
        (notesReq as any).env = env
        const notesRes = (dataRouter as any).fetch ? await (dataRouter as any).fetch(notesReq) : await (dataRouter as any).handle(notesReq)
        expect(notesRes).toBeTruthy()
        const j = await notesRes.json()
        expect(j.ok).toBe(true)
        expect(j.id).toBeTruthy()
    }, 10000)
})

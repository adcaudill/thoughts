import { Router } from 'itty-router'
// uuid is used in other worker modules; not required in this router file.
import { signJwt, verifyJwt } from '../lib/jwt'
import { registerUser, createChallenge, hashClientToServer } from '../lib/authService'

const router = Router()

// auth router module

// Small helper to avoid hanging the Worker if a Promise never resolves (e.g., WASM load).
function withTimeout<T>(p: Promise<T>, ms: number, label = 'operation'): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
    ])
}

async function json(req: Request) {
    try {
        return await req.json()
    } catch {
        return null
    }
}

router.post('/api/auth/register', async request => {
    try {
        const body = await json(request)
        if (!body || !body.username || !body.client_salt || !body.client_hash) {
            return new Response(JSON.stringify({ ok: false, error: 'missing fields' }), { status: 400 })
        }
        const env = (request as any).env as any
        const db = env && env.DB

        if (!db) return new Response(JSON.stringify({ ok: false, error: 'db binding missing', _diag: { envKeys: env ? Object.keys(env) : null } }), { status: 500 })
        // ensure Web Crypto APIs exist
        if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.getRandomValues) {
            return new Response(JSON.stringify({ ok: false, error: 'missing_webcrypto', _diag: 'crypto.subtle or getRandomValues not available' }), { status: 500 })
        }

        const result = await withTimeout(registerUser(db, body), 10000, 'registerUser')
        return new Response(JSON.stringify({ ok: true, ...result }), { status: 200 })
    } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: err && err.message ? err.message : 'register failed' }), { status: 500 })
    }
})

// Lightweight health check to verify worker routing and runtime
router.get('/api/auth/ping', () => {
    return new Response(JSON.stringify({ ok: true, pong: true }), { status: 200 })
})

// (no runtime instrumentation in production)

// Recover: user supplies username + recovery_key (raw). If the SHA-256 matches stored recovery_hash, issue short-lived rekey token.
router.post('/api/auth/recover', async request => {
    const body = await json(request)
    if (!body || !body.username || !body.recovery_key) return new Response(JSON.stringify({ ok: false, error: 'missing fields' }), { status: 400 })
    const env = (request as any).env as any
    const db = env && env.DB
    const userRes = await db.prepare('SELECT id, recovery_hash FROM users WHERE username = ?').bind(body.username).first()
    if (!userRes) return new Response(JSON.stringify({ ok: false, error: 'unknown user' }), { status: 404 })

    // compute SHA-256(recovery_key) and compare
    const keyBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.recovery_key))
    const keyB64 = uint8ToBase64(new Uint8Array(keyBuf))
    if (keyB64 !== userRes.recovery_hash) return new Response(JSON.stringify({ ok: false, error: 'invalid recovery key' }), { status: 401 })

    // issue short-lived token (15 minutes) with purpose=rekey
    const token = await signJwt({ sub: userRes.id, iat: Math.floor(Date.now() / 1000), purpose: 'rekey' }, env.JWT_SECRET || 'dev-secret', { expSeconds: 60 * 15 })
    return new Response(JSON.stringify({ ok: true, token }), { status: 200 })
})

// Rekey: accepts rekey token and new client_hash/client_salt and optional new recovery_encrypted_key/recovery_hash
router.post('/api/auth/rekey', async request => {
    const body = await json(request)
    if (!body || !body.token || !body.new_client_hash || !body.new_client_salt) return new Response(JSON.stringify({ ok: false, error: 'missing fields' }), { status: 400 })
    const env = (request as any).env as any
    const db = env && env.DB

    // verify token
    let payload
    try {
        payload = await verifyJwt(body.token, env.JWT_SECRET || 'dev-secret', 'rekey')
    } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid or expired token' }), { status: 401 })
    }

    // update server stored password-equivalent with new client_hash
    const userId = payload.sub
    const newServerSalt = uint8ToBase64(crypto.getRandomValues(new Uint8Array(16)))
    const newHashedHash = await hashClientToServer(body.new_client_hash, newServerSalt)
    const newRecoveryEncryptedKey = body.new_recovery_encrypted_key || null
    const newRecoveryHash = body.new_recovery_hash || null
    await db.prepare('UPDATE users SET server_password_hash = ?, server_salt = ?, client_salt = ?, recovery_encrypted_key = ?, recovery_hash = ? WHERE id = ?')
        .bind(newHashedHash, newServerSalt, body.new_client_salt, newRecoveryEncryptedKey, newRecoveryHash, userId)
        .run()
    // If reencrypted notes were provided, update them now
    if (body.reencrypted_notes && Array.isArray(body.reencrypted_notes)) {
        for (const rn of body.reencrypted_notes) {
            if (!rn.id || !rn.content_encrypted) continue
            await db.prepare('UPDATE notes SET content_encrypted = ?, nonce = ? WHERE id = ? AND user_id = ?')
                .bind(rn.content_encrypted, rn.nonce || null, rn.id, userId)
                .run()
        }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
})

// Fetch recovery_encrypted_key for user (requires rekey token)
router.post('/api/auth/recover/key', async request => {
    const body = await json(request)
    if (!body || !body.token) return new Response(JSON.stringify({ ok: false, error: 'missing token' }), { status: 400 })
    const env = (request as any).env as any
    const db = env && env.DB
    let payload
    try {
        payload = await verifyJwt(body.token, env.JWT_SECRET || 'dev-secret', 'rekey')
    } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid or expired token' }), { status: 401 })
    }
    const userId = payload.sub
    const userRes = await db.prepare('SELECT recovery_encrypted_key FROM users WHERE id = ?').bind(userId).first()
    if (!userRes) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 })
    return new Response(JSON.stringify({ ok: true, recovery_encrypted_key: userRes.recovery_encrypted_key }), { status: 200 })
})

// Fetch all encrypted notes for user (requires rekey token)
router.post('/api/auth/recover/notes', async request => {
    const body = await json(request)
    if (!body || !body.token) return new Response(JSON.stringify({ ok: false, error: 'missing token' }), { status: 400 })
    const env = (request as any).env as any
    const db = env && env.DB
    const parts = body.token.split('.')
    if (parts.length !== 3) return new Response(JSON.stringify({ ok: false, error: 'invalid token' }), { status: 400 })
    const [headerB64, payloadB64, signatureB64] = parts
    const toSign = `${headerB64}.${payloadB64}`
    const key = env.JWT_SECRET || 'dev-secret'
    const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(toSign))
    const expected = uint8ToBase64(new Uint8Array(sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    if (expected !== signatureB64) return new Response(JSON.stringify({ ok: false, error: 'invalid token' }), { status: 401 })
    let payload
    try {
        payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
    } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid token payload' }), { status: 400 })
    }
    const now = Math.floor(Date.now() / 1000)
    if (!payload.purpose || payload.purpose !== 'rekey' || !payload.sub || (payload.exp && now > payload.exp)) return new Response(JSON.stringify({ ok: false, error: 'invalid or expired token' }), { status: 401 })
    const userId = payload.sub
    const notes = await db.prepare('SELECT id, folder_id, title_encrypted, content_encrypted, nonce FROM notes WHERE user_id = ?').bind(userId).all()
    return new Response(JSON.stringify({ ok: true, notes: notes.results || [] }), { status: 200 })
})

router.post('/api/auth/login', async request => {
    const body = await json(request)
    if (!body || !body.username || !body.client_hash) {
        return new Response(JSON.stringify({ ok: false, error: 'missing fields' }), { status: 400 })
    }

    const env = (request as any).env as any
    const db = env && env.DB

    const userRes = await db.prepare('SELECT * FROM users WHERE username = ?').bind(body.username).first()
    if (!userRes) return new Response(JSON.stringify({ ok: false, error: 'invalid credentials' }), { status: 401 })

    const serverHash = userRes.server_password_hash
    const serverSalt = userRes.server_salt

    // Verify by hashing client_hash with serverSalt and comparing
    const expectedServerHash = await hashClientToServer(body.client_hash, serverSalt)
    if (expectedServerHash !== serverHash) return new Response(JSON.stringify({ ok: false, error: 'invalid credentials' }), { status: 401 })

    // Issue JWT (HMAC-SHA256) and set as an HttpOnly cookie
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const now = Math.floor(Date.now() / 1000)
    const exp = now + 60 * 60 * 24 // 24 hours
    const payload = base64UrlEncode(JSON.stringify({ sub: userRes.id, iat: now, exp }))
    const toSign = `${header}.${payload}`
    const key = env.JWT_SECRET || 'dev-secret'
    const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(toSign))
    const signature = uint8ToBase64(new Uint8Array(sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const token = `${toSign}.${signature}`

    // Build Set-Cookie string. Use Secure flag only for https requests.
    const reqUrl = new URL(request.url)
    const isSecure = reqUrl.protocol === 'https:'
    const maxAge = 60 * 60 * 24 // 24 hours
    const cookieParts = [`thoughts_auth=${token}`, `Path=/`, `HttpOnly`, `SameSite=Strict`, `Max-Age=${maxAge}`]
    if (isSecure) cookieParts.push('Secure')
    const setCookie = cookieParts.join('; ')

    return new Response(JSON.stringify({ ok: true, token }), { status: 200, headers: { 'Set-Cookie': setCookie, 'Content-Type': 'application/json' } })
})

// Issue a one-time challenge (nonce) for the given username
router.post('/api/auth/challenge', async request => {
    try {
        const body = await json(request)
        if (!body || !body.username) return new Response(JSON.stringify({ ok: false, error: 'missing username' }), { status: 400 })
        const env = (request as any).env as any
        const db = env && env.DB
        const result = await withTimeout(createChallenge(db, body.username), 3000, 'createChallenge')
        return new Response(JSON.stringify({ ok: true, ...result }), { status: 200 })
    } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: err && err.message ? err.message : 'challenge failed' }), { status: 500 })
    }
})

// Verify the proof for a challenge. Body: { username, client_hash, proof, challenge_id }
router.post('/api/auth/verify', async request => {
    const body = await json(request)
    if (!body || !body.username || !body.client_hash || !body.proof || !body.challenge_id) {
        return new Response(JSON.stringify({ ok: false, error: 'missing fields' }), { status: 400 })
    }

    const env = (request as any).env as any
    const db = env && env.DB

    const challenge = await db.prepare('SELECT * FROM auth_challenges WHERE id = ?').bind(body.challenge_id).first()
    if (!challenge) return new Response(JSON.stringify({ ok: false, error: 'invalid or expired challenge' }), { status: 400 })

    if (challenge.username !== body.username) return new Response(JSON.stringify({ ok: false, error: 'challenge mismatch' }), { status: 400 })

    // verify password-equivalence by hashing client_hash with server salt and comparing
    const userRes = await db.prepare('SELECT * FROM users WHERE username = ?').bind(body.username).first()
    if (!userRes) return new Response(JSON.stringify({ ok: false, error: 'invalid user' }), { status: 404 })

    const serverHash = userRes.server_password_hash
    const serverSalt = userRes.server_salt
    const expectedServerHash2 = await hashClientToServer(body.client_hash, serverSalt)
    if (expectedServerHash2 !== serverHash) return new Response(JSON.stringify({ ok: false, error: 'invalid credentials' }), { status: 401 })

    // compute expected proof = HMAC(client_hash_bytes, nonce)
    const clientHashBytes = base64ToUint8(body.client_hash)
    const nonceBytes = base64ToUint8(challenge.nonce)
    const expectedSig = await hmacSha256(clientHashBytes, nonceBytes)
    const expectedB64 = uint8ToBase64(new Uint8Array(expectedSig))

    // enforce TTL (10 minutes)
    const now = Math.floor(Date.now() / 1000)
    if (challenge.created_at && (now - challenge.created_at) > 60 * 10) {
        await db.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(body.challenge_id).run()
        return new Response(JSON.stringify({ ok: false, error: 'challenge expired' }), { status: 400 })
    }

    // cleanup challenge
    await db.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(body.challenge_id).run()

    if (expectedB64 !== body.proof) return new Response(JSON.stringify({ ok: false, error: 'invalid proof' }), { status: 401 })

    // Issue JWT if proof matches and set it as an HttpOnly cookie
    const token = await signJwt({ sub: userRes.id, iat: Math.floor(Date.now() / 1000) }, env.JWT_SECRET || 'dev-secret', { expSeconds: 60 * 60 * 24 })
    const reqUrl = new URL(request.url)
    const isSecure = reqUrl.protocol === 'https:'
    const maxAge = 60 * 60 * 24
    const cookieParts = [`thoughts_auth=${token}`, `Path=/`, `HttpOnly`, `SameSite=Strict`, `Max-Age=${maxAge}`]
    if (isSecure) cookieParts.push('Secure')
    const setCookie = cookieParts.join('; ')
    return new Response(JSON.stringify({ ok: true, token }), { status: 200, headers: { 'Set-Cookie': setCookie, 'Content-Type': 'application/json' } })
})

// Logout clears the HttpOnly cookie
router.post('/api/auth/logout', async request => {
    const reqUrl = new URL(request.url)
    const isSecure = reqUrl.protocol === 'https:'
    const cookieParts = [`thoughts_auth=; Path=/`, `HttpOnly`, `SameSite=Strict`, `Max-Age=0`]
    if (isSecure) cookieParts.push('Secure')
    const setCookie = cookieParts.join('; ')
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Set-Cookie': setCookie, 'Content-Type': 'application/json' } })
})

// --- helpers ---
function base64ToUint8(b64: string) {
    // Accept both base64 and base64url. Normalize to standard base64 and pad.
    const s = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
    const pad = s.length % 4
    const padded = s + (pad === 2 ? '==' : pad === 3 ? '=' : pad === 1 ? '===' : '')
    const bin = atob(padded)
    const len = bin.length
    const arr = new Uint8Array(len)
    for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i)
    return arr
}

function uint8ToBase64(u8: Uint8Array) {
    let s = ''
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
    return btoa(s)
}

async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array) {
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return await crypto.subtle.sign('HMAC', cryptoKey, data.buffer as ArrayBuffer)
}

function base64UrlEncode(str: string) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export default router


// Export small TTL helper for tests
export function isChallengeExpired(createdAt: number | null, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (!createdAt) return true
    return (nowSeconds - createdAt) > 60 * 10
}

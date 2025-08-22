import { v4 as uuidv4 } from 'uuid'
// Do not statically import argon2-browser; dynamic import inside functions avoids triggering WASM load at module init
import { uint8ToBase64, base64ToUint8 } from './utils'
import { signJwt } from './jwt'

export async function deriveServerHash(clientHashB64: string, serverSaltB64: string) {
    // Deterministic HMAC-based transform: HMAC-SHA256(serverSalt, clientHash)
    const key = base64ToUint8(serverSaltB64)
    const msg = base64ToUint8(clientHashB64)
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msg)
    return uint8ToBase64(new Uint8Array(sig))
}

async function pbkdf2HashFromClientHash(clientHashB64: string, serverSaltB64: string) {
    // PBKDF2 fallback: derive 32 bytes using clientHash (raw bytes) as password and serverSalt as salt.
    const pwd = base64ToUint8(clientHashB64)
    const salt = base64ToUint8(serverSaltB64)
    const key = await crypto.subtle.importKey('raw', pwd, { name: 'PBKDF2' }, false, ['deriveBits'])
    // iterations chosen to be reasonably high for dev; adjust for production
    const iterations = 150000
    const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256)
    const u8 = new Uint8Array(derived)
    return uint8ToBase64(u8)
}

// Use PBKDF2-only server-side hashing derived from the client_hash to avoid pulling argon2 WASM into the Worker runtime.
// For Workers free-tier CPU constraints, use a single HMAC-SHA256 transform which is very fast
// and deterministic: HMAC(server_salt, client_hash) encoded as base64.
export async function hashClientToServer(clientHashB64: string, serverSaltB64: string) {
    return deriveServerHash(clientHashB64, serverSaltB64)
}

export async function registerUser(db: any, body: any) {
    if (!body || !body.username || !body.client_salt || !body.client_hash) {
        throw new Error('missing fields')
    }
    if (!db) throw new Error('db binding missing')
    const id = uuidv4()
    const serverSalt = crypto.getRandomValues(new Uint8Array(16))
    const serverSaltB64 = uint8ToBase64(serverSalt)
    let hashed
    // Use deriveServerHash to deterministically derive server-side hash from client_hash + server salt
    const serverHash = await deriveServerHash(body.client_hash, serverSaltB64)
    hashed = { hash: serverHash }
    const recoveryHash = body.recovery_hash || null
    const recoveryEncryptedKey = body.recovery_encrypted_key || null
    const insertUserStmt = db.prepare('INSERT INTO users (id, username, email, server_password_hash, server_salt, client_salt, recovery_hash, recovery_encrypted_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    await insertUserStmt.bind(id, body.username, body.email || null, hashed.hash, serverSaltB64, body.client_salt, recoveryHash, recoveryEncryptedKey).run()
    // create default Inbox folder
    const inboxId = uuidv4()
    const inboxName = body.inbox_name_encrypted || ''
    const insertInboxStmt = db.prepare('INSERT INTO folders (id, user_id, parent_id, name_encrypted, is_default) VALUES (?, ?, ?, ?, ?)')
    await insertInboxStmt.bind(inboxId, id, null, inboxName, 1).run()
    return { id, client_salt: body.client_salt, inbox_id: inboxId }
}

export async function createChallenge(db: any, username: string) {
    const userRes = await db.prepare('SELECT id, client_salt FROM users WHERE username = ?').bind(username).first()
    if (!userRes) throw new Error('unknown user')
    const nonceBytes = crypto.getRandomValues(new Uint8Array(24))
    const nonceB64 = uint8ToBase64(nonceBytes)
    const challengeId = uuidv4()
    const createdAt = Math.floor(Date.now() / 1000)
    await db.prepare('INSERT INTO auth_challenges (id, username, nonce, created_at) VALUES (?, ?, ?, ?)').bind(challengeId, username, nonceB64, createdAt).run()
    return { challenge_id: challengeId, nonce: nonceB64, client_salt: userRes.client_salt }
}

// Verify a challenge proof and issue a JWT token (service-level)
export async function verifyChallenge(db: any, env: any, params: { username: string, client_hash: string, proof: string, challenge_id: string }) {
    const { username, client_hash, proof, challenge_id } = params
    const challenge = await db.prepare('SELECT * FROM auth_challenges WHERE id = ?').bind(challenge_id).first()
    if (!challenge) throw new Error('invalid or expired challenge')
    if (challenge.username !== username) throw new Error('challenge mismatch')

    const userRes = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first()
    if (!userRes) throw new Error('invalid user')

    const serverHash = userRes.server_password_hash
    const serverSalt = userRes.server_salt
    let verify
    const expected = await deriveServerHash(client_hash, serverSalt)
    if (expected !== serverHash) throw new Error('invalid credentials')

    const clientHashBytes = base64ToUint8(client_hash)
    const nonceBytes = base64ToUint8(challenge.nonce)
    // Pass Uint8Array directly to SubtleCrypto in Node and browsers
    const cryptoKey = await crypto.subtle.importKey('raw', clientHashBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, nonceBytes)
    const expectedB64 = uint8ToBase64(new Uint8Array(sig))

    // enforce TTL
    const now = Math.floor(Date.now() / 1000)
    if (challenge.created_at && (now - challenge.created_at) > 60 * 10) {
        await db.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(challenge_id).run()
        throw new Error('challenge expired')
    }

    // cleanup
    await db.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(challenge_id).run()

    if (expectedB64 !== proof) throw new Error('invalid proof')

    const token = await signJwt({ sub: userRes.id, iat: Math.floor(Date.now() / 1000) }, env.JWT_SECRET || 'dev-secret', { expSeconds: 60 * 60 * 24 })
    return { token }
}

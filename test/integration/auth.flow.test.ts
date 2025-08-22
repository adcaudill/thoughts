import { describe, it, expect, vi } from 'vitest'
import { createMockD1 } from '../utils/mockD1'

// mock argon2-browser before importing router so the worker code uses the mock
vi.mock('argon2-browser', async () => {
    const mod = { hash: async ({ pass }: any) => ({ hash: pass }), ArgonType: { Argon2id: 2 } }
    return { default: mod }
})
import { registerUser, createChallenge, verifyChallenge } from '../../worker/lib/authService'

function base64ToUint8(b64: string) {
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return arr
}

function uint8ToBase64(u8: Uint8Array) {
    let s = ''
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
    return btoa(s)
}

async function hmacSha256Raw(keyBytes: Uint8Array, dataBytes: Uint8Array) {
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, dataBytes)
    return new Uint8Array(sig as ArrayBuffer)
}

describe('auth full flow', () => {
    it('register -> challenge -> verify issues token', async () => {
        const mockDb = createMockD1()
        const env = { DB: mockDb, JWT_SECRET: 'test-secret' }

        const clientHashB64 = btoa('client-hash-bytes') // simple base64 for test

        // register via service
        const reg = await registerUser(mockDb, { username: 'flowuser', client_salt: 's1', client_hash: clientHashB64, inbox_name_encrypted: 'inbox' })
        expect(reg.id).toBeTruthy()

        // create challenge via service
        const chal = await createChallenge(mockDb, 'flowuser')
        expect(chal.nonce).toBeTruthy()

        // compute proof = HMAC(clientHashBytes, nonceBytes)
        const keyBytes = base64ToUint8(clientHashB64)
        const nonceBytes = base64ToUint8(chal.nonce)
        const sig = await hmacSha256Raw(keyBytes, nonceBytes)
        const proofB64 = uint8ToBase64(sig)

        // verify via service
        const v = await verifyChallenge(mockDb, env, { username: 'flowuser', client_hash: clientHashB64, proof: proofB64, challenge_id: chal.challenge_id })
        expect(v.token).toBeTruthy()
    }, 10000)
})

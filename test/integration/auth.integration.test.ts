import { describe, it, expect, vi } from 'vitest'
import { createMockD1 } from '../utils/mockD1'

// mock argon2-browser before importing service so the worker code uses the mock
vi.mock('argon2-browser', async () => {
    const mod = { hash: async ({ pass }: any) => ({ hash: pass }), ArgonType: { Argon2id: 2 } }
    return { default: mod }
})
import { registerUser, createChallenge } from '../../worker/lib/authService'

function makeReq(body: any, env: any = {}) {
    return new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
}

describe('auth integration', () => {
    it('registers and creates a challenge via authService', async () => {
        const mockDb = createMockD1()
        // register directly via service
        const res = await registerUser(mockDb, { username: 'u1', client_salt: 's1', client_hash: 'h1', inbox_name_encrypted: 'inbox' })
        expect(res.id).toBeTruthy()
        // create challenge
        const chal = await createChallenge(mockDb, 'u1')
        expect(chal.challenge_id).toBeTruthy()
        expect(chal.nonce).toBeTruthy()
    }, 10000)
})

import { describe, it, expect } from 'vitest'
import { signJwt, verifyJwt } from '../worker/lib/jwt'

describe('JWT helpers', () => {
    it('signs and verifies a token', async () => {
        const key = 'test-key-123'
        const payload = { sub: 'user1', purpose: 'test' }
        const token = await signJwt(payload, key, { expSeconds: 60 })
        const decoded = await verifyJwt(token, key, 'test')
        expect(decoded.sub).toBe('user1')
        expect(decoded.purpose).toBe('test')
    })

    it('rejects token with wrong purpose', async () => {
        const key = 'k'
        const token = await signJwt({ sub: 'u', purpose: 'x' }, key, { expSeconds: 60 })
        await expect(() => verifyJwt(token, key, 'other')).rejects.toThrow()
    })
})

import { describe, it, expect } from 'vitest'
import authRouter from '../../worker/routes/auth'

describe('auth router harness', () => {
    it('handles /api/auth/ping with fake env', async () => {
        const fakeEnv = { DB: { prepare: () => ({ all: async () => [] }), exec: async () => ({ success: true }) }, JWT_SECRET: 'x' }
        const req = new Request('https://example.com/api/auth/ping')
            ; (req as any).env = fakeEnv
        const res = typeof (authRouter as any).fetch === 'function' ? await (authRouter as any).fetch(req) : await (authRouter as any).handle(req)
        expect(res).toBeTruthy()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.ok).toBe(true)
    })
})

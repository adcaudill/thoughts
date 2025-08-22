import { describe, it, expect } from 'vitest'
import worker from '../../worker/index'

describe('worker index routing', () => {
    it('responds to /api/auth/ping', async () => {
        const req = new Request('http://localhost/api/auth/ping')
        const res = await (worker as any).fetch(req, { DB: {}, JWT_SECRET: 'x' })
        const body = await res.json()
        expect(res.status).toBe(200)
        expect(body.ok).toBe(true)
    })
})

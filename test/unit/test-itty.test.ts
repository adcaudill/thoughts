import { describe, it, expect } from 'vitest'
import { Router } from 'itty-router'

describe('itty-router basic', () => {
    it('registers route and responds to ping', async () => {
        const router = Router()
        router.get('/api/auth/ping', () => new Response(JSON.stringify({ ok: true, pong: true }), { status: 200 }))

        const req = new Request('https://example.com/api/auth/ping')
        // prefer fetch if available
        const res = typeof (router as any).fetch === 'function' ? await (router as any).fetch(req) : await (router as any).handle(req)
        expect(res).toBeTruthy()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.ok).toBe(true)
    })
})

import { Router } from 'itty-router'

const router = Router()
console.log('creating router and registering GET /api/auth/ping')
router.get('/api/auth/ping', request => {
    console.log('itty router: handler invoked')
    return new Response(JSON.stringify({ ok: true, pong: true }), { status: 200 })
})

async function run() {
    const req = new Request('https://example.com/api/auth/ping', { method: 'GET' })
    console.log('router internal routes:', router.routes)
    console.log('router keys:', Object.getOwnPropertyNames(router))
    console.log('typeof router.fetch', typeof router.fetch, 'typeof router.handle', typeof router.handle)
    console.log('calling router.handle')
    try {
        const res = await router.handle(req)
        if (!res) {
            console.log('router.handle returned null/undefined')
        } else {
            console.log('router.handle returned', res && res.status)
            try { console.log('body:', await res.text()) } catch (e) { console.log('body read failed', e) }
        }
    } catch (err) {
        console.error('router.handle threw', err)
    }
}

run()

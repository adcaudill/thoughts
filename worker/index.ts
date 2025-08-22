import authRouter from './routes/auth'
import dataRouter from './routes/data'
import { verifyJwt } from './lib/jwt'

export interface Env {
    DB?: any
}

export default {
    async fetch(request: Request, env: Env) {
        try {
            const url = new URL(request.url)

            // lightweight diag endpoint that avoids routers
            if (url.pathname === '/__diag') {
                return new Response(JSON.stringify({ ok: true, pid: typeof process !== 'undefined' ? (process.pid || null) : null }), { status: 200 })
            }

            // In local development, if the request is to the worker root, forward to the frontend dev server
            // Check Host header and URL to avoid redirecting in production.
            // attach env for routers
            ; (request as any).env = env

            // Helper to create a safe forwarded Request by consuming the body once (avoids unconsumed ReadableStream branches)
            const makeForwardedRequest = async (req: Request) => {
                const headers = new Headers(req.headers)
                let bodyBuf: ArrayBuffer | undefined
                try { bodyBuf = await req.arrayBuffer() } catch { bodyBuf = undefined }
                const init: RequestInit = { method: req.method, headers }
                if (bodyBuf && bodyBuf.byteLength) (init as any).body = bodyBuf
                const f = new Request(req.url, init)
                    ; (f as any).env = (req as any).env
                return f
            }

            // Expose a dev-only debug endpoint to inspect cookies and JWT payloads when
            // running on localhost. This helps diagnose why the browser may not be
            // sending the HttpOnly cookie or why the server rejects it.
            if (url.pathname === '/__debug/cookie') {
                const hostHeader = request.headers.get('host') || ''
                const isLocalHost = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1') || hostHeader.includes(':8787')
                if (!isLocalHost) return new Response('not available', { status: 404 })
                const cookieHeader = request.headers.get('cookie') || ''
                const m = cookieHeader.match(/(?:^|; )thoughts_auth=([^;]+)/)
                const token = m ? decodeURIComponent(m[1]) : null
                let payload = null
                let errMsg = null
                if (token) {
                    try {
                        // verifyJwt will throw if invalid or expired
                        payload = await verifyJwt(token, (env as any).JWT_SECRET || 'dev-secret')
                    } catch (e: any) {
                        errMsg = e && e.message ? e.message : String(e)
                    }
                }
                return new Response(JSON.stringify({ cookie: cookieHeader, tokenPresent: !!token, payload, error: errMsg }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }

            // In local development, proxy non-API requests to the frontend dev server so
            // the page is served from the worker origin. This ensures the worker can set
            // HttpOnly cookies that the browser will include on subsequent API requests
            // (avoids cross-origin cookie issues caused by redirects).
            if (!url.pathname.startsWith('/api')) {
                const hostHeader = request.headers.get('host') || ''
                const isLocalHost = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1') || hostHeader.includes(':8787')
                if (isLocalHost) {
                    try {
                        // Forward the request to the Vite dev server and stream the response back.
                        const forwardUrl = `http://localhost:5173${url.pathname}${url.search}`
                        const fReq = await makeForwardedRequest(request)
                        // override the URL to point to the dev server
                        const forwarded = new Request(forwardUrl, { method: fReq.method, headers: fReq.headers, body: fReq.body })
                        const resp = await fetch(forwarded)
                        // Return the dev server response directly so the page stays under the
                        // worker origin (cookies set by worker will be sent by the browser).
                        return resp
                    } catch (err) {
                        // If the dev server is not available, fall through to the placeholder
                        // so the worker still responds.
                        console.warn('frontend proxy failed, falling back to worker placeholder', err)
                    }
                }
            }

            // Forward auth routes to authRouter
            if (url.pathname.startsWith('/api/auth')) {
                try {
                    const fReq = await makeForwardedRequest(request)
                    // prefer fetch if available
                    if (typeof (authRouter as any).fetch === 'function') {
                        const r = await (authRouter as any).fetch(fReq)
                        if (r) return r
                    } else if (typeof (authRouter as any).handle === 'function') {
                        const r = await (authRouter as any).handle.call(authRouter, fReq as any)
                        if (r) return r
                    }
                } catch (e) {
                    return new Response(JSON.stringify({ ok: false, error: 'internal' }), { status: 500 })
                }
            }

            // Forward data routes to dataRouter
            if (url.pathname.startsWith('/api/folders') || url.pathname.startsWith('/api/notes') || url.pathname.startsWith('/api/data')) {
                try {
                    const fReq = await makeForwardedRequest(request)
                    if (typeof (dataRouter as any).fetch === 'function') {
                        const r = await (dataRouter as any).fetch(fReq)
                        if (r) return r
                    } else if (typeof (dataRouter as any).handle === 'function') {
                        const r = await (dataRouter as any).handle.call(dataRouter, fReq as any)
                        if (r) return r
                    }
                } catch (e) {
                    return new Response(JSON.stringify({ ok: false, error: 'internal' }), { status: 500 })
                }
            }

            return new Response('Thoughts worker placeholder')
        } catch (err: any) {
            console.error('index: unexpected error in fetch', err && (err.stack || err.message || err))
            return new Response(JSON.stringify({ ok: false, error: 'worker_error', _debug: String(err && (err.stack || err.message)) }), { status: 500 })
        }
    }
}

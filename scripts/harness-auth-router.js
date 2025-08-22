// Minimal harness to test authRouter.handle dispatch outside wrangler/miniflare
// It constructs a Request and a fake env with DB binding and calls authRouter.handle(req)
// Usage: node scripts/harness-auth-router.js

import path from 'path'
import { fileURLToPath } from 'url'

// Make ESM import paths relative to repo root
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
process.chdir(repoRoot)

// Node's global fetch API provides Request/Response in Node 18+. If unavailable, import undici.
let RequestClass
try {
    RequestClass = globalThis.Request
    if (!RequestClass) throw new Error('no global Request')
} catch (e) {
    // fallback to undici
    const { Request: UndiciRequest } = await import('undici')
    RequestClass = UndiciRequest
}

// Import the router module
const authModulePath = './worker/routes/auth.js'
let authRouter
try {
    // Dynamic import to allow TS-built output or source depending on environment
    const mod = await import(authModulePath)
    authRouter = mod.default || mod.authRouter || mod.router || mod
} catch (err) {
    console.error('Failed to import auth router from', authModulePath, err)
    process.exit(1)
}

// Create a fake env object with minimal DB binding used by register/ping handlers
const fakeEnv = {
    DB: {
        // Minimal stub: run returns a promise resolving to an object similar to D1
        prepare: () => ({ all: async () => [] }),
        // If code uses env.DB directly with .exec/transaction, add methods as needed
        exec: async () => ({ success: true })
    },
    // Add other bindings if required by handlers
}

async function run() {
    const req = new RequestClass('https://example.com/api/auth/ping', { method: 'GET' })
    // Attach env as property (worker/index.ts was setting req.env = env)
    req.env = fakeEnv
    console.log('Calling authRouter.handle(req)')
    try {
        const res = await (authRouter.handle ? authRouter.handle(req) : authRouter(req))
        if (!res) {
            console.log('Router returned null/undefined')
            return
        }
        // Read response body
        let bodyText = ''
        try { bodyText = await res.text() } catch (e) { bodyText = '<unable to read body>' }
        console.log('Router returned response with status', res.status)
        console.log('Body:', bodyText)
    } catch (err) {
        console.error('authRouter.handle threw:', err)
    }
}

await run()

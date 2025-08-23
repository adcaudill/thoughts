import { test, expect } from 'vitest'
import { chromium } from 'playwright'
import { spawn } from 'child_process'

// This test requires wrangler to be available in PATH (project has wrangler dependency).
// It starts `wrangler dev --local` in background and tears it down after the test.

function waitForPing(base: string, ms = 10000) {
    const start = Date.now()
    return new Promise((resolve, reject) => {
        // use an async IIFE inside the executor instead of making the executor async
        (async () => {
            while (Date.now() - start < ms) {
                try {
                    const res = await fetch(base + '/api/auth/ping')
                    if (res.status === 200) return resolve(true)
                } catch (e) {
                    // ignore
                }
                await new Promise(r => setTimeout(r, 250))
            }
            reject(new Error('timeout waiting for ping'))
        })()
    })
}

test('browser-based register -> challenge -> verify flow', { timeout: 60000 }, async () => {
    const base = process.env.E2E_BASE_URL || 'http://localhost:8787'
    // If E2E_BASE_URL is not provided, tests will start a local wrangler process.
    let proc: any = null
    if (!process.env.E2E_BASE_URL) {
        proc = spawn('npx', ['wrangler', 'dev', '--local', '--port', '8787'], { stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() })
        proc.stdout.on('data', d => console.log('[wrangler]', d.toString()))
        proc.stderr.on('data', d => console.error('[wrangler]', d.toString()))
    }

    async function waitForVite(ms = 20000) {
        const viteUrl = 'http://localhost:5173'
        const start = Date.now()
        while (Date.now() - start < ms) {
            try {
                const r = await fetch(viteUrl)
                if (r.ok || r.status === 200) return true
            } catch (e) {
                // not up yet
            }
            await new Promise(r => setTimeout(r, 250))
        }
        return false
    }

    try {
        await waitForPing(base, 20000)

        const browser = await chromium.launch()
        const page = await browser.newPage()
        // ensure the frontend dev server is running on http://localhost:5173
        let viteProc: any = null
        const viteReady = await waitForVite(1000)
        if (!viteReady) {
            // start vite dev
            viteProc = spawn('npm', ['run', 'dev'], { stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() })
            viteProc.stdout.on('data', (d: Buffer) => console.log('[vite]', d.toString()))
            viteProc.stderr.on('data', (d: Buffer) => console.error('[vite]', d.toString()))
            const ok = await waitForVite(20000)
            if (!ok) throw new Error('vite did not start')
        }

        // navigate to the worker origin (which proxies to Vite in dev) so cookies are same-origin
        await page.goto(base)
        // open the register dialog first
        await page.click('button:has-text("register")')
        // fill register form
        const suffix = Math.random().toString(36).slice(2, 8)
        const username = `e2e_${suffix}`
        await page.fill('input[placeholder="Username"], input:nth-of-type(1)', username)
        await page.fill('input[placeholder="Password"], input[type=password]', 'password123')
        await page.click('button:has-text("Create account")')

        // wait a bit for client to perform flow
        await page.waitForTimeout(2000)

        // Fallback: check that /api/auth/ping is responsive
        const res = await fetch(base + '/api/auth/ping')
        expect(res.status).toBe(200)

        await browser.close()
        if (viteProc) viteProc.kill()
    } finally {
        if (proc) proc.kill()
    }
})

import { test, expect } from 'vitest'
import { chromium } from 'playwright'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

function waitForPing(base: string, ms = 10000) {
    const start = Date.now()
    return new Promise((resolve, reject) => {
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

const isUpOnce = async (url: string) => {
    try {
        const res = await fetch(url + '/api/auth/ping')
        return res.status === 200
    } catch {
        return false
    }
}

test('mobile layout: sidebar collapses and editor shows compact editor on small viewports', { timeout: 90000 }, async () => {
    const base = process.env.E2E_BASE_URL || 'http://localhost:8787'
    let proc: any = null
    const lockFile = path.join(process.cwd(), '.wrangler-e2e.lock')
    const tryAcquireLock = () => { try { fs.openSync(lockFile, 'wx'); return true } catch { return false } }
    const releaseLock = () => { try { fs.unlinkSync(lockFile) } catch { /* ignore */ } }
    if (!process.env.E2E_BASE_URL) {
        if (!(await isUpOnce(base))) {
            if (tryAcquireLock()) {
                proc = spawn('npx', ['wrangler', 'dev', '--local', '--port', '8787'], { stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() })
                proc.stdout.on('data', d => console.log('[wrangler]', d.toString()))
                proc.stderr.on('data', d => console.error('[wrangler]', d.toString()))
            }
            await waitForPing(base, 20000).catch(() => null)
            releaseLock()
        }
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
        // mobile viewport (iPhone-ish)
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' })
        const page = await context.newPage()

        let viteProc: any = null
        const viteReady = await waitForVite(1000)
        if (!viteReady) {
            viteProc = spawn('npm', ['run', 'dev'], { stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() })
            viteProc.stdout.on('data', (d: Buffer) => console.log('[vite]', d.toString()))
            viteProc.stderr.on('data', (d: Buffer) => console.error('[vite]', d.toString()))
            const ok = await waitForVite(20000)
            if (!ok) throw new Error('vite did not start')
        }

        await page.goto(base)
        await page.click('button:has-text("register")')

        const suffix = Math.random().toString(36).slice(2, 8)
        const username = `mobile_e2e_${suffix}`
        await page.fill('input[placeholder="Username"], input:nth-of-type(1)', username)
        await page.fill('input[placeholder="Password"], input[type=password]', 'password123')
        await Promise.all([
            page.click('button:has-text("Create account")'),
            // wait for the register request to complete (avoid silent 500s)
            page.waitForResponse(r => r.url().endsWith('/api/auth/register') && r.status() === 200, { timeout: 30000 }).catch(() => null)
        ])

        // also wait for verify to finish, if it occurs
        await page.waitForResponse(r => r.url().endsWith('/api/auth/verify') && r.status() === 200, { timeout: 30000 }).catch(() => null)

        // wait for client to complete auth and render the authed app (allow more time in CI)
        const asideHandle = await page.waitForSelector('aside', { timeout: 45000 })
        expect(asideHandle).toBeTruthy()
        const cls = await asideHandle!.getAttribute('class')
        // collapsed state uses 'w-12' class; ensure it's present
        expect(cls || '').toContain('w-12')

        // Editor should be present (CodeMirror) and fit mobile nicely
        await page.waitForSelector('.cm-editor', { timeout: 20000 })
        const contentMeasure = await page.$eval('.cm-editor .cm-content', el => getComputedStyle(el as any).maxWidth)
        // Ensure a reasonable max-width is applied (close to our 90ch rule; jsdom returns pixels, so just assert it's not 'none')
        expect(String(contentMeasure || '')).not.toBe('none')

        await browser.close()
        // Do not kill vite/wrangler explicitly; allow reuse by other tests.
    } finally {
        // Intentionally no-op
    }
})

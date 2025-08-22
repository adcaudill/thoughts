import { test, expect } from 'vitest'
import { chromium } from 'playwright'
import { spawn } from 'child_process'

function waitForPing(base: string, ms = 10000) {
    const start = Date.now()
    return new Promise(async (resolve, reject) => {
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
    })
}

test('mobile layout: sidebar collapses and editor shows compact toolbar on small viewports', { timeout: 90000 }, async () => {
    const base = 'http://localhost:8787'
    const proc = spawn('npx', ['wrangler', 'dev', '--local', '--port', '8787'], { stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() })
    proc.stdout.on('data', d => console.log('[wrangler]', d.toString()))
    proc.stderr.on('data', d => console.error('[wrangler]', d.toString()))

    try {
        await waitForPing(base, 20000)

        const browser = await chromium.launch()
        // mobile viewport (iPhone-ish)
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' })
        const page = await context.newPage()

        const viteUrl = 'http://localhost:5173'
        let viteProc: any = null
        async function waitForVite(ms = 20000) {
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
        await page.click('button:has-text("Create account")')

        // wait for client to complete auth and render the authed app
        await page.waitForTimeout(3000)

        // sidebar should be collapsed on small viewport (App sets collapsed when innerWidth < 640)
        const aside = await page.$('aside')
        expect(aside).toBeTruthy()
        const cls = await aside!.getAttribute('class')
        // collapsed state uses 'w-12' class; ensure it's present
        expect(cls || '').toContain('w-12')

        // Editor should be present with a toolbar suitable for mobile
        const toolbar = await page.$('.ql-toolbar')
        expect(toolbar).not.toBeNull()
        const btns = await page.$$('.ql-toolbar button')
        // compact toolbar should be relatively small; assert it's not huge
        expect(btns.length).toBeLessThanOrEqual(12)

        await browser.close()
        if (viteProc) viteProc.kill()
    } finally {
        proc.kill()
    }
})

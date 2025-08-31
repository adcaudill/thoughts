import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/tailwind.css'
import { setupOnlineSync } from './lib/sync'
import { getNoteKey } from './lib/session'
import { loadIndex, buildIndexFromNotes } from './lib/search'

createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)

// Register service worker in production
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            // Send a list of app shell URLs to precache. We include index.html and detected module assets.
            const urls = new Set<string>()
            urls.add('/')
            urls.add('/index.html')
            try {
                // Collect from existing <link rel="modulepreload"> and current script tags
                const links = Array.from(document.querySelectorAll('link[rel="modulepreload"], link[rel="stylesheet"]')) as HTMLLinkElement[]
                for (const l of links) if (l.href) urls.add(new URL(l.href).pathname)
                const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[]
                for (const s of scripts) if (s.src) urls.add(new URL(s.src).pathname)
                const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')) as HTMLLinkElement[]
                for (const st of styles) if (st.href) urls.add(new URL(st.href).pathname)
            } catch { /* ignore */ }
            const list = Array.from(urls)
            if (reg.active) reg.active.postMessage({ type: 'PRECACHE_URLS', urls: list })
            else reg.addEventListener('updatefound', () => {
                const sw = reg.installing || reg.waiting
                if (sw) sw.addEventListener('statechange', () => { if (sw.state === 'activated') sw.postMessage({ type: 'PRECACHE_URLS', urls: list }) })
            })
        }).catch(() => { /* no-op */ })
    })
}

// Basic online/offline listeners to trigger future sync
window.addEventListener('online', () => {
    try { window.dispatchEvent(new Event('app-online')) } catch { }
})

// Initialize background sync
try { setupOnlineSync() } catch { }

// Initialize search index (lazy build)
; (async () => {
    try {
        const key = getNoteKey()
        if (!key) return
        await loadIndex(key)
        const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void) => void)
        const schedule = ric ? ric : ((cb: () => void) => setTimeout(cb, 0))
        schedule(() => { buildIndexFromNotes(key).catch(() => { }) })
    } catch { }
})()

/* eslint-disable no-restricted-globals */
const VERSION = 'v2'
const STATIC_CACHE = `thoughts-static-${VERSION}`
const ASSETS = [
    '/',
]
// Third-party assets to warm (opaque allowed). Keep this list short.
const WARM_URLS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Merriweather:wght@400;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.0/css/all.min.css',
]

self.addEventListener('install', (event) => {
    self.skipWaiting()
    event.waitUntil(
        (async () => {
            const cache = await caches.open(STATIC_CACHE)
            try { await cache.addAll(ASSETS) } catch { /* ignore */ }
            // Warm third-party URLs
            await Promise.all(WARM_URLS.map(async (u) => {
                try { const res = await fetch(u, { mode: 'no-cors' }); await cache.put(u, res) } catch { }
            }))
        })()
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter(k => !k.includes(VERSION)).map(k => caches.delete(k))))
    )
    self.clients.claim()
})

// Basic navigation fallback to cache
self.addEventListener('fetch', (event) => {
    const req = event.request
    const url = new URL(req.url)
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).catch(() => caches.match('/'))
        )
        return
    }
    // Static assets: try cache first
    if (req.destination === 'style' || req.destination === 'script' || req.destination === 'image' || req.destination === 'font') {
        event.respondWith(
            caches.match(req).then((cached) => cached || fetch(req).then((res) => {
                const copy = res.clone()
                caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy)).catch(() => { })
                return res
            }).catch(() => cached))
        )
    }
})

// Allow app to push a list of URLs to precache (built assets discovered at runtime)
self.addEventListener('message', (event) => {
    const data = event.data
    if (data && data.type === 'PRECACHE_URLS' && Array.isArray(data.urls)) {
        event.waitUntil((async () => {
            const cache = await caches.open(STATIC_CACHE)
            await Promise.all(data.urls.map(async (u) => {
                try {
                    const res = await fetch(u, { cache: 'no-cache' })
                    if (res && res.ok) await cache.put(u, res)
                } catch { }
            }))
        })())
    }
})

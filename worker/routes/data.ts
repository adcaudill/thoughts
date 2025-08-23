import { Router } from 'itty-router'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

async function readJson(req: Request) {
    try {
        return await req.json()
    } catch {
        return null
    }
}

// base64ToUint8 helper intentionally removed to avoid duplication; use atob/Uint8Array wherever needed

function uint8ToBase64(u8: Uint8Array) {
    let s = ''
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
    return btoa(s)
}

async function verifyJwtAndGetSub(request: Request, env: any) {
    // Accept token from Authorization header OR from the HttpOnly cookie `thoughts_auth`
    let token: string | null = null
    const auth = request.headers.get('Authorization') || ''
    const m = auth.match(/^Bearer\s+(.+)$/)
    if (m) {
        token = m[1]
    } else {
        const cookieHeader = request.headers.get('cookie') || ''
        const c = cookieHeader.match(/(?:^|; )thoughts_auth=([^;]+)/)
        if (c) token = decodeURIComponent(c[1])
    }
    if (!token) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, signatureB64] = parts
    const toSign = `${headerB64}.${payloadB64}`
    const key = env.JWT_SECRET || 'dev-secret'
    const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(toSign))
    const expected = uint8ToBase64(new Uint8Array(sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    if (expected !== signatureB64) return null
    try {
        const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
        const payload = JSON.parse(payloadJson)
        const now = Math.floor(Date.now() / 1000)
        if (payload.exp && now > payload.exp) return null
        return payload.sub
    } catch {
        return null
    }
}

// Folders
router.get('/api/folders', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })

    const res = await db.prepare('SELECT id, parent_id, name_encrypted, is_default, "order", created_at FROM folders WHERE user_id = ? ORDER BY "order" ASC').bind(userId).all()
    return new Response(JSON.stringify({ ok: true, folders: res.results || [] }), { status: 200 })
})

router.post('/api/folders', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })

    const body = await readJson(request)
    if (!body || !body.name_encrypted) return new Response(JSON.stringify({ ok: false, error: 'missing fields' }), { status: 400 })

    const id = uuidv4()
    await db.prepare('INSERT INTO folders (id, user_id, parent_id, name_encrypted, is_default, "order") VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, userId, body.parent_id || null, body.name_encrypted, body.is_default ? 1 : 0, body.order || 0)
        .run()

    return new Response(JSON.stringify({ ok: true, id }), { status: 201 })
})

router.patch('/api/folders/:id', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const { id } = request.params as any
    const body = await readJson(request)
    if (!body) return new Response(JSON.stringify({ ok: false, error: 'missing body' }), { status: 400 })

    // ensure folder belongs to user
    const f = await db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').bind(id, userId).first()
    if (!f) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 })

    const updates: string[] = []
    const values: any[] = []
    if (body.name_encrypted !== undefined) { updates.push('name_encrypted = ?'); values.push(body.name_encrypted) }
    if (body.parent_id !== undefined) { updates.push('parent_id = ?'); values.push(body.parent_id) }
    if (body.order !== undefined) { updates.push('"order" = ?'); values.push(body.order) }

    if (updates.length === 0) return new Response(JSON.stringify({ ok: false, error: 'nothing to update' }), { status: 400 })

    values.push(id)
    await db.prepare(`UPDATE folders SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
})

router.delete('/api/folders/:id', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const { id } = request.params as any

    const f = await db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').bind(id, userId).first()
    if (!f) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 })
    if (f.is_default === 1) return new Response(JSON.stringify({ ok: false, error: 'cannot delete default folder' }), { status: 400 })

    // move notes to Inbox (default folder)
    const inbox = await db.prepare('SELECT id FROM folders WHERE user_id = ? AND is_default = 1').bind(userId).first()
    const inboxId = inbox ? inbox.id : null
    if (inboxId) {
        await db.prepare('UPDATE notes SET folder_id = ? WHERE folder_id = ?').bind(inboxId, id).run()
    }

    await db.prepare('DELETE FROM folders WHERE id = ?').bind(id).run()
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
})

// Notes
router.get('/api/notes', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const url = new URL(request.url)
    const folderId = url.searchParams.get('folderId')
    let res
    if (folderId) {
        res = await db.prepare('SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at FROM notes WHERE user_id = ? AND folder_id = ?').bind(userId, folderId).all()
    } else {
        res = await db.prepare('SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at FROM notes WHERE user_id = ?').bind(userId).all()
    }
    return new Response(JSON.stringify({ ok: true, notes: res.results || [] }), { status: 200 })
})

router.get('/api/notes/:id', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const { id } = request.params as any
    const note = await db.prepare('SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).first()
    if (!note) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 })
    return new Response(JSON.stringify({ ok: true, note }), { status: 200 })
})

router.post('/api/notes', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const body = await readJson(request)
    if (!body || !body.content_encrypted) return new Response(JSON.stringify({ ok: false, error: 'missing fields' }), { status: 400 })
    // Ensure folder_id is set; default to the user's Inbox (is_default = 1). Create Inbox if missing.
    let folderId = body.folder_id
    if (!folderId) {
        const inbox = await db.prepare('SELECT id FROM folders WHERE user_id = ? AND is_default = 1').bind(userId).first()
        if (inbox && inbox.id) {
            folderId = inbox.id
        } else {
            // create an inbox for the user
            const inboxId = uuidv4()
            const inboxName = ''
            await db.prepare('INSERT INTO folders (id, user_id, parent_id, name_encrypted, is_default) VALUES (?, ?, ?, ?, ?)')
                .bind(inboxId, userId, null, inboxName, 1).run()
            folderId = inboxId
        }
    }

    const id = uuidv4()
    const now = new Date().toISOString()
    try {
        await db.prepare('INSERT INTO notes (id, user_id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(id, userId, folderId, body.title_encrypted || null, body.content_encrypted, body.nonce || null, now, now)
            .run()
    } catch (err: any) {
        // Return a controlled error instead of letting the exception bubble as a 500
        return new Response(JSON.stringify({ ok: false, error: 'internal' }), { status: 500 })
    }
    return new Response(JSON.stringify({ ok: true, id }), { status: 201 })
})

router.patch('/api/notes/:id', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const { id } = request.params as any
    const body = await readJson(request)
    if (!body) return new Response(JSON.stringify({ ok: false, error: 'missing body' }), { status: 400 })
    const note = await db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).first()
    if (!note) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 })

    const updates: string[] = []
    const values: any[] = []
    if (body.title_encrypted !== undefined) { updates.push('title_encrypted = ?'); values.push(body.title_encrypted) }
    if (body.content_encrypted !== undefined) { updates.push('content_encrypted = ?'); values.push(body.content_encrypted) }
    if (body.nonce !== undefined) { updates.push('nonce = ?'); values.push(body.nonce) }
    if (body.folder_id !== undefined) { updates.push('folder_id = ?'); values.push(body.folder_id) }

    if (updates.length === 0) return new Response(JSON.stringify({ ok: false, error: 'nothing to update' }), { status: 400 })
    values.push(new Date().toISOString())
    updates.push('updated_at = ?')
    values.push(id)
    await db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
})

router.delete('/api/notes/:id', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const { id } = request.params as any
    const note = await db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).first()
    if (!note) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 })
    await db.prepare('DELETE FROM notes WHERE id = ?').bind(id).run()
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
})

export default router

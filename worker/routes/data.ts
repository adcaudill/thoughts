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

    const res = await db.prepare('SELECT id, parent_id, name_encrypted, is_default, "order", created_at, goal_word_count, created_at as updated_at FROM folders WHERE user_id = ? ORDER BY "order" ASC').bind(userId).all()
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
    await db.prepare('INSERT INTO folders (id, user_id, parent_id, name_encrypted, is_default, "order", goal_word_count) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, userId, body.parent_id || null, body.name_encrypted, body.is_default ? 1 : 0, body.order || 0, body.goal_word_count ?? null)
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
    if (body.goal_word_count !== undefined) { updates.push('goal_word_count = ?'); values.push(body.goal_word_count) }

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

    // Reparent any child folders to root (null parent)
    await db.prepare('UPDATE folders SET parent_id = NULL WHERE parent_id = ? AND user_id = ?').bind(id, userId).run()
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
    const trashed = url.searchParams.get('trashed') === '1' || url.searchParams.get('trashed') === 'true'
    let res
    if (folderId) {
        if (trashed) {
            res = await db.prepare('SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count, deleted_at FROM notes WHERE user_id = ? AND folder_id = ? AND deleted_at IS NOT NULL').bind(userId, folderId).all()
        } else {
            res = await db.prepare('SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count, deleted_at FROM notes WHERE user_id = ? AND folder_id = ? AND deleted_at IS NULL').bind(userId, folderId).all()
        }
    } else {
        if (trashed) {
            res = await db.prepare('SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count, deleted_at FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL').bind(userId).all()
        } else {
            res = await db.prepare('SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count, deleted_at FROM notes WHERE user_id = ? AND deleted_at IS NULL').bind(userId).all()
        }
    }
    return new Response(JSON.stringify({ ok: true, notes: res.results || [] }), { status: 200 })
})

router.get('/api/notes/:id', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const { id } = request.params as any
    const note = await db.prepare('SELECT id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count, deleted_at FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).first()
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

    const id = (body && body.id) ? String(body.id) : uuidv4()
    const now = new Date().toISOString()
    try {
        await db.prepare('INSERT INTO notes (id, user_id, folder_id, title_encrypted, content_encrypted, nonce, created_at, updated_at, word_count, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)')
            .bind(id, userId, folderId, body.title_encrypted || null, body.content_encrypted, body.nonce || null, now, now, body.word_count ?? 0)
            .run()
    } catch {
        // If note already exists (e.g., duplicate create), return ok with the same id
        const existing = await db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).first()
        if (existing) {
            return new Response(JSON.stringify({ ok: true, id }), { status: 200 })
        }
        // Otherwise return a controlled error
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
    const contentChanging = body.content_encrypted !== undefined || body.nonce !== undefined
    if (body.content_encrypted !== undefined) { updates.push('content_encrypted = ?'); values.push(body.content_encrypted) }
    if (body.nonce !== undefined) { updates.push('nonce = ?'); values.push(body.nonce) }
    if (body.folder_id !== undefined) { updates.push('folder_id = ?'); values.push(body.folder_id) }
    if (body.word_count !== undefined) { updates.push('word_count = ?'); values.push(body.word_count) }

    if (updates.length === 0) return new Response(JSON.stringify({ ok: false, error: 'nothing to update' }), { status: 400 })
    const updatedAt = new Date().toISOString()
    values.push(updatedAt)
    updates.push('updated_at = ?')
    values.push(id)
    // If content changes, create a version snapshot first (with new ciphertext)
    if (contentChanging && (body.content_encrypted || body.nonce)) {
        try {
            await db.prepare('INSERT INTO note_versions (id, user_id, note_id, content_encrypted, nonce, title_encrypted, word_count, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                .bind(uuidv4(), userId, id, body.content_encrypted || null, body.nonce || null, body.title_encrypted || null, body.word_count ?? null, body.reason || 'autosave')
                .run()
        } catch { /* ignore version insert errors */ }
    }
    await db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
    return new Response(JSON.stringify({ ok: true, updated_at: updatedAt }), { status: 200 })
})

router.delete('/api/notes/:id', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const { id } = request.params as any
    const url = new URL(request.url)
    const purge = url.searchParams.get('purge') === '1' || url.searchParams.get('purge') === 'true'
    const note = await db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).first()
    if (!note) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 })
    if (purge) {
        try { await db.prepare('DELETE FROM note_versions WHERE note_id = ?').bind(id).run() } catch { /* ignore if table missing */ }
        await db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).run()
        return new Response(JSON.stringify({ ok: true, purged: true }), { status: 200 })
    }
    await db.prepare('UPDATE notes SET deleted_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run()
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
})

// Restore a soft-deleted note
router.patch('/api/notes/:id/restore', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const { id } = request.params as any
    const note = await db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).first()
    if (!note) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 })
    await db.prepare('UPDATE notes SET deleted_at = NULL WHERE id = ?').bind(id).run()
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
})

// Versions list
router.get('/api/notes/:id/versions', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const { id } = request.params as any
    // ensure note belongs to user
    const note = await db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).first()
    if (!note) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 })
    const res = await db.prepare('SELECT id, created_at, word_count, reason FROM note_versions WHERE note_id = ? ORDER BY created_at DESC').bind(id).all()
    return new Response(JSON.stringify({ ok: true, versions: res.results || [] }), { status: 200 })
})

// Get a specific version content
router.get('/api/notes/:id/versions/:versionId', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const { id, versionId } = request.params as any
    // join to validate ownership
    const row = await db.prepare('SELECT v.id, v.content_encrypted, v.nonce, v.title_encrypted, v.word_count, v.created_at FROM note_versions v JOIN notes n ON n.id = v.note_id WHERE v.id = ? AND v.note_id = ? AND n.user_id = ?').bind(versionId, id, userId).first()
    if (!row) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 })
    return new Response(JSON.stringify({ ok: true, version: row }), { status: 200 })
})

// Restore a specific version (sets note content to version snapshot and creates a new version entry)
router.post('/api/notes/:id/restore-version', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const { id } = request.params as any
    const body = await readJson(request)
    const versionId = body && body.version_id
    if (!versionId) return new Response(JSON.stringify({ ok: false, error: 'missing version_id' }), { status: 400 })
    const v = await db.prepare('SELECT v.content_encrypted, v.nonce, v.title_encrypted, v.word_count FROM note_versions v JOIN notes n ON n.id = v.note_id WHERE v.id = ? AND v.note_id = ? AND n.user_id = ?').bind(versionId, id, userId).first()
    if (!v) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 })
    const now = new Date().toISOString()
    // Create a new version entry representing the restore point
    try {
        await db.prepare('INSERT INTO note_versions (id, user_id, note_id, content_encrypted, nonce, title_encrypted, word_count, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(uuidv4(), userId, id, v.content_encrypted, v.nonce, v.title_encrypted || null, v.word_count ?? null, 'restore')
            .run()
    } catch { }
    await db.prepare('UPDATE notes SET content_encrypted = ?, nonce = ?, title_encrypted = ?, word_count = ?, updated_at = ?, deleted_at = NULL WHERE id = ? AND user_id = ?')
        .bind(v.content_encrypted, v.nonce, v.title_encrypted || null, v.word_count ?? 0, now, id, userId)
        .run()
    return new Response(JSON.stringify({ ok: true, updated_at: now }), { status: 200 })
})

// User settings: stored as JSON string in users.settings
// Schema is validated server-side to avoid arbitrary data injection.
function validateSettings(obj: any) {
    if (!obj || typeof obj !== 'object') return { valid: false, error: 'invalid payload' }
    const allowedKeys = ['editorFont', 'showWordCount', 'showReadingTime', 'focusCurrentParagraph', 'styleIssues', 'typewriterScrolling', 'styleCheckOptions']
    const result: any = {}
    for (const k of Object.keys(obj)) {
        if (!allowedKeys.includes(k)) return { valid: false, error: `unknown setting '${k}'` }
    }
    if (obj.editorFont !== undefined) {
        if (typeof obj.editorFont !== 'string') return { valid: false, error: 'editorFont must be a string' }
        // normalize legacy values
        const legacyMap: Record<string, string> = {
            'monospace': 'mono:system',
            'serif': 'serif:georgia',
            'sans-serif': 'sans:system'
        }
        const normalized = legacyMap[obj.editorFont] || obj.editorFont
        // limit to a small whitelist to prevent abuse
        const fonts = [
            'mono:jetbrains', 'mono:ibm-plex', 'mono:system',
            'serif:source-serif', 'serif:merriweather', 'serif:georgia',
            'sans:inter', 'sans:system'
        ]
        if (!fonts.includes(normalized)) return { valid: false, error: 'invalid editorFont' }
        result.editorFont = normalized
    }
    if (obj.showWordCount !== undefined) {
        if (typeof obj.showWordCount !== 'boolean') return { valid: false, error: 'showWordCount must be boolean' }
        result.showWordCount = obj.showWordCount
    }
    if (obj.showReadingTime !== undefined) {
        if (typeof obj.showReadingTime !== 'boolean') return { valid: false, error: 'showReadingTime must be boolean' }
        result.showReadingTime = obj.showReadingTime
    }
    if (obj.focusCurrentParagraph !== undefined) {
        if (typeof obj.focusCurrentParagraph !== 'boolean') return { valid: false, error: 'focusCurrentParagraph must be boolean' }
        result.focusCurrentParagraph = obj.focusCurrentParagraph
    }
    if (obj.styleIssues !== undefined) {
        if (typeof obj.styleIssues !== 'boolean') return { valid: false, error: 'styleIssues must be boolean' }
        result.styleIssues = obj.styleIssues
    }
    if (obj.typewriterScrolling !== undefined) {
        if (typeof obj.typewriterScrolling !== 'boolean') return { valid: false, error: 'typewriterScrolling must be boolean' }
        result.typewriterScrolling = obj.typewriterScrolling
    }
    if (obj.styleCheckOptions !== undefined) {
        const o = obj.styleCheckOptions
        if (!o || typeof o !== 'object') return { valid: false, error: 'styleCheckOptions must be object' }
        const out: any = {}
        if (o.longSentenceWordLimit !== undefined) {
            const n = Number(o.longSentenceWordLimit)
            if (!Number.isFinite(n)) return { valid: false, error: 'longSentenceWordLimit must be number' }
            if (n < 5 || n > 200) return { valid: false, error: 'longSentenceWordLimit out of range' }
            out.longSentenceWordLimit = Math.round(n)
        }
        if (o.enabled !== undefined) {
            if (!o.enabled || typeof o.enabled !== 'object') return { valid: false, error: 'enabled must be object' }
            const allowedCats = ['weasel', 'redundancy', 'cliche', 'adverb', 'passive', 'longSentence', 'nominalization', 'expletive']
            const enabled: any = {}
            for (const k of Object.keys(o.enabled)) {
                if (!allowedCats.includes(k)) return { valid: false, error: `unknown category '${k}'` }
                if (typeof o.enabled[k] !== 'boolean') return { valid: false, error: `enabled.${k} must be boolean` }
                enabled[k] = o.enabled[k]
            }
            out.enabled = enabled
        }
        if (o.ignores !== undefined) {
            if (!Array.isArray(o.ignores)) return { valid: false, error: 'ignores must be array' }
            const clean: string[] = []
            for (const v of o.ignores) {
                if (typeof v !== 'string') return { valid: false, error: 'ignores must be strings' }
                const trimmed = v.trim()
                if (!trimmed) continue
                if (trimmed.length > 100) return { valid: false, error: 'ignore too long' }
                clean.push(trimmed)
            }
            out.ignores = clean
        }
        result.styleCheckOptions = out
    }
    return { valid: true, value: result }
}

router.get('/api/settings', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const row = await db.prepare('SELECT settings FROM users WHERE id = ?').bind(userId).first()
    if (!row) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 })
    let parsed = {}
    try {
        parsed = row.settings ? JSON.parse(row.settings) : {}
    } catch {
        parsed = {}
    }
    return new Response(JSON.stringify({ ok: true, settings: parsed }), { status: 200 })
})

router.patch('/api/settings', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const body = await readJson(request)
    if (!body) return new Response(JSON.stringify({ ok: false, error: 'missing body' }), { status: 400 })

    const valid = validateSettings(body)
    if (!valid.valid) return new Response(JSON.stringify({ ok: false, error: valid.error }), { status: 400 })

    // Merge with existing settings
    const row = await db.prepare('SELECT settings FROM users WHERE id = ?').bind(userId).first()
    let existing = {}
    try { existing = row && row.settings ? JSON.parse(row.settings) : {} } catch { existing = {} }
    const merged = { ...existing, ...valid.value }
    await db.prepare('UPDATE users SET settings = ? WHERE id = ?').bind(JSON.stringify(merged), userId).run()
    return new Response(JSON.stringify({ ok: true, settings: merged }), { status: 200 })
})

export default router

// Additional route: summarize total word counts per folder for the user
router.get('/api/folder-stats', async request => {
    const env = (request as any).env as any
    const db = env && env.DB
    const userId = await verifyJwtAndGetSub(request, env)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'unauth' }), { status: 401 })
    const res = await db.prepare(
        'SELECT folder_id as id, SUM(word_count) as total_words FROM notes WHERE user_id = ? AND deleted_at IS NULL GROUP BY folder_id'
    ).bind(userId).all()
    const results = (res.results || []).map((r: any) => ({ id: r.id, total_words: Number(r.total_words || 0) }))
    return new Response(JSON.stringify({ ok: true, stats: results }), { status: 200 })
})

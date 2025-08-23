export async function register(payload: { username: string; email?: string; client_salt: string; client_hash: string; recovery_hash?: string; recovery_encrypted_key?: string; inbox_name_encrypted?: string }) {
    const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
    })
    return res.json()
}

export async function login(payload: { username: string; client_hash: string }) {
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
    })
    return res.json()
}

export async function getFolders(_token?: string) {
    const res = await fetch('/api/folders', { credentials: 'same-origin' })
    return res.json()
}

export async function createFolder(payload: { parent_id?: string; name_encrypted: string; is_default?: boolean; order?: number }) {
    const res = await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' })
    return res.json()
}

export async function updateFolder(id: string, payload: { name_encrypted?: string; parent_id?: string | null; order?: number }) {
    const res = await fetch(`/api/folders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' })
    return res.json()
}

export async function deleteFolder(id: string) {
    const res = await fetch(`/api/folders/${id}`, { method: 'DELETE', credentials: 'same-origin' })
    return res.json()
}

export async function getNotes(folderId?: string) {
    const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
    const res = await fetch(`/api/notes${qs}`, { credentials: 'same-origin' })
    return res.json()
}

export async function createNote(payload: { folder_id?: string; title_encrypted?: string; content_encrypted: string; nonce?: string }) {
    const res = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' })
    return res.json()
}

export async function updateNote(id: string, payload: { title_encrypted?: string; content_encrypted?: string; nonce?: string; folder_id?: string }) {
    const res = await fetch(`/api/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' })
    return res.json()
}

export async function deleteNote(id: string) {
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE', credentials: 'same-origin' })
    return res.json()
}

export async function getSettings() {
    const res = await fetch('/api/settings', { credentials: 'same-origin' })
    return res.json()
}

export async function updateSettings(payload: any) {
    const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' })
    return res.json()
}

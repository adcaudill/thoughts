import React, { useEffect, useState } from 'react'
import { getNotes, restoreNote } from '../lib/offlineApi'
import { getNoteKey } from '../lib/session'
import { decryptNotePayload } from '../lib/crypto'

export default function Trash({ onClose }: { onClose?: () => void }) {
    const [items, setItems] = useState<Array<any>>([])
    const [loading, setLoading] = useState(false)

    async function load() {
        setLoading(true)
        try {
            const res = await getNotes(undefined, { trashed: true })
            if (res && res.ok) {
                const notes = res.notes || []
                // Attempt to decrypt titles for display
                const key = getNoteKey()
                if (key) {
                    const withTitles = await Promise.all(notes.map(async (n: any) => {
                        let display = ''
                        try {
                            if (n && n.content_encrypted && n.nonce) {
                                const plain = await decryptNotePayload(key, n.content_encrypted, n.nonce)
                                try {
                                    const obj = JSON.parse(plain)
                                    display = (obj && obj.title) ? String(obj.title) : ''
                                } catch {
                                    // if plaintext isn't JSON, fall back to first line
                                    display = String(plain).split(/\n/)[0]
                                }
                            }
                        } catch { /* ignore decryption errors */ }
                        return { ...n, _displayTitle: display || n.id }
                    }))
                    setItems(withTitles)
                } else {
                    setItems(notes)
                }
            }
        } finally { setLoading(false) }
    }

    useEffect(() => { load() }, [])

    async function purge(id: string) {
        try { await fetch(`/api/notes/${encodeURIComponent(id)}?purge=1`, { method: 'DELETE', credentials: 'same-origin' }) } catch { }
        await load()
    }

    async function restore(id: string) {
        await restoreNote(id)
        await load()
    }

    return (
        <div className="p-3">
            <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm tracking-wide text-slate-600">Trash</h3>
                <button className="text-xs px-2 py-1 rounded hover:bg-slate-100" onClick={onClose}>Close</button>
            </div>
            {loading ? <div className="text-sm text-slate-500">Loading…</div> : null}
            <ul className="space-y-1 text-sm">
                {items.map((n: any) => (
                    <li key={n.id} className="py-1 px-2 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <div className="truncate">{n._displayTitle || n.id}</div>
                        <div className="flex items-center gap-2">
                            <button className="text-xs px-2 py-0.5 rounded border" onClick={() => restore(n.id)}>Restore</button>
                            <button className="text-xs px-2 py-0.5 rounded bg-rose-600 text-white" onClick={() => { if (confirm('Delete forever? This cannot be undone.')) purge(n.id) }}>Delete forever</button>
                        </div>
                    </li>
                ))}
                {items.length === 0 && !loading ? <li className="py-1 px-2 text-slate-500">Trash is empty</li> : null}
            </ul>
        </div>
    )
}

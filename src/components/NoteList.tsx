import React, { useEffect, useState } from 'react'
import { getNotes } from '../lib/api'
import { getNoteKey } from '../lib/session'
import { decryptNotePayload } from '../lib/crypto'

type NoteSummary = { id: string; title: string }

// onSelect receives either a full note object { id, title, content } or at minimum { id }
export default function NoteList({ folderId, onSelect, refreshSignal, dirtyNoteIds }: { folderId?: string | undefined; onSelect: (note: { id: string; title?: string; content?: string; folder_id?: string }) => void; refreshSignal?: number; dirtyNoteIds?: Record<string, boolean> }) {
    const [notes, setNotes] = useState<Array<NoteSummary>>([])

    useEffect(() => {
        async function load() {
            const res = await getNotes(folderId)
            if (!res.ok) return
            const key = getNoteKey()
            const items: Array<NoteSummary> = []
            for (const n of (res.notes || [])) {
                let title = n.id
                try {
                    if (key && n.content_encrypted && n.nonce) {
                        const decrypted = await decryptNotePayload(key, n.content_encrypted, n.nonce)
                        try {
                            const parsed = JSON.parse(decrypted)
                            title = parsed.title || parsed.content?.slice(0, 100) || n.id
                        } catch {
                            title = decrypted.slice(0, 80)
                        }
                    }
                } catch {
                    // ignore decryption errors and fall back to id
                }
                items.push({ id: n.id, title })
            }
            setNotes(items)
        }
        load()
    }, [refreshSignal, folderId])

    async function loadAndSelect(id: string) {
        try {
            const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, { credentials: 'same-origin' })
            const j = await res.json()
            if (!j.ok) { onSelect({ id }); return }
            const key = getNoteKey()
            if (!key) { onSelect({ id, folder_id: j.note.folder_id }); return }
            const decrypted = await decryptNotePayload(key, j.note.content_encrypted, j.note.nonce)
            try {
                const parsed = JSON.parse(decrypted)
                onSelect({ id: j.note.id, title: parsed.title, content: parsed.content, folder_id: j.note.folder_id })
            } catch {
                onSelect({ id: j.note.id, title: '', content: decrypted, folder_id: j.note.folder_id })
            }
        } catch {
            onSelect({ id })
        }
    }

    return (
        <div className="bg-white rounded shadow p-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Notes</h3>
                <button className="text-sm text-slate-700 px-2 py-1 rounded hover:bg-slate-50" onClick={() => onSelect({ id: '', title: '', content: '' })} aria-label="new-note">+ New</button>
            </div>
            <ul className="space-y-2 text-sm">
                {notes.map(n => (
                    <li key={n.id} className="py-1 px-2 rounded hover:bg-slate-50 cursor-pointer flex items-center justify-between" onClick={() => loadAndSelect(n.id)}>
                        <span className="flex items-center gap-2">
                            <span>{n.title}</span>
                        </span>
                        {dirtyNoteIds && dirtyNoteIds[n.id] ? (
                            <span className="h-2 w-2 rounded-full bg-rose-500" title="Unsaved changes" />
                        ) : null}
                    </li>
                ))}
            </ul>
        </div>
    )
}

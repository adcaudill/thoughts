import React, { useEffect, useState } from 'react'
import { getNoteKey } from '../lib/session'
import { decryptNotePayload } from '../lib/crypto'
import { deleteNote } from '../lib/api'

export default function NoteViewer({ id, onEdit, onDeleted }: { id?: string; onEdit?: (note: any) => void; onDeleted?: () => void }) {
    const [note, setNote] = useState<any | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        async function load() {
            if (!id) return
            setLoading(true)
            const res = await fetch(`/api/notes/${id}`, { credentials: 'same-origin' })
            const j = await res.json()
            if (!j.ok) { setLoading(false); return }
            const note = j.note
            const key = getNoteKey()
            if (!key) { setLoading(false); return }
            const decrypted = await decryptNotePayload(key, note.content_encrypted, note.nonce)
            try {
                const parsed = JSON.parse(decrypted)
                setNote(parsed)
            } catch {
                setNote({ content: decrypted })
            }
            setLoading(false)
        }
        load()
    }, [id])

    if (!id) return <div className="bg-white rounded shadow p-4">Select a note</div>

    if (loading) return <div className="bg-white rounded shadow p-4">Loading...</div>

    if (!note) return <div className="bg-white rounded shadow p-4">Unable to load note</div>

    return (
        <div className="bg-white rounded shadow p-6">
            <div className="flex items-start justify-between">
                <h2 className="text-xl font-semibold mb-2">{note.title || 'Untitled'}</h2>
                <div className="flex gap-2">
                    <button className="text-sm px-3 py-1 border rounded" onClick={() => onEdit && onEdit({ id, title: note.title, content: note.content })}>Edit</button>
                    <button className="text-sm px-3 py-1 bg-red-600 text-white rounded" onClick={async () => {
                        await fetch(`/api/notes/${id}`, { method: 'DELETE', credentials: 'same-origin' })
                        if (onDeleted) onDeleted()
                    }}>Delete</button>
                </div>
            </div>
            <div className="prose max-w-none">{note.content}</div>
        </div>
    )
}

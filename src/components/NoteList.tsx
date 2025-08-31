import React, { useEffect, useMemo, useState } from 'react'
import { getNotes, getLocalNote } from '../lib/offlineApi'
import { getNoteKey } from '../lib/session'
import { decryptNotePayload } from '../lib/crypto'
import { search as searchIndex, getIndex } from '../lib/search'

type NoteSummary = { id: string; title: string; displayTitle?: string }

// onSelect receives either a full note object { id, title, content } or at minimum { id }
export default function NoteList({ folderId, onSelect, refreshSignal, dirtyNoteIds }: { folderId?: string | undefined; onSelect: (note: { id: string; title?: string; content?: string; folder_id?: string }) => void; refreshSignal?: number; dirtyNoteIds?: Record<string, boolean> }) {
    const [notes, setNotes] = useState<Array<NoteSummary>>([])
    const [query, setQuery] = useState('')
    const [searching, setSearching] = useState(false)
    const [searchNotes, setSearchNotes] = useState<Array<NoteSummary>>([])

    useEffect(() => {
        async function load() {
            const res = await getNotes(folderId, { trashed: false })
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
            // If multiple notes share the same title, append a short id suffix so both are visible/distinguishable
            const counts: Record<string, number> = {}
            for (const it of items) counts[it.title] = (counts[it.title] || 0) + 1
            const annotated = items.map(it => (counts[it.title] > 1 ? { ...it, displayTitle: `${it.title || 'Untitled'} · ${it.id.slice(0, 6)}` } : { ...it, displayTitle: it.title }))
            setNotes(annotated)
        }
        load()
    }, [refreshSignal, folderId])

    // Run encrypted search when query changes (min length 2)
    useEffect(() => {
        let cancelled = false
        async function runSearch() {
            const q = query.trim()
            if (q.length < 2) { setSearchNotes([]); setSearching(false); return }
            setSearching(true)
            try {
                // Ensure index is present
                if (!getIndex()) { setSearchNotes([]); return }
                const results = searchIndex(q)
                const key = getNoteKey()
                const out: Array<NoteSummary> = []
                for (const r of results) {
                    if (cancelled) break
                    const n = await getLocalNote(r.id)
                    if (!n) continue
                    let title = n.id
                    if (key && n.content_encrypted && n.nonce) {
                        try {
                            const decrypted = await decryptNotePayload(key, n.content_encrypted, n.nonce)
                            try {
                                const parsed = JSON.parse(decrypted)
                                title = parsed.title || parsed.content?.slice(0, 100) || n.id
                            } catch {
                                title = decrypted.slice(0, 80)
                            }
                        } catch { /* ignore */ }
                    }
                    out.push({ id: n.id, title })
                }
                if (!cancelled) {
                    const counts: Record<string, number> = {}
                    for (const it of out) counts[it.title] = (counts[it.title] || 0) + 1
                    const annotated = out.map(it => (counts[it.title] > 1 ? { ...it, displayTitle: `${it.title || 'Untitled'} · ${it.id.slice(0, 6)}` } : { ...it, displayTitle: it.title }))
                    setSearchNotes(annotated)
                }
            } finally {
                if (!cancelled) setSearching(false)
            }
        }
        runSearch()
        return () => { cancelled = true }
    }, [query])

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
                const safeTitle = parsed.title ?? ''
                onSelect({ id: j.note.id, title: safeTitle, content: parsed.content, folder_id: j.note.folder_id })
            } catch {
                onSelect({ id: j.note.id, title: '', content: decrypted, folder_id: j.note.folder_id })
            }
        } catch {
            onSelect({ id })
        }
    }

    const showingSearch = useMemo(() => query.trim().length >= 2, [query])
    const list = showingSearch ? searchNotes : notes

    return (
        <div className="p-2">
            <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="font-medium text-sm tracking-wide text-slate-600">Notes</h3>
                <button className="text-xs text-slate-700 px-2 py-1 rounded hover:bg-slate-100" onClick={() => onSelect({ id: '', title: '', content: '', folder_id: folderId })} aria-label="new-note">+ New</button>
            </div>
            <div className="mb-2 px-1">
                <div className="relative">
                    <input
                        aria-label="search-notes"
                        placeholder="Search notes…"
                        className="border dark:border-slate-800/30 px-2 py-1.5 text-sm pr-8 w-full min-w-0 rounded"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    {query && (
                        <button
                            aria-label="clear-search"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                            onClick={() => setQuery('')}
                        >
                            <i className="fa-solid fa-xmark" aria-hidden="true" />
                        </button>
                    )}
                </div>
                {showingSearch && (
                    <div className="mt-1 text-xs text-slate-500">
                        {searching ? 'Searching…' : `${list.length} result${list.length === 1 ? '' : 's'}`}
                    </div>
                )}
            </div>
            <ul className="space-y-1 text-sm">
                {list.map(n => (
                    <li key={n.id} className="py-1 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between" onClick={() => loadAndSelect(n.id)}>
                        <span className="flex items-center gap-2">
                            <span>{n.displayTitle || n.title}</span>
                        </span>
                        {dirtyNoteIds && dirtyNoteIds[n.id] ? (
                            <span className="h-2 w-2 rounded-full bg-rose-500" title="Unsaved changes" />
                        ) : null}
                    </li>
                ))}
                {list.length === 0 && (
                    <li className="py-1 px-2 text-slate-500">{showingSearch ? 'No results' : 'No notes'}</li>
                )}
            </ul>
        </div>
    )
}

import React, { useEffect, useState } from 'react'
import ReactQuill from 'react-quill-new'
import '../styles/quill.css'
import { getNoteKey } from '../lib/session'
import { encryptNotePayload, decryptNotePayload } from '../lib/crypto'
import { createNote, updateNote, getFolders } from '../lib/api'

export default function Editor({ editingNote, onSaved, onDeleted, onDirtyChange }: { editingNote?: any; onSaved?: () => void; onDeleted?: () => void; onDirtyChange?: (id: string, dirty: boolean) => void }) {
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [loading, setLoading] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [initialTitle, setInitialTitle] = useState('')
    const [initialContent, setInitialContent] = useState('')
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
    const [menuOpen, setMenuOpen] = useState(false)
    const [folders, setFolders] = useState<Array<any>>([])
    const [selectedFolder, setSelectedFolder] = useState<string | undefined>(undefined)

    const titleRef = React.useRef<HTMLInputElement | null>(null)
    const [isCompactToolbar, setIsCompactToolbar] = useState(false)

    useEffect(() => {
        if (editingNote) {
            const t = editingNote.title || ''
            const c = editingNote.content || ''
            setTitle(t)
            setContent(c)
            setInitialTitle(t)
            setInitialContent(c)
            setDirty(false)
            if (onDirtyChange) onDirtyChange(editingNote.id || '', false)
            if (editingNote.folder_id) setSelectedFolder(editingNote.folder_id)
            // if creating a new note (empty id), focus title
            if (!editingNote.id && titleRef.current) {
                titleRef.current.focus()
            }
        } else {
            setTitle('')
            setContent('')
            setInitialTitle('')
            setInitialContent('')
            setDirty(false)
            if (onDirtyChange) onDirtyChange('', false)
        }
    }, [editingNote])

    useEffect(() => {
        function onResize() {
            try { setIsCompactToolbar(window.innerWidth < 640) } catch { }
        }
        onResize()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    useEffect(() => {
        async function loadFolders() {
            try {
                const res = await getFolders()
                if (!res.ok) return
                const key = getNoteKey()
                const map: Record<string, string> = {}
                const items = res.folders || []
                for (const f of items) {
                    let display = f.name_encrypted || ''
                    if (f.is_default === 1) {
                        display = 'Inbox'
                    } else if (key && display && display.includes('.')) {
                        try {
                            const [nonceB64, cipherB64] = display.split('.')
                            const plain = await decryptNotePayload(key, cipherB64, nonceB64)
                            display = plain || 'Untitled'
                        } catch {
                            // leave as-is
                        }
                    }
                    map[f.id] = display
                }
                setFolders(items.map((f: any) => ({ ...f, displayName: map[f.id] })))
                // set default selection (Inbox)
                if (!selectedFolder) {
                    const inbox = items.find((x: any) => x.is_default === 1)
                    if (inbox) setSelectedFolder(inbox.id)
                }
            } catch (e) {
                // ignore
            }
        }
        loadFolders()
    }, [])

    async function handleSave(_opts?: { clearAfterSave?: boolean }) {
        try {
            setLoading(true)
            const key = getNoteKey()
            if (!key) {
                setLoading(false)
                return
            }
            const payload = JSON.stringify({ title, content })
            const { ciphertext, nonce } = await encryptNotePayload(key, payload)
            if (editingNote && editingNote.id) {
                const payloadPatch: any = { content_encrypted: ciphertext, nonce }
                if (selectedFolder) payloadPatch.folder_id = selectedFolder
                await updateNote(editingNote.id, payloadPatch)
            } else {
                await createNote({ folder_id: selectedFolder, content_encrypted: ciphertext, nonce })
            }
            // notify caller that save completed
            if (onSaved) onSaved()
            // mark as saved (don't clear editor)
            setInitialTitle(title)
            setInitialContent(content)
            setDirty(false)
            setLastSavedAt(Date.now())
            if (onDirtyChange) onDirtyChange(editingNote?.id || '', false)
        } finally {
            setLoading(false)
        }
    }

    // Autosave every 30 seconds when dirty
    useEffect(() => {
        if (!dirty) return
        const interval = setInterval(() => {
            if (!dirty || loading) return
            handleSave().catch(() => {
                // ignore autosave errors for now
            })
        }, 30_000)
        return () => clearInterval(interval)
    }, [dirty, loading, title, content, selectedFolder, editingNote])

    // Keyboard shortcut: Cmd/Ctrl+S to save when dirty
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'
            if (!isSave) return
            e.preventDefault()
            if (!dirty || loading) return
            handleSave().catch(() => { })
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [dirty, loading, title, content, selectedFolder, editingNote])

    async function handleDelete() {
        if (!editingNote || !editingNote.id) return
        setLoading(true)
        await fetch(`/api/notes/${editingNote.id}`, { method: 'DELETE', credentials: 'same-origin' })
        setLoading(false)
        if (onDeleted) onDeleted()
    }

    return (
        <div className="bg-white rounded shadow p-4 min-h-[50vh] flex flex-col">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex-1 flex items-center gap-4">
                    <input ref={titleRef} value={title} onChange={e => {
                        const newTitle = e.target.value
                        setTitle(newTitle)
                        const isDirty = newTitle !== initialTitle || content !== initialContent
                        setDirty(isDirty)
                        if (onDirtyChange) onDirtyChange(editingNote?.id || '', isDirty)
                    }} className="w-full text-xl font-semibold border-b pb-2" placeholder="Untitled" />
                    <select aria-label="select-folder" className="text-sm border rounded px-2 py-1" value={selectedFolder} onChange={e => setSelectedFolder(e.target.value)} disabled={folders.length === 0}>
                        {folders.map(f => <option key={f.id} value={f.id}>{f.displayName || f.name_encrypted || 'Untitled'}</option>)}
                    </select>
                </div>
                <div className="relative ml-4">
                    <button onClick={() => setMenuOpen(o => !o)} className="p-2 rounded hover:bg-slate-100" aria-label="Open menu">☰</button>
                    {menuOpen && (
                        <div className="absolute right-0 mt-2 w-40 bg-white border rounded shadow-md z-10">
                            <button className="w-full text-left px-3 py-2 hover:bg-slate-50" onClick={() => { setMenuOpen(false); handleDelete() }}>Delete</button>
                        </div>
                    )}
                </div>

            </div>

            <div className="mt-2 flex-1 min-h-[40vh] flex flex-col">
                <div className="border rounded overflow-hidden editor-quill-wrapper flex-1 safe-area">
                    <ReactQuill
                        theme="snow"
                        value={content}
                        onChange={(val: string) => {
                            setContent(val)
                            const isDirty = title !== initialTitle || val !== initialContent
                            setDirty(isDirty)
                            if (onDirtyChange) onDirtyChange(editingNote?.id || '', isDirty)
                        }}
                        style={{ height: '100%' }}
                        className="h-full"
                        modules={{
                            toolbar: isCompactToolbar ? [
                                [{ header: [1, 2, false] }],
                                ['bold', 'italic', 'underline'],
                                [{ list: 'ordered' }, { list: 'bullet' }],
                                ['link']
                            ] : [
                                [{ header: [1, 2, 3, false] }],
                                ['bold', 'italic', 'underline', 'strike'],
                                [{ list: 'ordered' }, { list: 'bullet' }],
                                ['blockquote', 'code-block'],
                                ['link', 'image']
                            ]
                        }}
                    />
                </div>
                <div className="mt-3 sm:mt-4 flex-none flex items-center gap-4 justify-end">
                    <div className="text-sm mr-2 text-slate-500 dark:text-slate-300">
                        {loading ? 'Saving…' : (lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : '')}
                    </div>
                    <button
                        className={`px-4 py-2 rounded transition-colors duration-150 ${dirty && !loading ? 'bg-slate-800 text-white hover:bg-slate-700 dark:bg-sky-600 dark:hover:bg-sky-700 dark:text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}
                        onClick={() => handleSave()}
                        disabled={!dirty || loading}
                    >
                        {editingNote ? 'Save changes' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    )
}

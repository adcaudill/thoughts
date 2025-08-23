import React, { useEffect, useImperativeHandle, useState } from 'react'
import ReactQuill from 'react-quill-new'
import '../styles/quill.css'
import { getNoteKey } from '../lib/session'
import { encryptNotePayload, decryptNotePayload } from '../lib/crypto'
import { createNote, updateNote, getFolders } from '../lib/api'

export type EditorHandle = {
    save: () => Promise<void>
    isDirty: () => boolean
}

type EditorProps = { editingNote?: any; onSaved?: (createdId?: string) => void; onDeleted?: () => void; onDirtyChange?: (id: string, dirty: boolean) => void; focusMode?: boolean; editorSettings?: any }

const Editor = React.forwardRef<EditorHandle, EditorProps>(function Editor({ editingNote, onSaved, onDeleted, onDirtyChange, focusMode, editorSettings }, ref) {
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
    const [activeBlockIndex, setActiveBlockIndex] = useState<number | null>(null)

    const titleRef = React.useRef<HTMLInputElement | null>(null)
    const wrapperRef = React.useRef<HTMLDivElement | null>(null)
    const quillRef = React.useRef<any>(null)
    const [isCompactToolbar, setIsCompactToolbar] = useState(false)
    // Track save-in-progress to avoid concurrent createNote races
    const isSavingRef = React.useRef(false)
    // If we create a note, remember its id so subsequent saves patch instead of creating
    const createdIdRef = React.useRef<string | null>(null)

    // Normalize Quill/HTML content so that editor default placeholder HTML (e.g. "<p><br></p>")
    // is treated as an empty string. This prevents autosave from creating junk notes when
    // the user hasn't actually entered any text.
    function normalizeEditorHtml(html: string | null | undefined) {
        if (!html) return ''
        const raw = String(html).trim()
        // Quick checks for common empty Quill output
        if (!raw) return ''
        // If the DOM text content is empty then treat as empty
        try {
            const div = document.createElement('div')
            div.innerHTML = raw
            if ((div.textContent || '').trim() === '') return ''
        } catch {
            // fall back to simple regex checks
            const emptyRe = /^(<p>(?:<br\s*\/?>)?<\/p>|<div>(?:<br\s*\/?>)?<\/div>)$/i
            if (emptyRe.test(raw)) return ''
        }
        // remove zero-width spaces and normalize whitespace
        return raw.replace(/\u200B/g, '').trim()
    }

    const prevNoteIdRef = React.useRef<string | null>(null)
    useEffect(() => {
        const incomingId: string = editingNote ? (editingNote.id || '') : ''
        const prevId = prevNoteIdRef.current || ''

        // If we just created a note and parent updated the id to the created one,
        // do NOT reset local title/content. Keep the current editor state.
        if (createdIdRef.current && incomingId === createdIdRef.current && (prevId === '' || prevId === createdIdRef.current)) {
            prevNoteIdRef.current = incomingId
            if (editingNote && editingNote.folder_id) setSelectedFolder(editingNote.folder_id)
            return
        }

        if (editingNote) {
            const t = editingNote.title || ''
            const c = normalizeEditorHtml(editingNote.content || '')
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
        prevNoteIdRef.current = incomingId
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
        // prevent concurrent saves from racing to create a note twice
        if (isSavingRef.current) return
        isSavingRef.current = true
        try {
            setLoading(true)
            const key = getNoteKey()
            if (!key) {
                setLoading(false)
                isSavingRef.current = false
                return
            }
            const payload = JSON.stringify({ title, content })
            const { ciphertext, nonce } = await encryptNotePayload(key, payload)
            // prefer an existing id from the prop, else any id we created previously
            const noteId = (editingNote && editingNote.id) ? editingNote.id : createdIdRef.current
            if (noteId) {
                const payloadPatch: any = { content_encrypted: ciphertext, nonce }
                if (selectedFolder) payloadPatch.folder_id = selectedFolder
                await updateNote(noteId, payloadPatch)
            } else {
                const res = await createNote({ folder_id: selectedFolder, content_encrypted: ciphertext, nonce })
                // createNote should return the created id; remember it so autosave/manual save don't create duplicates
                if (res && (res.id || res.note_id || res.note?.id)) {
                    const id = res.id || res.note_id || (res.note && res.note.id)
                    createdIdRef.current = id
                    // notify parent with created id if they want it
                    if (onSaved) onSaved(id)
                }
            }
            // notify caller that save completed
            if (!editingNote && !createdIdRef.current) {
                // if we created a note but didn't pass id above for some reason, still call onSaved
                if (onSaved) onSaved()
            } else if (editingNote) {
                // for updates, call onSaved without args (parent handles refresh)
                if (onSaved) onSaved()
            }
            // mark as saved (don't clear editor)
            setInitialTitle(title)
            setInitialContent(content)
            setDirty(false)
            setLastSavedAt(Date.now())
            if (onDirtyChange) onDirtyChange((editingNote && editingNote.id) || createdIdRef.current || '', false)
        } finally {
            setLoading(false)
            isSavingRef.current = false
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

    // Warn on navigation if there's an unsaved NEW note (no id yet) and changes exist
    useEffect(() => {
        function beforeUnload(e: BeforeUnloadEvent) {
            if (!editingNote || editingNote.id) return
            if (!dirty) return
            e.preventDefault()
            e.returnValue = ''
        }
        if (!editingNote || editingNote.id) return
        if (dirty) {
            window.addEventListener('beforeunload', beforeUnload)
        }
        return () => {
            window.removeEventListener('beforeunload', beforeUnload)
        }
    }, [editingNote && editingNote.id, dirty])

    // Expose imperative API
    useImperativeHandle(ref, () => ({
        save: async () => { await handleSave().catch(() => { }) },
        isDirty: () => dirty,
    }), [dirty, title, content, selectedFolder, editingNote])

    async function handleDelete() {
        if (!editingNote || !editingNote.id) return
        setLoading(true)
        await fetch(`/api/notes/${editingNote.id}`, { method: 'DELETE', credentials: 'same-origin' })
        setLoading(false)
        if (onDeleted) onDeleted()
    }

    const toolbarConfig = focusMode || isCompactToolbar ? [
        [{ header: [1, 2, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link']
    ] : [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote'],
        ['link', 'image']
    ]

    function computeFontFamily() {
        const f = (editorSettings && editorSettings.editorFont) || 'sans-serif'
        if (f === 'serif') return 'serif'
        if (f === 'monospace') return 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Helvetica Neue", monospace'
        return 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial'
    }

    function computeWordCount(html: string) {
        try {
            const div = document.createElement('div')
            div.innerHTML = html || ''
            const text = (div.textContent || '').trim()
            if (!text) return 0
            return text.split(/\s+/).filter(Boolean).length
        } catch { return 0 }
    }

    // Helper: mark active block from a Quill index
    const markActiveFromIndex = React.useCallback((index: number | null | undefined) => {
        if (!(editorSettings && editorSettings.focusCurrentParagraph)) return
        if (index == null) { setActiveBlockIndex(null); return }
        const root = wrapperRef.current?.querySelector('.ql-editor') as HTMLElement | null
        const quill = quillRef.current?.getEditor?.()
        if (!root || !quill) { setActiveBlockIndex(null); return }
        try {
            root.querySelectorAll('.qp-active-line').forEach(el => el.classList.remove('qp-active-line'))
            const [line] = quill.getLine(index) || []
            if (!line || !line.domNode) { setActiveBlockIndex(null); return }
            let el: HTMLElement | null = line.domNode as HTMLElement
            while (el && el.parentElement && el.parentElement !== root) {
                el = el.parentElement
            }
            if (!el) { setActiveBlockIndex(null); return }
            if (root.contains(el)) {
                el.classList.add('qp-active-line')
                const children = Array.from(root.children)
                const pos = children.indexOf(el)
                setActiveBlockIndex(pos >= 0 ? pos : null)
            }
        } catch { setActiveBlockIndex(null) }
    }, [editorSettings && editorSettings.focusCurrentParagraph])

    // Update active line highlighting when selection or content changes
    useEffect(() => {
        if (!(editorSettings && editorSettings.focusCurrentParagraph)) return
        if (!wrapperRef.current) return
        const root = wrapperRef.current.querySelector('.ql-editor') as HTMLElement | null
        if (!root) return
        // If one is already marked and still in DOM, keep it
        const existing = root.querySelector('.qp-active-line') as HTMLElement | null
        if (existing && root.contains(existing)) return
        if (activeBlockIndex == null) return
        const children = Array.from(root.children)
        const el = children[activeBlockIndex] as HTMLElement | undefined
        if (el) el.classList.add('qp-active-line')
    }, [activeBlockIndex, content, editorSettings && editorSettings.focusCurrentParagraph])

    // When toggling the setting ON or after content updates, ensure a selection maps to an active line
    useEffect(() => {
        if (!(editorSettings && editorSettings.focusCurrentParagraph)) {
            // clear any leftover active-line when feature is off
            const root = wrapperRef.current?.querySelector('.ql-editor') as HTMLElement | null
            if (root) root.querySelectorAll('.qp-active-line').forEach(el => el.classList.remove('qp-active-line'))
            return
        }
        const quill = quillRef.current?.getEditor?.()
        if (!quill) return
        const sel = quill.getSelection?.()
        if (!sel || sel.index == null) return
        // apply on next frame to avoid racing Quill DOM updates
        requestAnimationFrame(() => markActiveFromIndex(sel.index))
    }, [content, editorSettings && editorSettings.focusCurrentParagraph])

    // Attach native Quill listeners for robust selection tracking
    useEffect(() => {
        const quill = quillRef.current?.getEditor?.()
        if (!quill) return
        function onSel(range: any) {
            if (!(editorSettings && editorSettings.focusCurrentParagraph)) return
            const idx = range && typeof range.index === 'number' ? range.index : null
            markActiveFromIndex(idx as any)
        }
        function onText() {
            if (!(editorSettings && editorSettings.focusCurrentParagraph)) return
            const sel = quill.getSelection?.()
            markActiveFromIndex(sel && sel.index)
        }
        quill.on('selection-change', onSel)
        quill.on('text-change', onText)
        return () => {
            try {
                quill.off('selection-change', onSel)
                quill.off('text-change', onText)
            } catch { /* ignore */ }
        }
    }, [editorSettings && editorSettings.focusCurrentParagraph, markActiveFromIndex])

    const containerClass = `${focusMode ? 'focus-editor bg-white/90 dark:bg-slate-900/60 rounded-xl shadow-sm ring-1 ring-slate-900/5' : 'bg-white rounded shadow'} p-4 md:p-6 min-h-[60vh] md:min-h-[70vh] flex flex-col`

    return (
        <div className={containerClass}>
            <div className="mb-3 md:mb-4 flex items-center justify-between">
                <div className="flex-1 flex items-center gap-4">
                    <input
                        ref={titleRef}
                        value={title}
                        onChange={e => {
                            const newTitle = e.target.value
                            setTitle(newTitle)
                            const isDirty = newTitle !== initialTitle || normalizeEditorHtml(content) !== normalizeEditorHtml(initialContent)
                            setDirty(isDirty)
                            if (onDirtyChange) onDirtyChange(editingNote?.id || '', isDirty)
                        }}
                        className={`w-full ${focusMode ? 'text-3xl md:text-4xl' : 'text-xl'} font-semibold bg-transparent border-b dark:border-slate-800/30 pb-2 outline-none`}
                        placeholder="Untitled"
                    />
                    {!focusMode && (
                        <select aria-label="select-folder" className="text-sm border dark:border-slate-800/30 rounded px-2 py-1" value={selectedFolder} onChange={e => setSelectedFolder(e.target.value)} disabled={folders.length === 0}>
                            {folders.map(f => <option key={f.id} value={f.id}>{f.displayName || f.name_encrypted || 'Untitled'}</option>)}
                        </select>
                    )}
                </div>

                {!focusMode && (
                    <div className="relative ml-4">
                        <button onClick={() => setMenuOpen(o => !o)} className="p-2 rounded hover:bg-slate-100" aria-label="Open menu">☰</button>
                        {menuOpen && (
                            <div className="absolute right-0 mt-2 w-40 bg-white border dark:border-slate-800/30 rounded shadow-md z-10">
                                <button className="w-full text-left px-3 py-2 hover:bg-slate-50" onClick={() => { setMenuOpen(false); handleDelete() }}>Delete</button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-2 flex-1 min-h-[40vh] flex flex-col">
                <div ref={wrapperRef} style={{ fontFamily: computeFontFamily() }} className={`${focusMode ? 'border border-black/5 dark:border-white/5' : 'border border-slate-200 dark:border-slate-800/30'} rounded overflow-hidden editor-quill-wrapper flex-1 safe-area ${focusMode ? 'max-w-3xl md:max-w-4xl mx-auto w-full' : ''}`}>
                    <ReactQuill
                        ref={quillRef}
                        theme="snow"
                        value={content}
                        onChange={(val: string) => {
                            const normalized = normalizeEditorHtml(val)
                            setContent(normalized)
                            const isDirty = title !== initialTitle || normalized !== initialContent
                            setDirty(isDirty)
                            if (onDirtyChange) onDirtyChange(editingNote?.id || '', isDirty)
                        }}
                        onChangeSelection={(range) => {
                            // Keep this as a lightweight hook; native quill listeners drive the logic
                            if (!(editorSettings && editorSettings.focusCurrentParagraph)) return
                            const idx = range && typeof range.index === 'number' ? range.index : null
                            markActiveFromIndex(idx as any)
                        }}
                        style={{ height: '100%' }}
                        className={`h-full ${editorSettings && editorSettings.focusCurrentParagraph ? 'qp-focus-current' : ''}`}
                        modules={{ toolbar: toolbarConfig }}
                    />
                </div>

                <div className="mt-3 sm:mt-4 flex-none flex items-center gap-4 justify-between">
                    <div className="flex items-center gap-4">
                        {editorSettings && editorSettings.showWordCount && (
                            <div className="text-sm text-slate-500 dark:text-slate-300">Words: {computeWordCount(content)}</div>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-sm mr-2 text-slate-500 dark:text-slate-300">
                            {loading ? 'Saving…' : (lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : '')}
                        </div>
                        <button
                            className={`px-4 py-2 rounded transition-colors duration-150 ${dirty && !loading ? 'bg-slate-800 text-white hover:bg-slate-700 dark:bg-sky-600 dark:hover:bg-sky-700 dark:text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'} ${focusMode && !dirty ? 'opacity-0 pointer-events-none' : ''}`}
                            onClick={() => handleSave()}
                            disabled={!dirty || loading}
                        >
                            {editingNote ? 'Save changes' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
})

export default Editor

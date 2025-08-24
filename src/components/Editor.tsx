import React, { useEffect, useImperativeHandle, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import '../styles/editor.css'
import { useReadingStats, computeWordCount } from '../hooks/useReadingStats'
import { useStyleIssuesExt } from '../hooks/useStyleIssuesExt'
import { useFocusParagraphExt } from '../hooks/useFocusParagraphExt'
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

    const titleRef = React.useRef<HTMLInputElement | null>(null)
    const wrapperRef = React.useRef<HTMLDivElement | null>(null)
    const cmViewRef = React.useRef<EditorView | null>(null)

    // Track save-in-progress to avoid concurrent createNote races
    const isSavingRef = React.useRef(false)
    // If we create a note, remember its id so subsequent saves patch instead of creating
    const createdIdRef = React.useRef<string | null>(null)
    const prevNoteIdRef = React.useRef<string | null>(null)
    // Track the previously-selected folder so switching to the same folder doesn't retrigger a save
    const prevSelectedFolderRef = React.useRef<string | undefined>(undefined)

    // Normalize Markdown content
    function normalizeContent(md: string | null | undefined) {
        if (md == null) return ''
        return String(md).replace(/\u200B/g, '').trim()
    }

    useEffect(() => {
        const incomingId: string = editingNote ? (editingNote.id || '') : ''
        const prevId = prevNoteIdRef.current || ''

        if (createdIdRef.current && incomingId === createdIdRef.current && (prevId === '' || prevId === createdIdRef.current)) {
            prevNoteIdRef.current = incomingId
            if (editingNote && editingNote.folder_id) setSelectedFolder(editingNote.folder_id)
            return
        }

        if (editingNote) {
            const t = editingNote.title || ''
            const c = normalizeContent(editingNote.content || '')
            setTitle(t)
            setContent(c)
            setInitialTitle(t)
            setInitialContent(c)
            setDirty(false)
            onDirtyChange?.(editingNote.id || '', false)
            if (editingNote.folder_id) {
                setSelectedFolder(editingNote.folder_id)
                prevSelectedFolderRef.current = editingNote.folder_id
            }
            if (!editingNote.id && titleRef.current) titleRef.current.focus()
        } else {
            setTitle('')
            setContent('')
            setInitialTitle('')
            setInitialContent('')
            setDirty(false)
            onDirtyChange?.('', false)
        }
        prevNoteIdRef.current = incomingId
    }, [editingNote])

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
                if (!selectedFolder) {
                    const inbox = items.find((x: any) => x.is_default === 1)
                    if (inbox) setSelectedFolder(inbox.id)
                }
            } catch { }
        }
        loadFolders()
    }, [])

    async function handleSave(_opts?: { clearAfterSave?: boolean, folderId?: string | undefined }) {
        if (isSavingRef.current) return
        isSavingRef.current = true
        try {
            setLoading(true)
            const key = getNoteKey()
            if (!key) { setLoading(false); isSavingRef.current = false; return }
            const payload = JSON.stringify({ title, content })
            const { ciphertext, nonce } = await encryptNotePayload(key, payload)
            const folderToUse = (_opts && Object.prototype.hasOwnProperty.call(_opts, 'folderId')) ? _opts!.folderId : selectedFolder
            const noteId = (editingNote && editingNote.id) ? editingNote.id : createdIdRef.current
            if (noteId) {
                const payloadPatch: any = { content_encrypted: ciphertext, nonce }
                if (folderToUse) payloadPatch.folder_id = folderToUse
                await updateNote(noteId, payloadPatch)
            } else {
                const res = await createNote({ folder_id: folderToUse, content_encrypted: ciphertext, nonce })
                if (res && (res.id || res.note_id || res.note?.id)) {
                    const id = res.id || res.note_id || (res.note && res.note.id)
                    createdIdRef.current = id
                    onSaved?.(id)
                }
            }
            if (!editingNote && !createdIdRef.current) { onSaved?.() }
            else if (editingNote) { onSaved?.() }
            setInitialTitle(title)
            setInitialContent(content)
            setDirty(false)
            setLastSavedAt(Date.now())
            onDirtyChange?.((editingNote && editingNote.id) || createdIdRef.current || '', false)
        } finally {
            setLoading(false)
            isSavingRef.current = false
        }
    }

    async function handleDelete() {
        if (!editingNote || !editingNote.id) return
        setLoading(true)
        await fetch(`/api/notes/${editingNote.id}`, { method: 'DELETE', credentials: 'same-origin' })
        setLoading(false)
        onDeleted?.()
    }

    // Autosave every 30 seconds when dirty
    useEffect(() => {
        if (!dirty) return
        const interval = window.setInterval(() => {
            if (!dirty || loading) return
            handleSave().catch(() => { })
        }, 30_000)
        return () => window.clearInterval(interval)
    }, [dirty, loading, title, content, selectedFolder, editingNote])

    // Keyboard shortcut: Cmd/Ctrl+S
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

    // Warn on navigation if there's an unsaved NEW note
    useEffect(() => {
        function beforeUnload(e: BeforeUnloadEvent) {
            if (!editingNote || editingNote.id) return
            if (!dirty) return
            e.preventDefault()
            e.returnValue = ''
        }
        if (!editingNote || editingNote.id) return
        if (dirty) window.addEventListener('beforeunload', beforeUnload)
        return () => window.removeEventListener('beforeunload', beforeUnload)
    }, [editingNote && editingNote.id, dirty])

    // Expose imperative API
    useImperativeHandle(ref, () => ({
        save: async () => { await handleSave().catch(() => { }) },
        isDirty: () => dirty,
    }), [dirty, title, content, selectedFolder, editingNote])

    function computeFontFamily() {
        const f = (editorSettings && editorSettings.editorFont) || 'monospace'
        if (f === 'serif') return 'Georgia, Times New Roman, serif'
        if (f === 'monospace') return 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Helvetica Neue", monospace'
        return 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial'
    }

    // Detect dark mode (Tailwind may toggle `class="dark"` on <html>); keep in state
    const [isDark, setIsDark] = React.useState<boolean>(() => {
        try {
            if (typeof document !== 'undefined') {
                if (document.documentElement.classList.contains('dark')) return true
                if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true
            }
        } catch (e) { }
        return false
    })

    useEffect(() => {
        // Observe changes to the root's class attribute so theme flips when the app toggles dark mode
        if (typeof document === 'undefined') return
        const root = document.documentElement
        const obs = new MutationObserver(() => {
            setIsDark(root.classList.contains('dark'))
        })
        obs.observe(root, { attributes: true, attributeFilter: ['class'] })
        return () => obs.disconnect()
    }, [])

    // CodeMirror themes for light/dark so we don't have to fight vendor styles with global overrides
    const cmLightTheme = React.useMemo(() => EditorView.theme({
        '.cm-content': { caretColor: 'rgba(0,0,0,0.85)', fontFamily: 'inherit' },
        '.cm-scroller': { fontFamily: 'inherit' },
        '.cm-cursor': { display: 'block', borderLeft: 'none', width: '2px', backgroundColor: 'rgba(0,0,0,0.85)' },
        '.cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'rgba(59,130,246,0.25)' },
        /* Make formatting chars (markdown markers, punctuation) slightly more visible */
        '.cm-formatting, .cm-formatting-strong, .cm-formatting-quote, .cm-specialChar, .cm-punctuation, .cm-heading': { color: 'rgba(75,85,99,0.75)' }
    }, { dark: false }), [])

    const cmDarkTheme = React.useMemo(() => EditorView.theme({
        '.cm-content': { caretColor: 'rgba(255,255,255,0.92)', fontFamily: 'inherit' },
        '.cm-scroller': { fontFamily: 'inherit' },
        '.cm-cursor': { display: 'block', borderLeft: 'none', width: '2px', backgroundColor: 'rgba(255,255,255,0.92)' },
        '.cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'rgba(14,35,50,0.6)' },
        /* Make formatting chars (markdown markers, punctuation) a touch brighter in dark mode */
        '.cm-formatting, .cm-formatting-strong, .cm-formatting-quote, .cm-specialChar, .cm-punctuation, .cm-heading': { color: 'rgba(203,213,225,0.85)' }
    }, { dark: true }), [])

    const { words, readingTimeMin, readingDifficulty, fleschScore } = useReadingStats(content, !!(editorSettings && editorSettings.showReadingTime))

    const styleIssuesExt = useStyleIssuesExt(!!(editorSettings && editorSettings.styleIssues), content)
    const focusParagraphExt = useFocusParagraphExt(!!(editorSettings && editorSettings.focusCurrentParagraph), content)

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
                            const isDirty = newTitle !== initialTitle || normalizeContent(content) !== normalizeContent(initialContent)
                            setDirty(isDirty)
                            onDirtyChange?.(editingNote?.id || '', isDirty)
                        }}
                        className={`w-full ${focusMode ? 'text-3xl md:text-4xl' : 'text-xl'} font-semibold bg-transparent border-b dark:border-slate-800/30 pb-2 outline-none`}
                        placeholder="Untitled"
                    />
                    {!focusMode && (
                        <select
                            aria-label="select-folder"
                            className="text-sm border dark:border-slate-800/30 rounded px-2 py-1"
                            value={selectedFolder}
                            onChange={async e => {
                                const newFolder = e.target.value || undefined
                                setSelectedFolder(newFolder)
                                const prev = prevSelectedFolderRef.current
                                // Only trigger a save when the selected folder truly changed
                                if (prev !== newFolder) {
                                    prevSelectedFolderRef.current = newFolder
                                    // mark dirty so save button state reflects change
                                    const isDirty = title !== initialTitle || normalizeContent(content) !== normalizeContent(initialContent)
                                    setDirty(isDirty)
                                    onDirtyChange?.(editingNote?.id || '', isDirty)
                                    // Trigger save immediately using the newly-selected folder (don't await to avoid blocking UI)
                                    handleSave({ folderId: newFolder }).catch(() => { })
                                }
                            }}
                            disabled={folders.length === 0}
                        >
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
                <div ref={wrapperRef} style={{ fontFamily: computeFontFamily() }} className={`${focusMode ? 'border border-black/5 dark:border-white/5' : 'border border-slate-200 dark:border-slate-800/30'} rounded overflow-hidden editor-cm-wrapper flex-1 safe-area ${editorSettings && editorSettings.focusCurrentParagraph ? 'cm-focus-current' : ''} ${focusMode ? 'max-w-3xl md:max-w-4xl mx-auto w-full' : ''}`}>
                    <CodeMirror
                        value={content}
                        height="100%"
                        basicSetup={{ lineNumbers: false, highlightActiveLine: false }}
                        extensions={[markdown(), EditorView.lineWrapping, isDark ? cmDarkTheme : cmLightTheme, ...styleIssuesExt, ...focusParagraphExt]}
                        onCreateEditor={(view: EditorView) => { cmViewRef.current = view }}
                        onChange={(val) => {
                            const normalized = normalizeContent(val)
                            setContent(normalized)
                            const isDirty = title !== initialTitle || normalized !== initialContent
                            setDirty(isDirty)
                            onDirtyChange?.(editingNote?.id || '', isDirty)
                        }}
                        theme={EditorView.theme({
                            '.cm-content': { fontFamily: 'inherit' },
                            '.cm-scroller': { fontFamily: 'inherit' },
                        })}
                        className={`h-full cm-editor ${focusMode ? 'cm-focus-mode' : ''}`}
                    />
                </div>

                <div className="mt-3 sm:mt-4 flex-none flex items-center gap-4 justify-between">
                    <div className="flex items-center gap-4">
                        {editorSettings && (editorSettings.showWordCount || editorSettings.showReadingTime) && (
                            <div className="text-sm text-slate-500 dark:text-slate-300 flex items-center gap-3">
                                {editorSettings.showWordCount && (
                                    <div>Words: {words}</div>
                                )}
                                {editorSettings.showReadingTime && (
                                    <div title={fleschScore != null ? `Flesch Reading Ease: ${fleschScore.toFixed(1)}` : undefined}>
                                        Read: {readingTimeMin ?? Math.ceil(computeWordCount(content) / 200)} min{readingDifficulty ? ` (${readingDifficulty})` : ''}
                                    </div>
                                )}
                            </div>
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

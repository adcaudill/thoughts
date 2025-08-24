import React, { useEffect, useImperativeHandle, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import '../styles/editor.css'
import { useReadingStats } from '../hooks/useReadingStats'
import { useStyleIssuesExt } from '../hooks/useStyleIssuesExt'
import { useFocusParagraphExt } from '../hooks/useFocusParagraphExt'
import EditorHeader from './EditorHeader'
import EditorStatusBar from './EditorStatusBar'
import NoteInfoDialog from './NoteInfoDialog'
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
    // header menu is handled by EditorHeader
    const [folders, setFolders] = useState<Array<any>>([])
    const [selectedFolder, setSelectedFolder] = useState<string | undefined>(undefined)

    const titleRef = React.useRef<HTMLInputElement | null>(null)
    const wrapperRef = React.useRef<HTMLDivElement | null>(null)
    const cmViewRef = React.useRef<EditorView | null>(null)

    // Track save-in-progress to avoid concurrent createNote races
    const isSavingRef = React.useRef(false)
    // keep refs for dirty/loading so the autosave interval sees current values
    const dirtyRef = React.useRef(dirty)
    const loadingRef = React.useRef(loading)
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
            const currentWordCount = (content || '').trim().split(/\s+/).filter(Boolean).length
            const folderToUse = (_opts && Object.prototype.hasOwnProperty.call(_opts, 'folderId')) ? _opts!.folderId : selectedFolder
            const noteId = (editingNote && editingNote.id) ? editingNote.id : createdIdRef.current
            if (noteId) {
                const payloadPatch: any = { content_encrypted: ciphertext, nonce, word_count: currentWordCount }
                if (folderToUse) payloadPatch.folder_id = folderToUse
                await updateNote(noteId, payloadPatch)
            } else {
                const res = await createNote({ folder_id: folderToUse, content_encrypted: ciphertext, nonce, word_count: currentWordCount })
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
            try {
                // Notify sidebar to refresh folder word totals if goals are present
                window.dispatchEvent(new Event('note-saved'))
            } catch { /* ignore */ }
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

    // Keep refs in sync with state so the interval callback can read latest values
    useEffect(() => { dirtyRef.current = dirty }, [dirty])
    useEffect(() => { loadingRef.current = loading }, [loading])

    // Autosave every 30 seconds when dirty. Use a single interval created on mount
    // and read operations from refs to avoid stale closures and frequent resets.
    useEffect(() => {
        const interval = window.setInterval(() => {
            if (!dirtyRef.current || loadingRef.current) return
            handleSave().catch(() => { })
        }, 30_000)
        return () => window.clearInterval(interval)
    }, [])

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

    const { words, readingTimeMin, readingDifficulty, fleschScore, sentences, syllables, characters, fleschKincaid, automatedReadabilityIndex } = useReadingStats(content, !!(editorSettings && editorSettings.showReadingTime))
    const [noteInfoOpen, setNoteInfoOpen] = useState(false)

    const styleIssuesExt = useStyleIssuesExt(!!(editorSettings && editorSettings.styleIssues), content)
    const focusParagraphExt = useFocusParagraphExt(!!(editorSettings && editorSettings.focusCurrentParagraph), content)

    const containerClass = `${focusMode ? 'focus-editor bg-white/90 dark:bg-slate-900/60 rounded-xl shadow-sm ring-1 ring-slate-900/5' : 'bg-white rounded shadow'} p-4 md:p-6 min-h-[60vh] md:min-h-[70vh] flex flex-col`

    return (
        <div className={containerClass}>
            <EditorHeader
                title={title}
                titleRef={titleRef}
                onTitleChange={(newTitle) => {
                    setTitle(newTitle)
                    const isDirty = newTitle !== initialTitle || normalizeContent(content) !== normalizeContent(initialContent)
                    setDirty(isDirty)
                    onDirtyChange?.(editingNote?.id || '', isDirty)
                }}
                focusMode={focusMode}
                selectedFolder={selectedFolder}
                onFolderSelect={async (newFolder) => {
                    setSelectedFolder(newFolder)
                    const prev = prevSelectedFolderRef.current
                    if (prev !== newFolder) {
                        prevSelectedFolderRef.current = newFolder
                        const isDirty = title !== initialTitle || normalizeContent(content) !== normalizeContent(initialContent)
                        setDirty(isDirty)
                        onDirtyChange?.(editingNote?.id || '', isDirty)
                        handleSave({ folderId: newFolder }).catch(() => { })
                    }
                }}
                folders={folders}
                onDelete={() => handleDelete()}
                onOpenNoteInfo={() => setNoteInfoOpen(true)}
            />

            <NoteInfoDialog
                open={noteInfoOpen}
                onClose={() => setNoteInfoOpen(false)}
                words={words}
                sentences={sentences}
                syllables={syllables}
                characters={characters}
                fleschScore={fleschScore}
                fleschKincaid={fleschKincaid}
                automatedReadabilityIndex={automatedReadabilityIndex}
                readingTimeMin={readingTimeMin}
                readingDifficulty={readingDifficulty}
            />

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

                <EditorStatusBar
                    editorSettings={editorSettings}
                    words={words}
                    readingTimeMin={readingTimeMin ?? null}
                    readingDifficulty={readingDifficulty}
                    fleschScore={fleschScore}
                    loading={loading}
                    lastSavedAt={lastSavedAt}
                    dirty={dirty}
                    onSave={() => handleSave()}
                />
            </div>
        </div>
    )
})

export default Editor

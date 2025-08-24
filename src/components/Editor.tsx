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
    const [folders, setFolders] = useState<Array<any>>([])
    const [selectedFolder, setSelectedFolder] = useState<string | undefined>(undefined)

    const titleRef = React.useRef<HTMLInputElement | null>(null)
    const wrapperRef = React.useRef<HTMLDivElement | null>(null)
    const cmViewRef = React.useRef<EditorView | null>(null)

    // Refs and guards
    const isSavingRef = React.useRef(false)
    const dirtyRef = React.useRef(dirty)
    const loadingRef = React.useRef(loading)
    const createdIdRef = React.useRef<string | null>(null)
    // The canonical id for the currently-open note (server id if available)
    const stableNoteIdRef = React.useRef<string | null>(null)
    const prevNoteIdRef = React.useRef<string | null>(null)
    const pendingCreateRef = React.useRef<Promise<any> | null>(null)
    const savedContentRef = React.useRef<string | null>(null)
    const prevSelectedFolderRef = React.useRef<string | undefined>(undefined)

    function normalizeContent(md: string | null | undefined) {
        if (md == null) return ''
        // Remove zero-width spaces but keep exact whitespace; don't trim.
        return String(md).replace(/\u200B/g, '')
    }

    // Sync incoming editingNote
    useEffect(() => {
        const incomingId: string = editingNote ? (editingNote.id || '') : ''
        const prevId = prevNoteIdRef.current || ''
    const isSameNote = prevId === incomingId
    // Consider blank-id -> newly created id as the same logical note during rollover
    const sameLogicalNote = isSameNote || (prevId === '' && createdIdRef.current === incomingId)

        // If a create is in-flight, parent may emit the new id; don't apply while pending
        if (createdIdRef.current && pendingCreateRef.current && (prevId === '' || prevId === createdIdRef.current)) {
            prevNoteIdRef.current = incomingId
            if (editingNote && editingNote.folder_id) setSelectedFolder(editingNote.folder_id)
            return
        }

    if (editingNote) {
            if (editingNote.id) {
                stableNoteIdRef.current = editingNote.id
            }
            const t = editingNote.title || ''
            const c = normalizeContent(editingNote.content || '')

            // Detect local unsaved work (title or content)
            const localNormalized = normalizeContent(content)
            const initialNormalized = normalizeContent(initialContent)
            const contentHasUnsavedTyping = localNormalized !== initialNormalized
            const titleHasUnsavedTyping = (title || '') !== (initialTitle || '')
            const localHasUnsavedTyping = contentHasUnsavedTyping || titleHasUnsavedTyping

            // Only apply incoming data when switching notes or when there's no unsaved typing,
            // and never while a save is in-flight.
            if (!isSavingRef.current && (!sameLogicalNote || !localHasUnsavedTyping)) {
                // If still on the same logical note, prefer our last saved content over an older server echo.
                // If switching to a different note, always use the incoming content.
                const toApply = sameLogicalNote && savedContentRef.current && savedContentRef.current !== c ? savedContentRef.current : c
                setTitle(t)
                setContent(toApply)
                setInitialTitle(t)
                setInitialContent(toApply)
                if (sameLogicalNote) {
                    if (!savedContentRef.current) savedContentRef.current = toApply
                } else {
                    // On real note switch, reset saved snapshot to this note's content
                    savedContentRef.current = c
                }
                setDirty(false)
                onDirtyChange?.(editingNote.id || '', false)
            }
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
            savedContentRef.current = null
            // Do not clear stableNoteIdRef here; keep last known id to avoid accidental create due to transient undefined
        }
        prevNoteIdRef.current = incomingId
    }, [editingNote])

    // Load folders list
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
                        } catch { }
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

    // Save handler
    async function handleSave(_opts?: { clearAfterSave?: boolean, folderId?: string | undefined }) {
        // Wait on any pending create to avoid duplicate creates
        if (pendingCreateRef.current) {
            try { await pendingCreateRef.current } catch { }
        }
        if (isSavingRef.current) return
        isSavingRef.current = true
        try {
            // Yield one tick to ensure CodeMirror flushes any just-typed input
            await new Promise<void>(resolve => setTimeout(resolve, 0))
            setLoading(true)
            const key = getNoteKey()
            if (!key) { setLoading(false); isSavingRef.current = false; return }
            // Get the freshest content from CodeMirror to avoid losing last keystrokes
            const latestContent = normalizeContent(cmViewRef.current ? cmViewRef.current.state.doc.toString() : content)
            if (latestContent !== content) setContent(latestContent)
            const payload = JSON.stringify({ title, content: latestContent })
            const { ciphertext, nonce } = await encryptNotePayload(key, payload)
            const currentWordCount = (latestContent || '').trim().split(/\s+/).filter(Boolean).length
            const folderToUse = (_opts && Object.prototype.hasOwnProperty.call(_opts, 'folderId')) ? _opts!.folderId : selectedFolder
            // Prefer the stable id tracked from props or prior create completion
            const noteId = stableNoteIdRef.current || createdIdRef.current || (editingNote && editingNote.id) || null

            // Optimistically remember what we're saving
            savedContentRef.current = latestContent

            if (noteId) {
                const payloadPatch: any = { content_encrypted: ciphertext, nonce, word_count: currentWordCount }
                if (folderToUse) payloadPatch.folder_id = folderToUse
                await updateNote(noteId, payloadPatch)
                onSaved?.()
            } else {
                const tempId = (globalThis.crypto && 'randomUUID' in globalThis.crypto) ? (globalThis.crypto as any).randomUUID() : `temp-${Date.now()}`
                createdIdRef.current = tempId
                stableNoteIdRef.current = tempId
                const p = createNote({ id: tempId, folder_id: folderToUse, content_encrypted: ciphertext, nonce, word_count: currentWordCount })
                pendingCreateRef.current = p
                try {
                    const res = await p
                    pendingCreateRef.current = null
                    if (res && (res.id || res.note_id || res.note?.id)) {
                        const id = res.id || res.note_id || (res.note && res.note.id)
                        createdIdRef.current = id
                        stableNoteIdRef.current = id
                        onSaved?.(id)
                    } else {
                        if (createdIdRef.current === tempId) createdIdRef.current = null
                        if (stableNoteIdRef.current === tempId) stableNoteIdRef.current = null
                    }
                } catch (e) {
                    pendingCreateRef.current = null
                    if (createdIdRef.current === tempId) createdIdRef.current = null
                    if (stableNoteIdRef.current === tempId) stableNoteIdRef.current = null
                    throw e
                }
            }
            setInitialTitle(title)
            setInitialContent(latestContent)
            savedContentRef.current = latestContent
            setDirty(false)
            setLastSavedAt(Date.now())
            try { window.dispatchEvent(new Event('note-saved')) } catch { }
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

    // Keep refs synced
    useEffect(() => { dirtyRef.current = dirty }, [dirty])
    useEffect(() => { loadingRef.current = loading }, [loading])

    // Autosave every 30s when dirty
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

    // Warn on nav if there's an unsaved NEW note
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

    // Detect dark mode and observe root class
    const [isDark, setIsDark] = React.useState<boolean>(() => {
        try {
            if (typeof document !== 'undefined') {
                if (document.documentElement.classList.contains('dark')) return true
                if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true
            }
        } catch { }
        return false
    })

    useEffect(() => {
        if (typeof document === 'undefined') return
        const root = document.documentElement
        const obs = new MutationObserver(() => {
            setIsDark(root.classList.contains('dark'))
        })
        obs.observe(root, { attributes: true, attributeFilter: ['class'] })
        return () => obs.disconnect()
    }, [])

    // Light/Dark CodeMirror themes
    const cmLightTheme = React.useMemo(() => EditorView.theme({
        '.cm-content': { caretColor: 'rgba(0,0,0,0.85)', fontFamily: 'inherit' },
        '.cm-scroller': { fontFamily: 'inherit' },
        '.cm-cursor': { display: 'block', borderLeft: 'none', width: '2px', backgroundColor: 'rgba(0,0,0,0.85)' },
        '.cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'rgba(59,130,246,0.25)' },
        '.cm-formatting, .cm-formatting-strong, .cm-formatting-quote, .cm-specialChar, .cm-punctuation, .cm-heading': { color: 'rgba(75,85,99,0.75)' }
    }, { dark: false }), [])

    const cmDarkTheme = React.useMemo(() => EditorView.theme({
        '.cm-content': { caretColor: 'rgba(255,255,255,0.92)', fontFamily: 'inherit' },
        '.cm-scroller': { fontFamily: 'inherit' },
        '.cm-cursor': { display: 'block', borderLeft: 'none', width: '2px', backgroundColor: 'rgba(255,255,255,0.92)' },
        '.cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'rgba(14,35,50,0.6)' },
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
                    loading={loading || !!pendingCreateRef.current || isSavingRef.current}
                    lastSavedAt={lastSavedAt}
                    dirty={dirty}
                    onSave={() => { if (!isSavingRef.current && !pendingCreateRef.current) handleSave() }}
                />
            </div>
        </div>
    )
})

export default Editor

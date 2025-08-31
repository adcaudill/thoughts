import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import Editor, { EditorHandle } from './components/Editor'
import NoteList from './components/NoteList'
import Auth from './components/Auth'
import Landing from './pages/Landing'
import Settings from './components/Settings'
import { loadSessionFromStorage, getNoteKey } from './lib/session'
import { getFolders } from './lib/api'

export default function App() {
    const [authed, setAuthed] = useState(false)
    const [, setSelectedNote] = useState<string | undefined>(undefined)
    const [selectedFolder, setSelectedFolder] = useState<string | undefined>(undefined)
    const [editingNote, setEditingNote] = useState<any | undefined>(undefined)
    const [refreshSignal, setRefreshSignal] = useState(0)
    const [collapsed, setCollapsed] = useState(false)
    const [showingAuth, setShowingAuth] = useState<'none' | 'login' | 'register'>('none')
    const [dirtyNoteIds, setDirtyNoteIds] = useState<Record<string, boolean>>({})
    const [focusMode, setFocusMode] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [settings, setSettings] = useState<any>({ editorFont: 'sans-serif', showWordCount: false, showReadingTime: false, focusCurrentParagraph: false, styleIssues: false, typewriterScrolling: false })
    const [zenHeaderVisible, setZenHeaderVisible] = useState(true)
    const hideTimerRef = React.useRef<number | null>(null)
    const editorRef = React.useRef<EditorHandle | null>(null)

    React.useEffect(() => { loadSessionFromStorage() }, [])

    // Load persisted settings if the session is valid. Try on mount and when auth changes.
    React.useEffect(() => {
        let mounted = true
        async function loadSettings() {
            try {
                const res = await (await import('./lib/api')).getSettings()
                if (!mounted) return
                if (res && res.ok) {
                    setSettings({ editorFont: 'sans-serif', showWordCount: false, showReadingTime: false, focusCurrentParagraph: false, styleIssues: false, typewriterScrolling: false, ...(res.settings || {}) })
                    setAuthed(true)
                }
            } catch {
                // ignore (not authed or endpoint unavailable)
            }
        }
        loadSettings()
        return () => { mounted = false }
    }, [])

    // Auto-collapse the sidebar on small screens and keep it responsive to resizes.
    React.useEffect(() => {
        function onResize() {
            try { setCollapsed(window.innerWidth < 640) } catch { }
        }
        onResize()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    // Keyboard shortcuts for focus mode
    React.useEffect(() => {
        function onKey(_e: KeyboardEvent) {
            const e = _e
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault()
                setFocusMode(v => !v)
            }
            if (e.key === 'Escape' && focusMode) {
                setFocusMode(false)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [focusMode])

    // Auto-save on focus mode toggle (debounced slightly to batch rapid toggles)
    React.useEffect(() => {
        const t = window.setTimeout(() => {
            try {
                if (editorRef.current && editorRef.current.isDirty()) {
                    editorRef.current.save()
                }
            } catch { }
        }, 150)
        return () => window.clearTimeout(t)
    }, [focusMode])

    // Zen header: hide after inactivity in focus mode; show on interaction
    React.useEffect(() => {
        if (!focusMode) {
            setZenHeaderVisible(true)
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
            return
        }

        function revealAndScheduleHide() {
            setZenHeaderVisible(true)
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
            hideTimerRef.current = window.setTimeout(() => setZenHeaderVisible(false), 2500)
        }

        // initial schedule when entering focus mode
        revealAndScheduleHide()

        const onMove = () => revealAndScheduleHide()
        const onScroll = () => revealAndScheduleHide()

        window.addEventListener('mousemove', onMove)
        window.addEventListener('touchstart', onMove, { passive: true })
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('touchstart', onMove)
            window.removeEventListener('scroll', onScroll)
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
        }
    }, [focusMode])

    return (
        <div className={`h-screen w-screen ${focusMode ? 'bg-white dark:bg-slate-950' : 'bg-white dark:bg-slate-950'} text-slate-900 dark:text-slate-100 safe-area overflow-hidden`}>
            {/* When logged out, keep a minimal landing with auth controls */}
            {!authed ? (
                <div className="h-full w-full flex flex-col">
                    <div className="p-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                        <div>
                            <h1 className="text-2xl font-semibold">thoughts</h1>
                            <p className="text-sm text-slate-500">private, end-to-end encrypted notes</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="px-3 py-1 rounded border" onClick={async () => {
                                try {
                                    loadSessionFromStorage()
                                    const noteKey = getNoteKey()
                                    if (noteKey) {
                                        const res = await getFolders()
                                        if (res && res.ok) {
                                            setAuthed(true)
                                            return
                                        }
                                    }
                                } catch { }
                                setShowingAuth('login')
                            }}>login</button>
                            <button className="px-3 py-1 rounded bg-slate-800 text-white" onClick={() => setShowingAuth('register')}>register</button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto p-6">
                        {showingAuth === 'none' ? (
                            <Landing />
                        ) : (
                            <Auth initialMode={showingAuth} onCancel={() => setShowingAuth('none')} onAuth={() => setAuthed(true)} />
                        )}
                    </div>
                </div>
            ) : (
                <div className="h-full w-full flex overflow-hidden">
                    {/* Left rail sidebar */}
                    {!focusMode && (
                        <aside className={`${collapsed ? 'w-14 w-12' : 'w-72'} shrink-0 h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden`}>
                            <div className="h-full flex flex-col">
                                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                    <button onClick={() => setCollapsed(c => !c)} aria-label="Toggle sidebar" className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-2 rounded">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 12h18"></path>
                                            <path d="M3 6h18"></path>
                                            <path d="M3 18h18"></path>
                                        </svg>
                                    </button>
                                    {!collapsed && (
                                        <div className="flex items-center gap-2">
                                            <button className="text-sm text-slate-600 dark:text-slate-300 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setSettingsOpen(true)}>Settings</button>
                                            <button
                                                className="text-sm px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
                                                onClick={() => setFocusMode(v => !v)}
                                                aria-pressed={focusMode}
                                                aria-label="Toggle focus mode"
                                            >Focus</button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 overflow-auto px-3 py-3">
                                    <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} onSelectFolder={(id?: string) => { setSelectedFolder(id) }} selectedFolder={selectedFolder} onCreateNote={() => { setEditingNote({ id: '', title: '', content: '' }); setSelectedNote(undefined) }} />
                                    {!collapsed && (
                                        <div className="mt-4">
                                            <NoteList folderId={selectedFolder} dirtyNoteIds={dirtyNoteIds} onSelect={async (note: any) => {
                                                try {
                                                    if (editorRef.current && editorRef.current.isDirty && editorRef.current.isDirty()) {
                                                        await editorRef.current.save()
                                                    }
                                                } catch { }
                                                setEditingNote(note)
                                                if (note.folder_id) setSelectedFolder(note.folder_id)
                                            }} refreshSignal={refreshSignal} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </aside>
                    )}

                    {/* Main writing pane */}
                    <section className={`flex-1 h-full flex ${focusMode ? 'justify-center' : ''} overflow-hidden`}>
                        <div className={`${focusMode ? 'w-full max-w-4xl' : 'w-full'} h-full flex flex-col min-h-0 overflow-hidden`}>
                            {focusMode && (
                                <div className={`sticky top-0 z-30 transition-opacity duration-200 ${zenHeaderVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                    <div className="px-4 py-2 flex items-center justify-between bg-white/95 dark:bg-slate-950/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
                                        <div className="text-sm text-slate-600 dark:text-slate-300">Focus mode</div>
                                        <div className="flex items-center gap-3">
                                            <span className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">Press Esc to exit</span>
                                            <button
                                                className="text-sm px-3 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                onClick={() => setFocusMode(false)}
                                                aria-label="Exit focus mode"
                                            >Exit</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="flex-1 min-h-0">
                                <Editor
                                    ref={editorRef}
                                    editorSettings={settings}
                                    focusMode={focusMode}
                                    editingNote={editingNote}
                                    onSaved={(createdId?: string) => {
                                        setRefreshSignal(v => v + 1)
                                        if (createdId) {
                                            setEditingNote((prev: any) => prev ? { ...prev, id: createdId } : prev)
                                        }
                                    }}
                                    onDeleted={() => { setRefreshSignal(v => v + 1); setEditingNote(undefined); setSelectedNote(undefined) }}
                                    onDirtyChange={(id: string, dirty: boolean) => {
                                        setDirtyNoteIds(prev => {
                                            const next = { ...prev }
                                            if (!id) return next
                                            if (dirty) next[id] = true
                                            else delete next[id]
                                            return next
                                        })
                                    }}
                                    layout="immersive"
                                />
                            </div>
                        </div>
                    </section>
                </div>
            )}
            <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={(s) => setSettings(s)} />
        </div>
    )
}

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
    const [settings, setSettings] = useState<any>({ editorFont: 'sans-serif', showWordCount: false, focusCurrentParagraph: false, styleIssues: false })
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
                    setSettings({ editorFont: 'sans-serif', showWordCount: false, focusCurrentParagraph: false, styleIssues: false, ...(res.settings || {}) })
                    setAuthed(true)
                }
            } catch (_e) {
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
        function onKey(e: KeyboardEvent) {
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
            } catch (_) { }
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
        <div className={`min-h-screen ${focusMode ? 'bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950' : 'bg-gray-50'} text-slate-900 safe-area`}>
            <header className={`${focusMode ? 'fixed top-0 left-0 right-0 z-20 transition-all duration-300 ' + (zenHeaderVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none') : ''} p-6 max-w-6xl mx-auto flex items-start justify-between ${focusMode ? 'bg-white/80 dark:bg-slate-900/60 backdrop-blur' : ''}`}>
                <div>
                    <h1 className="text-3xl font-semibold">thoughts</h1>
                    <p className="text-sm text-slate-500">private, end-to-end encrypted notes</p>
                </div>
                <nav>
                    <div className="flex items-center gap-2">
                        {authed && (
                            <button
                                className={`px-3 py-1 rounded border text-sm ${focusMode ? 'bg-slate-900 text-white border-slate-900' : ''}`}
                                onClick={() => setFocusMode(v => !v)}
                                aria-pressed={focusMode}
                                aria-label="Toggle focus mode"
                            >{focusMode ? 'Exit focus' : 'Focus'}</button>
                        )}
                        {authed && (
                            <button className={`px-3 py-1 rounded border text-sm ${focusMode ? 'bg-slate-900 text-white border-slate-900' : ''}`} onClick={() => setSettingsOpen(true)}>Settings</button>
                        )}
                        {!authed && (
                            <>
                                <button className="px-3 py-1 rounded border" onClick={async () => {
                                    // try to fast-path to the authed state if we have a stored note key and the server session is valid
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
                                    } catch (_e) {
                                        // ignore and fall through to show login
                                    }
                                    setShowingAuth('login')
                                }}>login</button>
                                <button className="px-3 py-1 rounded bg-slate-800 text-white" onClick={() => setShowingAuth('register')}>register</button>
                            </>
                        )}
                    </div>
                </nav>
            </header>

            <main className={`max-w-6xl mx-auto p-6 ${focusMode ? 'pt-24' : ''}`}>
                {!authed ? (
                    showingAuth === 'none' ? (
                        <Landing />
                    ) : (
                        <Auth initialMode={showingAuth} onCancel={() => setShowingAuth('none')} onAuth={() => setAuthed(true)} />
                    )
                ) : (
                    <div className={focusMode ? 'flex justify-center' : 'flex flex-col sm:flex-row gap-6'}>
                        {!focusMode && (
                            <aside className={collapsed ? 'w-12' : 'w-full sm:w-64'}>
                                <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} onSelectFolder={(id?: string) => { setSelectedFolder(id); }} selectedFolder={selectedFolder} onCreateNote={() => { setEditingNote({ id: '', title: '', content: '' }); setSelectedNote(undefined); }} />
                                {!collapsed && <NoteList folderId={selectedFolder} dirtyNoteIds={dirtyNoteIds} onSelect={async (note: any) => {
                                    try {
                                        if (editorRef.current && editorRef.current.isDirty && editorRef.current.isDirty()) {
                                            await editorRef.current.save()
                                        }
                                    } catch (e) {
                                        // ignore save errors for now but proceed to switch
                                    }
                                    setEditingNote(note)
                                    if (note.folder_id) setSelectedFolder(note.folder_id)
                                }} refreshSignal={refreshSignal} />}
                            </aside>
                        )}

                        <section className={focusMode ? 'w-full max-w-4xl' : 'flex-1'}>
                            <div className="grid grid-cols-1 gap-6">
                                <div className="col-span-1">
                                    <Editor
                                        ref={editorRef}
                                        editorSettings={settings}
                                        focusMode={focusMode}
                                        editingNote={editingNote}
                                        onSaved={(createdId?: string) => {
                                            // Refresh note list, but do NOT clear the editor state.
                                            setRefreshSignal(v => v + 1)
                                            // If the editor created a new note, attach the created id to the
                                            // existing editingNote so subsequent saves patch instead of creating.
                                            if (createdId) {
                                                setEditingNote((prev: any) => prev ? { ...prev, id: createdId } : prev)
                                            }
                                        }}
                                        onDeleted={() => { setRefreshSignal(v => v + 1); setEditingNote(undefined); setSelectedNote(undefined); }}
                                        onDirtyChange={(id: string, dirty: boolean) => {
                                            setDirtyNoteIds(prev => {
                                                const next = { ...prev }
                                                if (!id) return next
                                                if (dirty) next[id] = true
                                                else delete next[id]
                                                return next
                                            })
                                        }}
                                    />
                                </div>
                            </div>
                        </section>
                    </div>
                )}
            </main>
            <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={(s) => setSettings(s)} />
        </div>
    )
}

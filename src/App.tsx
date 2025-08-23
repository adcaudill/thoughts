import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import NoteList from './components/NoteList'
import Auth from './components/Auth'
import Landing from './pages/Landing'
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

    React.useEffect(() => { loadSessionFromStorage() }, [])

    // Auto-collapse the sidebar on small screens and keep it responsive to resizes.
    React.useEffect(() => {
        function onResize() {
            try { setCollapsed(window.innerWidth < 640) } catch { }
        }
        onResize()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    return (
        <div className="min-h-screen bg-gray-50 text-slate-900 safe-area">
            <header className="p-6 max-w-6xl mx-auto flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-semibold">thoughts</h1>
                    <p className="text-sm text-slate-500">private, end-to-end encrypted notes</p>
                </div>
                <nav>
                    {!authed && (
                        <div className="flex gap-2">
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
                        </div>
                    )}
                </nav>
            </header>

            <main className="max-w-6xl mx-auto p-6">
                {!authed ? (
                    showingAuth === 'none' ? (
                        <Landing />
                    ) : (
                        <Auth initialMode={showingAuth} onCancel={() => setShowingAuth('none')} onAuth={() => setAuthed(true)} />
                    )
                ) : (
                    <div className="flex flex-col sm:flex-row gap-6">
                        <aside className={collapsed ? 'w-12' : 'w-full sm:w-64'}>
                            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} onSelectFolder={(id?: string) => { setSelectedFolder(id); }} selectedFolder={selectedFolder} onCreateNote={() => { setEditingNote({ id: '', title: '', content: '' }); setSelectedNote(undefined); }} />
                            {!collapsed && <NoteList folderId={selectedFolder} dirtyNoteIds={dirtyNoteIds} onSelect={(note: any) => {
                                setEditingNote(note)
                                if (note.folder_id) setSelectedFolder(note.folder_id)
                            }} refreshSignal={refreshSignal} />}
                        </aside>

                        <section className="flex-1">
                            <div className="grid grid-cols-1 gap-6">
                                <div className="col-span-1">
                                    <Editor
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
        </div>
    )
}

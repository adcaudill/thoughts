import React, { useEffect, useState } from 'react'
import { decryptNotePayload, encryptNotePayload } from '../lib/crypto'
import { createFolder, updateFolder, deleteFolder, getFolders, getFolderStats } from '../lib/api'

type Folder = {
    id: string
    parent_id: string | null
    name_encrypted: string
    is_default: number
    goal_word_count?: number | null
}

function buildTree(folders: Folder[]) {
    const map = new Map<string, Folder & { children: any[] }>()
    for (const f of folders) map.set(f.id, { ...f, children: [] })
    const roots: Array<Folder & { children: any[] }> = []
    for (const f of map.values()) {
        if (f.parent_id && map.has(f.parent_id)) {
            map.get(f.parent_id)!.children.push(f)
        } else {
            roots.push(f)
        }
    }
    return roots
}

export default function Sidebar({ collapsed, onToggle, noteKey, onSelectFolder, selectedFolder, onCreateNote }: { collapsed?: boolean; onToggle?: () => void; noteKey?: string | null; onSelectFolder?: (id?: string) => void; selectedFolder?: string | undefined; onCreateNote?: () => void }) {
    const [folders, setFolders] = useState<Folder[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [newFolderName, setNewFolderName] = useState<string>('')

    async function loadFolders() {
        try {
            const j = await getFolders()
            if (!j.ok) {
                setError(j.error || 'failed')
                setFolders([])
                setNameDisplayMap({})
            } else {
                const f = j.folders || []
                setFolders(f)
                // Only fetch stats if any folder has a goal set (coerce possible string values)
                const hasGoals = f.some((x: any) => Number(x.goal_word_count) > 0)
                if (hasGoals) {
                    const statsRes = await getFolderStats().catch(() => ({ ok: false, stats: [] }))
                    const statMap: Record<string, number> = {}
                    if (statsRes && statsRes.ok && Array.isArray(statsRes.stats)) {
                        for (const s of statsRes.stats) statMap[s.id] = Number(s.total_words || 0)
                    }
                    setFolderWordTotals(statMap)
                } else {
                    setFolderWordTotals({})
                }
                // populate display names (decrypt if possible)
                const map: Record<string, string> = {}
                await Promise.all(f.map(async (folder: any) => {
                    if (folder.is_default === 1) {
                        map[folder.id] = 'Inbox'
                        return
                    }
                    const val = folder.name_encrypted || ''
                    if (noteKey && val.includes('.')) {
                        try {
                            const [nonceB64, cipherB64] = val.split('.')
                            const plain = await decryptNotePayload(noteKey, cipherB64, nonceB64)
                            map[folder.id] = plain || 'Untitled'
                        } catch {
                            map[folder.id] = val || 'Untitled'
                        }
                    } else {
                        map[folder.id] = val || 'Untitled'
                    }
                }))
                setNameDisplayMap(map)
            }
        } catch (err: any) {
            setError(err && err.message ? err.message : 'network error')
            setFolders([])
            setNameDisplayMap({})
        }
    }

    useEffect(() => { loadFolders() }, [])

    // Refresh stats after a note is saved so progress rings update live
    useEffect(() => {
        function onNoteSaved() {
            if (!folders || folders.length === 0) return
            const hasGoals = folders.some((x: any) => Number(x.goal_word_count) > 0)
            if (!hasGoals) return
            getFolderStats()
                .then((statsRes: any) => {
                    const statMap: Record<string, number> = {}
                    if (statsRes && statsRes.ok && Array.isArray(statsRes.stats)) {
                        for (const s of statsRes.stats) statMap[s.id] = Number(s.total_words || 0)
                    }
                    setFolderWordTotals(statMap)
                })
                .catch(() => { /* ignore */ })
        }
        window.addEventListener('note-saved', onNoteSaved)
        return () => window.removeEventListener('note-saved', onNoteSaved)
    }, [folders])

    const tree = folders ? buildTree(folders) : []

    // note: per current usage, folder display names are computed via `nameDisplayMap`.
    // If a future refactor needs on-demand decryption, reintroduce a helper here.

    const [editingMap, setEditingMap] = useState<Record<string, boolean>>({})
    const [nameMap, setNameMap] = useState<Record<string, string>>({})
    const [nameDisplayMap, setNameDisplayMap] = useState<Record<string, string>>({})
    const [goalMap, setGoalMap] = useState<Record<string, string>>({})
    const [folderWordTotals, setFolderWordTotals] = useState<Record<string, number>>({})

    function startEditing(id: string, current: string, currentGoal?: number | null) {
        setEditingMap(m => ({ ...m, [id]: true }))
        setNameMap(m => ({ ...m, [id]: current }))
        setGoalMap(m => ({ ...m, [id]: currentGoal != null ? String(currentGoal) : '' }))
    }

    function stopEditing(id: string) {
        setEditingMap(m => ({ ...m, [id]: false }))
    }

    function setNameFor(id: string, val: string) {
        setNameMap(m => ({ ...m, [id]: val }))
    }

    function setGoalFor(id: string, val: string) {
        // Only accept digits, empty string allowed for clearing
        const clean = val.replace(/[^0-9]/g, '')
        setGoalMap(m => ({ ...m, [id]: clean }))
    }

    function ProgressRing({ value, goal }: { value: number; goal?: number | null }) {
        const size = 18
        const stroke = 2
        const r = (size - stroke) / 2
        const c = 2 * Math.PI * r
        const pct = goal && goal > 0 ? Math.max(0, Math.min(1, value / goal)) : 0
        const offset = c * (1 - pct)
        return (
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
                <circle cx={size / 2} cy={size / 2} r={r} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
                <circle cx={size / 2} cy={size / 2} r={r} stroke="#3b82f6" strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
            </svg>
        )
    }

    async function createNewFolder() {
        const val = newFolderName.trim()
        if (!val) return
        let payloadName = val
        if (noteKey) {
            try {
                const enc = await encryptNotePayload(noteKey, val)
                payloadName = `${enc.nonce}.${enc.ciphertext}`
            } catch {
                payloadName = val
            }
        }
        await createFolder({ name_encrypted: payloadName })
        setNewFolderName('')
        await loadFolders()
    }

    function renderNode(node: any, depth = 0) {
        const editing = !!editingMap[node.id]
        const name = nameMap[node.id] ?? node.name_encrypted ?? ''
        const displayName = nameDisplayMap[node.id] ?? (node.is_default === 1 ? 'Inbox' : (node.name_encrypted || 'Untitled'))
        const totalWords = folderWordTotals[node.id] || 0
        const goal = node.goal_word_count ?? null
        return (
            <li key={node.id} className="py-1 px-2 rounded hover:bg-slate-50" style={{ paddingLeft: `${depth * 12}px` }}>
                <div className="flex items-center justify-between gap-2">
                    {editing ? (
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <i className="fa-regular fa-folder text-slate-400 w-4" aria-hidden="true" />
                                <input
                                    className="border dark:border-slate-800/30 p-1 text-sm w-full"
                                    value={name}
                                    onChange={e => setNameFor(node.id, e.target.value)}
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                            // save
                                            let payloadName = name
                                            if (noteKey) {
                                                try {
                                                    const enc = await encryptNotePayload(noteKey, name)
                                                    payloadName = `${enc.nonce}.${enc.ciphertext}`
                                                } catch { payloadName = name }
                                            }
                                            const goalStr = goalMap[node.id]
                                            const goalNum = goalStr === '' ? null : Number(goalStr)
                                            await updateFolder(node.id, { name_encrypted: payloadName, goal_word_count: goalNum })
                                            stopEditing(node.id)
                                            await loadFolders()
                                        } else if (e.key === 'Escape') {
                                            stopEditing(node.id)
                                        }
                                    }}
                                    autoFocus
                                    aria-label={`edit-folder-${node.id}`}
                                />
                            </div>
                            <div className="mt-2 pl-6">
                                <input
                                    className="border dark:border-slate-800/30 p-1 text-xs w-36"
                                    placeholder="Goal words"
                                    value={goalMap[node.id] ?? ''}
                                    onChange={e => setGoalFor(node.id, e.target.value)}
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                            let payloadName = name
                                            if (noteKey) {
                                                try {
                                                    const enc = await encryptNotePayload(noteKey, name)
                                                    payloadName = `${enc.nonce}.${enc.ciphertext}`
                                                } catch { payloadName = name }
                                            }
                                            const goalStr = goalMap[node.id]
                                            const goalNum = goalStr === '' ? null : Number(goalStr)
                                            await updateFolder(node.id, { name_encrypted: payloadName, goal_word_count: goalNum })
                                            stopEditing(node.id)
                                            await loadFolders()
                                        }
                                    }}
                                    aria-label={`edit-folder-goal-${node.id}`}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 truncate">
                            <i className="fa-regular fa-folder text-slate-400 w-4" aria-hidden="true" />
                            {node.is_default === 1 ? (
                                <button onClick={() => onSelectFolder && onSelectFolder(node.id)} className={`truncate text-left ${selectedFolder === node.id ? 'bg-slate-100 font-semibold rounded px-1' : ''}`} aria-label="inbox">Inbox</button>
                            ) : (
                                <button onClick={() => onSelectFolder && onSelectFolder(node.id)} className={`truncate text-left ${selectedFolder === node.id ? 'bg-slate-100 font-semibold rounded px-1' : ''}`} aria-label={`folder-${node.id}`}>{displayName}</button>
                            )}
                            {goal && goal > 0 ? (
                                <div className="ml-1 flex items-center gap-1 text-xs text-slate-500">
                                    <ProgressRing value={totalWords} goal={goal} />
                                    <span>{Math.min(totalWords, goal)}/{goal}</span>
                                </div>
                            ) : null}
                        </div>
                    )}
                    <div className="flex items-center gap-2 self-start">
                        {!editing && <button aria-label={`rename-${node.id}`} className="text-xs text-slate-500 flex items-center gap-1" onClick={() => startEditing(node.id, node.name_encrypted || '', node.goal_word_count ?? null)}><i className="fa-solid fa-pen-to-square" aria-hidden="true" /> <span className="sr-only">rename</span></button>}
                        {editing && <button aria-label={`save-${node.id}`} className="text-xs text-green-600 flex items-center gap-1" onClick={async () => { let payloadName = name; if (noteKey) { try { const enc = await encryptNotePayload(noteKey, name); payloadName = `${enc.nonce}.${enc.ciphertext}` } catch { payloadName = name } } const goalStr = goalMap[node.id]; const goalNum = goalStr === '' ? null : Number(goalStr); await updateFolder(node.id, { name_encrypted: payloadName, goal_word_count: goalNum }); stopEditing(node.id); await loadFolders() }}><i className="fa-solid fa-check" aria-hidden="true" /></button>}
                        {editing && <button aria-label={`cancel-${node.id}`} className="text-xs text-slate-500" onClick={() => stopEditing(node.id)}><i className="fa-solid fa-xmark" aria-hidden="true" /></button>}
                        {node.is_default !== 1 && <button aria-label={`delete-${node.id}`} className="text-xs text-red-600 flex items-center gap-1" onClick={async () => { if (!confirm('Delete folder? This will move notes to Inbox.')) return; await deleteFolder(node.id); await loadFolders() }}><i className="fa-solid fa-trash" aria-hidden="true" /></button>}
                    </div>
                </div>
                {node.children && node.children.length > 0 && (
                    <ul className="mt-1 space-y-1">
                        {node.children.map((c: any) => renderNode(c, depth + 1))}
                    </ul>
                )}
            </li>
        )
    }

    return (
        <div className="p-1 flex flex-col items-stretch max-h-full overflow-auto">
            {!collapsed ? (
                <div className="flex items-center justify-between mb-2 px-2">
                    <h2 className="font-medium text-sm tracking-wide text-slate-600">Folders</h2>
                    <button onClick={() => onToggle && onToggle()} className="text-sm text-slate-500 p-1" aria-label="Toggle sidebar">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12h18"></path>
                            <path d="M3 6h18"></path>
                            <path d="M3 18h18"></path>
                        </svg>
                    </button>
                </div>
            ) : null}

            {!collapsed ? (
                <div className="px-1">
                    {error && <div className="text-xs text-red-500 mb-2">{error}</div>}
                    {folders === null ? (
                        <div className="text-sm text-slate-500">Loading…</div>
                    ) : (
                        <div>
                            <div className="mb-2">
                                <div className="relative">
                                    <input aria-label="new-folder-name" placeholder="New folder name" className="border dark:border-slate-800/30 px-2 py-1.5 text-sm pr-10 w-full min-w-0 rounded" id="new-folder-input" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault()
                                            await createNewFolder()
                                        }
                                    }} />
                                    <button aria-label="create-folder" className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-slate-800 text-white px-2 py-1 text-xs rounded flex items-center justify-center disabled:opacity-50" disabled={newFolderName.trim() === ''} onClick={createNewFolder}>
                                        <i className="fa-solid fa-plus" aria-hidden="true"></i>
                                        <span className="sr-only">Create</span>
                                    </button>
                                </div>
                            </div>
                            <ul className="space-y-1.5 text-sm text-slate-700">
                                {tree.length === 0 ? <li className="py-1 px-2 text-slate-500">No folders</li> : tree.map(n => renderNode(n))}
                            </ul>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex sm:flex-col items-center gap-2 py-2">
                    <button onClick={() => onToggle && onToggle()} aria-label="Toggle sidebar" className="text-sm text-slate-500 p-3 rounded hover:bg-slate-700/10 w-10 h-10 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12h18"></path>
                            <path d="M3 6h18"></path>
                            <path d="M3 18h18"></path>
                        </svg>
                    </button>
                    <button onClick={() => onCreateNote && onCreateNote()} aria-label="New note" className="text-sm text-slate-500 p-3 rounded hover:bg-slate-700/10 w-10 h-10 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14"></path>
                            <path d="M5 12h14"></path>
                        </svg>
                    </button>
                </div>
            )}
        </div>
    )
}

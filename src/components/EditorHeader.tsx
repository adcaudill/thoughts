import React from 'react'

type Props = {
    title: string
    titleRef: React.Ref<HTMLInputElement>
    onTitleChange: (v: string) => void
    focusMode?: boolean
    selectedFolder?: string
    onFolderSelect: (id?: string) => void
    folders: Array<any>
    onDelete: () => void
    onOpenNoteInfo?: () => void
    onOpenHistory?: () => void
}

export default function EditorHeader({ title, titleRef, onTitleChange, focusMode, selectedFolder, onFolderSelect, folders, onDelete, onOpenNoteInfo, onOpenHistory }: Props) {
    const [menuOpen, setMenuOpen] = React.useState(false)
    const menuRef = React.useRef<HTMLDivElement | null>(null)
    const toggleRef = React.useRef<HTMLButtonElement | null>(null)
    const firstItemRef = React.useRef<HTMLButtonElement | null>(null)

    // Folder tree dropdown state
    const [folderMenuOpen, setFolderMenuOpen] = React.useState(false)
    const folderMenuRef = React.useRef<HTMLDivElement | null>(null)
    const folderToggleRef = React.useRef<HTMLButtonElement | null>(null)
    const [collapsedMap, setCollapsedMap] = React.useState<Record<string, boolean>>({})

    React.useEffect(() => {
        if (menuOpen) {
            // move focus to first menu item when opened
            setTimeout(() => firstItemRef.current?.focus(), 0)
        }
    }, [menuOpen])

    React.useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (!menuOpen) return
            if (e.key === 'Escape') {
                setMenuOpen(false)
                toggleRef.current?.focus()
            }
            if (e.key === 'Tab' && menuRef.current) {
                const nodes = menuRef.current.querySelectorAll<HTMLElement>('button[role="menuitem"], a[href], [tabindex]:not([tabindex="-1"])')
                if (!nodes || nodes.length === 0) return
                const list = Array.prototype.slice.call(nodes) as HTMLElement[]
                const idx = list.indexOf(document.activeElement as HTMLElement)
                if (e.shiftKey) {
                    if (idx === 0) {
                        e.preventDefault()
                        list[list.length - 1].focus()
                    }
                } else {
                    if (idx === list.length - 1) {
                        e.preventDefault()
                        list[0].focus()
                    }
                }
            }
        }

        function onMousedown(e: MouseEvent) {
            if (!menuOpen) return
            if (menuRef.current && !menuRef.current.contains(e.target as Node) && !toggleRef.current?.contains(e.target as Node)) {
                setMenuOpen(false)
            }
        }

        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('mousedown', onMousedown)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('mousedown', onMousedown)
        }
    }, [menuOpen])

    // Build a tree for nested dropdown
    const tree = React.useMemo(() => {
        if (!folders || folders.length === 0) return [] as Array<any>
        const map = new Map<string, any>()
        folders.forEach(f => map.set(f.id, { ...f, children: [] }))
        const roots: any[] = []
        for (const f of map.values()) {
            if (f.parent_id && map.has(f.parent_id)) map.get(f.parent_id)!.children.push(f)
            else roots.push(f)
        }
        const byOrder = (a: any, b: any) => (Number(a.order || 0) - Number(b.order || 0)) || String(a.displayName || a.name_encrypted || '').localeCompare(String(b.displayName || b.name_encrypted || ''))
        roots.sort(byOrder)
        for (const r of roots) r.children.sort(byOrder)
        return roots
    }, [folders])

    const selectedFolderName = React.useMemo(() => {
        const f = (folders || []).find((x: any) => x.id === selectedFolder)
        return f ? (f.displayName || f.name_encrypted || 'Untitled') : 'Select folder'
    }, [folders, selectedFolder])

    // Close folder menu on outside click or escape
    React.useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (!folderMenuOpen) return
            if (e.key === 'Escape') {
                setFolderMenuOpen(false)
                folderToggleRef.current?.focus()
            }
        }
        function onMousedown(e: MouseEvent) {
            if (!folderMenuOpen) return
            if (folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node) && !folderToggleRef.current?.contains(e.target as Node)) {
                setFolderMenuOpen(false)
            }
        }
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('mousedown', onMousedown)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('mousedown', onMousedown)
        }
    }, [folderMenuOpen])

    function toggleCollapsed(id: string) {
        setCollapsedMap(m => ({ ...m, [id]: !m[id] }))
    }

    function renderNode(node: any, depth = 0) {
        const hasChildren = node.children && node.children.length > 0
        const isCollapsed = !!collapsedMap[node.id]
        const name = node.is_default === 1 ? 'Inbox' : (node.displayName || node.name_encrypted || 'Untitled')
        return (
            <li key={node.id} className="px-1">
                <div className="flex items-center gap-2">
                    {hasChildren ? (
                        <button aria-label={`toggle-${node.id}`} className="text-slate-500 hover:text-slate-700" onClick={() => toggleCollapsed(node.id)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.1s' }}>
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                    ) : (
                        <span className="w-3" aria-hidden="true"></span>
                    )}
                    <button
                        role="menuitemradio"
                        aria-checked={selectedFolder === node.id}
                        className={`flex-1 text-left px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 ${selectedFolder === node.id ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                        style={{ paddingLeft: `${depth * 12}px` }}
                        onClick={() => { onFolderSelect(node.id); setFolderMenuOpen(false) }}
                    >
                        {name}
                    </button>
                </div>
                {hasChildren && !isCollapsed && (
                    <ul className="ml-4">
                        {node.children.map((c: any) => renderNode(c, depth + 1))}
                    </ul>
                )}
            </li>
        )
    }

    return (
        <div className="mb-3 md:mb-4 flex items-center justify-between">
            <div className="flex-1 flex items-center gap-4">
                <input
                    ref={titleRef}
                    value={title}
                    onChange={e => onTitleChange(e.target.value)}
                    className={`w-full ${focusMode ? 'text-3xl md:text-4xl' : 'text-xl'} font-semibold bg-transparent border-b dark:border-slate-800/30 pb-2 outline-none`}
                    placeholder="Untitled"
                />
                {!focusMode && (
                    <div className="relative">
                        {/* Visible tree dropdown trigger */}
                        <button
                            ref={folderToggleRef}
                            className="text-sm border dark:border-slate-800/30 rounded px-2 py-1 min-w-[10rem] flex items-center justify-between gap-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900"
                            onClick={() => setFolderMenuOpen(o => !o)}
                            aria-haspopup="true"
                            aria-expanded={folderMenuOpen}
                            aria-controls="folder-menu"
                        >
                            <span className="truncate max-w-[12rem] text-left">{selectedFolderName}</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        {folderMenuOpen && (
                            <div
                                ref={folderMenuRef}
                                id="folder-menu"
                                role="menu"
                                className="absolute z-20 mt-1 w-64 max-h-64 overflow-auto bg-white dark:bg-slate-900 border dark:border-slate-800/30 rounded shadow"
                            >
                                <ul className="py-1 text-sm">
                                    {tree.length === 0 ? (
                                        <li className="px-3 py-2 text-slate-500 dark:text-slate-400">No folders</li>
                                    ) : (
                                        tree.map(n => renderNode(n))
                                    )}
                                </ul>
                            </div>
                        )}
                        {/* Accessible fallback select for tests/screen readers */}
                        <div className="sr-only">
                            <label htmlFor="folder-select">select-folder</label>
                            <select id="folder-select" aria-label="select-folder" value={selectedFolder} onChange={e => onFolderSelect(e.target.value || undefined)}>
                                {(folders || []).map(f => (
                                    <option key={f.id} value={f.id}>{f.displayName || f.name_encrypted || 'Untitled'}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {!focusMode && (
                <div className="relative ml-4">
                    <button
                        ref={toggleRef}
                        id="editor-menu-button"
                        onClick={() => setMenuOpen(o => !o)}
                        className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                        aria-label="Open menu"
                        aria-haspopup="true"
                        aria-expanded={menuOpen}
                        aria-controls="editor-menu"
                    >
                        <i className="fa-solid fa-ellipsis-vertical" aria-hidden="true" />
                    </button>
                    {menuOpen && (
                        <div
                            ref={menuRef}
                            id="editor-menu"
                            role="menu"
                            aria-labelledby="editor-menu-button"
                            className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border dark:border-slate-800/30 rounded shadow-md z-10"
                        >
                            <button
                                ref={firstItemRef}
                                role="menuitem"
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-700"
                                onClick={() => { setMenuOpen(false); onOpenNoteInfo && onOpenNoteInfo() }}
                            >
                                <i className="fa-solid fa-circle-info mr-2" aria-hidden="true" />
                                <span className="font-medium">Note information</span>
                            </button>
                            <button
                                role="menuitem"
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-700"
                                onClick={() => { setMenuOpen(false); onOpenHistory && onOpenHistory() }}
                            >
                                <i className="fa-solid fa-clock-rotate-left mr-2" aria-hidden="true" />
                                <span className="font-medium">History</span>
                            </button>
                            <button
                                role="menuitem"
                                className="w-full text-left px-3 py-2 border-t border-slate-100/5 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-700"
                                onClick={() => { setMenuOpen(false); onDelete() }}
                            >
                                <i className="fa-solid fa-trash mr-2" aria-hidden="true" />
                                <span className="font-medium">Delete</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

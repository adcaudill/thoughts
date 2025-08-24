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
}

export default function EditorHeader({ title, titleRef, onTitleChange, focusMode, selectedFolder, onFolderSelect, folders, onDelete, onOpenNoteInfo }: Props) {
    const [menuOpen, setMenuOpen] = React.useState(false)
    const menuRef = React.useRef<HTMLDivElement | null>(null)
    const toggleRef = React.useRef<HTMLButtonElement | null>(null)
    const firstItemRef = React.useRef<HTMLButtonElement | null>(null)

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
                    <select
                        aria-label="select-folder"
                        className="text-sm border dark:border-slate-800/30 rounded px-2 py-1"
                        value={selectedFolder}
                        onChange={e => onFolderSelect(e.target.value || undefined)}
                        disabled={folders.length === 0}
                    >
                        {folders.map(f => <option key={f.id} value={f.id}>{f.displayName || f.name_encrypted || 'Untitled'}</option>)}
                    </select>
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
                        ☰
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

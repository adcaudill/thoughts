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
                    <button onClick={() => setMenuOpen(o => !o)} className="p-2 rounded hover:bg-slate-100" aria-label="Open menu">☰</button>
                    {menuOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-white border dark:border-slate-800/30 rounded shadow-md z-10">
                            <button className="w-full text-left px-3 py-2 hover:bg-slate-50" onClick={() => { setMenuOpen(false); onOpenNoteInfo && onOpenNoteInfo() }}>Note information</button>
                            <button className="w-full text-left px-3 py-2 hover:bg-slate-50" onClick={() => { setMenuOpen(false); onDelete() }}>Delete</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

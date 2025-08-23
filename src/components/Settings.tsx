import React, { useEffect, useState } from 'react'
import { getSettings, updateSettings } from '../lib/api'

type Props = { open: boolean; onClose: () => void; onSaved?: (settings: any) => void }

export default function Settings({ open, onClose, onSaved }: Props) {
    const [loading, setLoading] = useState(false)
    const [editorFont, setEditorFont] = useState<'sans-serif' | 'serif' | 'monospace'>('sans-serif')
    const [showWordCount, setShowWordCount] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [focusCurrentParagraph, setFocusCurrentParagraph] = useState(false)

    useEffect(() => {
        if (!open) return
        let mounted = true
        setLoading(true)
        getSettings().then((res: any) => {
            if (!mounted) return
            if (res && res.ok) {
                const s = res.settings || {}
                if (s.editorFont) setEditorFont(s.editorFont)
                if (typeof s.showWordCount === 'boolean') setShowWordCount(s.showWordCount)
                if (typeof s.focusCurrentParagraph === 'boolean') setFocusCurrentParagraph(s.focusCurrentParagraph)
                setDirty(false)
            }
        }).finally(() => { if (mounted) setLoading(false) })
        return () => { mounted = false }
    }, [open])

    async function save() {
        setLoading(true)
        const payload = { editorFont, showWordCount, focusCurrentParagraph }
        const res = await updateSettings(payload)
        setLoading(false)
        if (res && res.ok) {
            setDirty(false)
            if (onSaved) onSaved(res.settings)
            onClose()
        } else {
            // TODO: show error - for now just close
            onClose()
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/40" onClick={onClose}></div>
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6 z-50 w-full max-w-lg border border-gray-200 dark:border-slate-700 ring-1 ring-transparent dark:ring-transparent">
                <h2 className="text-lg font-semibold mb-4">Settings</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm mb-1">Editor font</label>
                        <select value={editorFont} onChange={e => { setEditorFont(e.target.value as any); setDirty(true) }} className="border rounded px-2 py-1">
                            <option value="sans-serif">Sans-serif (default)</option>
                            <option value="serif">Serif</option>
                            <option value="monospace">Monospace</option>
                        </select>
                        <p className="text-xs text-slate-500 mt-1">Controls the font used inside the editor.</p>
                    </div>
                    <div>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={showWordCount} onChange={e => { setShowWordCount(e.target.checked); setDirty(true) }} />
                            <span className="text-sm">Show word count</span>
                        </label>
                    </div>
                    <div>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={focusCurrentParagraph} onChange={e => { setFocusCurrentParagraph(e.target.checked); setDirty(true) }} />
                            <span className="text-sm">Focus current paragraph (dim others)</span>
                        </label>
                        <p className="text-xs text-slate-500 mt-1">Diminishes surrounding text while typing to help you focus on the active paragraph.</p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <button className="px-3 py-1 rounded border" onClick={onClose} disabled={loading}>Cancel</button>
                    <button className="px-3 py-1 rounded bg-slate-800 text-white" onClick={save} disabled={loading || !dirty}>{loading ? 'Saving…' : 'Save'}</button>
                </div>
            </div>
        </div>
    )
}

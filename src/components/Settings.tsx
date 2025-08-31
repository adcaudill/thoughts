import React, { useEffect, useState } from 'react'
import { getSettings, updateSettings } from '../lib/api'

type Props = { open: boolean; onClose: () => void; onSaved?: (settings: any) => void }

export default function Settings({ open, onClose, onSaved }: Props) {
    const [loading, setLoading] = useState(false)
    type EditorFont =
        | 'mono:jetbrains'
        | 'mono:ibm-plex'
        | 'mono:system'
        | 'serif:source-serif'
        | 'serif:merriweather'
        | 'serif:georgia'
        | 'sans:inter'
        | 'sans:system'
    const [editorFont, setEditorFont] = useState<EditorFont>('mono:jetbrains')
    const [showWordCount, setShowWordCount] = useState(false)
    const [showReadingTime, setShowReadingTime] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [focusCurrentParagraph, setFocusCurrentParagraph] = useState(false)
    const [styleIssues, setStyleIssues] = useState(false)
    const [typewriterScrolling, setTypewriterScrolling] = useState(false)

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
                if (typeof s.showReadingTime === 'boolean') setShowReadingTime(s.showReadingTime)
                if (typeof s.focusCurrentParagraph === 'boolean') setFocusCurrentParagraph(s.focusCurrentParagraph)
                if (typeof s.styleIssues === 'boolean') setStyleIssues(s.styleIssues)
                if (typeof s.typewriterScrolling === 'boolean') setTypewriterScrolling(s.typewriterScrolling)
                setDirty(false)
            }
        }).finally(() => { if (mounted) setLoading(false) })
        return () => { mounted = false }
    }, [open])

    async function save() {
        setLoading(true)
        const payload = { editorFont, showWordCount, showReadingTime, focusCurrentParagraph, styleIssues, typewriterScrolling }
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
                        <select value={editorFont} onChange={e => { setEditorFont(e.target.value as any); setDirty(true) }} className="border rounded px-2 py-1 w-full">
                            <optgroup label="Monospace">
                                <option value="mono:jetbrains">JetBrains Mono (default)</option>
                                <option value="mono:ibm-plex">IBM Plex Mono</option>
                                <option value="mono:system">System Monospace (SF Mono/Menlo/Monaco)</option>
                            </optgroup>
                            <optgroup label="Serif">
                                <option value="serif:source-serif">Source Serif</option>
                                <option value="serif:merriweather">Merriweather</option>
                                <option value="serif:georgia">Georgia (system)</option>
                            </optgroup>
                            <optgroup label="Sans-serif">
                                <option value="sans:inter">Inter</option>
                                <option value="sans:system">System Sans (SF/Segoe/Roboto)</option>
                            </optgroup>
                        </select>
                        <p className="text-xs text-slate-500 mt-1">Applies to the writing area. UI elements remain in their own fonts.</p>
                    </div>
                    <div>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={showWordCount} onChange={e => { setShowWordCount(e.target.checked); setDirty(true) }} />
                            <span className="text-sm">Show word count</span>
                        </label>
                    </div>
                    <div>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={showReadingTime} onChange={e => { setShowReadingTime(e.target.checked); setDirty(true) }} />
                            <span className="text-sm">Show reading time</span>
                        </label>
                        <p className="text-xs text-slate-500 mt-1">Display an estimated reading time for your note (based on ~200 words/min).</p>
                    </div>
                    <div>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={focusCurrentParagraph} onChange={e => { setFocusCurrentParagraph(e.target.checked); setDirty(true) }} />
                            <span className="text-sm">Focus current paragraph (dim others)</span>
                        </label>
                        <p className="text-xs text-slate-500 mt-1">Diminishes surrounding text while typing to help you focus on the active paragraph.</p>
                    </div>
                    <div>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={typewriterScrolling} onChange={e => { setTypewriterScrolling(e.target.checked); setDirty(true) }} />
                            <span className="text-sm">Typewriter scrolling</span>
                        </label>
                        <p className="text-xs text-slate-500 mt-1">Keeps the caret near the center of the viewport while you type.</p>
                    </div>
                    <div>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={styleIssues} onChange={e => { setStyleIssues(e.target.checked); setDirty(true) }} />
                            <span className="text-sm">Highlight style issues</span>
                        </label>
                        <p className="text-xs text-slate-500 mt-1">Visually strikes out words and phrases that are often considered weak or redundant in English writing. This is a display-only aid and does not change your note content.</p>
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

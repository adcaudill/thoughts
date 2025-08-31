import React, { useEffect, useState } from 'react'
import * as offline from '../lib/offlineApi'

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
    const [styleEnabled, setStyleEnabled] = useState({ weasel: true, redundancy: true, cliche: true, adverb: true, passive: true, longSentence: true, nominalization: true, expletive: true })
    const [longSentenceWordLimit, setLongSentenceWordLimit] = useState<number>(28)
    const [styleIgnores, setStyleIgnores] = useState<string>('')

    useEffect(() => {
        if (!open) return
        let mounted = true
        setLoading(true)
        offline.getSettings().then((res: any) => {
            if (!mounted) return
            if (res && res.ok) {
                const s = res.settings || {}
                if (s.editorFont) setEditorFont(s.editorFont)
                if (typeof s.showWordCount === 'boolean') setShowWordCount(s.showWordCount)
                if (typeof s.showReadingTime === 'boolean') setShowReadingTime(s.showReadingTime)
                if (typeof s.focusCurrentParagraph === 'boolean') setFocusCurrentParagraph(s.focusCurrentParagraph)
                if (typeof s.styleIssues === 'boolean') setStyleIssues(s.styleIssues)
                if (s.styleCheckOptions && typeof s.styleCheckOptions === 'object') {
                    const o: any = s.styleCheckOptions
                    if (o.enabled && typeof o.enabled === 'object') setStyleEnabled({ ...styleEnabled, ...o.enabled })
                    if (typeof o.longSentenceWordLimit === 'number') setLongSentenceWordLimit(o.longSentenceWordLimit)
                    if (Array.isArray(o.ignores)) setStyleIgnores(o.ignores.join(', '))
                }
                if (typeof s.typewriterScrolling === 'boolean') setTypewriterScrolling(s.typewriterScrolling)
                setDirty(false)
            }
        }).finally(() => { if (mounted) setLoading(false) })
        return () => { mounted = false }
    }, [open])

    async function save() {
        setLoading(true)
        const ignoresArr = styleIgnores.split(',').map(s => s.trim()).filter(Boolean)
        const payload = { editorFont, showWordCount, showReadingTime, focusCurrentParagraph, styleIssues, typewriterScrolling, styleCheckOptions: { enabled: styleEnabled, longSentenceWordLimit, ignores: ignoresArr } }
        const res = await offline.updateSettings(payload)
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
                        {styleIssues && (
                            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={styleEnabled.weasel} onChange={e => { setStyleEnabled({ ...styleEnabled, weasel: e.target.checked }); setDirty(true) }} /> Weasel words
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={styleEnabled.redundancy} onChange={e => { setStyleEnabled({ ...styleEnabled, redundancy: e.target.checked }); setDirty(true) }} /> Redundancies
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={styleEnabled.cliche} onChange={e => { setStyleEnabled({ ...styleEnabled, cliche: e.target.checked }); setDirty(true) }} /> Clichés
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={styleEnabled.adverb} onChange={e => { setStyleEnabled({ ...styleEnabled, adverb: e.target.checked }); setDirty(true) }} /> Adverbs
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={styleEnabled.passive} onChange={e => { setStyleEnabled({ ...styleEnabled, passive: e.target.checked }); setDirty(true) }} /> Passive voice
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={styleEnabled.longSentence} onChange={e => { setStyleEnabled({ ...styleEnabled, longSentence: e.target.checked }); setDirty(true) }} /> Long sentences
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={styleEnabled.nominalization} onChange={e => { setStyleEnabled({ ...styleEnabled, nominalization: e.target.checked }); setDirty(true) }} /> Nominalizations
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={styleEnabled.expletive} onChange={e => { setStyleEnabled({ ...styleEnabled, expletive: e.target.checked }); setDirty(true) }} /> Expletives (There is/It is … that)
                                </label>
                                <div className="col-span-2 flex items-center gap-2">
                                    <label className="text-sm min-w-[12rem]">Long sentence word limit</label>
                                    <input type="number" className="border rounded px-2 py-1 w-24" value={longSentenceWordLimit} min={5} max={200} onChange={e => { setLongSentenceWordLimit(Number(e.target.value)); setDirty(true) }} />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm mb-1">Ignore phrases (comma-separated)</label>
                                    <input type="text" className="border rounded px-2 py-1 w-full" value={styleIgnores} onChange={e => { setStyleIgnores(e.target.value); setDirty(true) }} placeholder="actually, in order to, end result" />
                                </div>
                            </div>
                        )}
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

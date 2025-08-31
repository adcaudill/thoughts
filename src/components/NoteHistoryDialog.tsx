import React, { useEffect, useState } from 'react'
import { listNoteVersions, restoreNoteVersion, getNoteVersion, getNote } from '../lib/api'
import { getNoteKey } from '../lib/session'
import { decryptNotePayload } from '../lib/crypto'

export default function NoteHistoryDialog({ open, noteId, onClose }: { open: boolean; noteId?: string; onClose: () => void }) {
    const [versions, setVersions] = useState<Array<any>>([])
    const [loading, setLoading] = useState(false)
    const [restoring, setRestoring] = useState<string | null>(null)
    const [previewText, setPreviewText] = useState<string>('')
    const [currentText, setCurrentText] = useState<string>('')
    const [diffLines, setDiffLines] = useState<Array<{ type: 'ctx' | 'add' | 'del'; text: string }>>([])

    useEffect(() => {
        if (!open || !noteId) return
        let mounted = true
            ; (async () => {
                setLoading(true)
                try {
                    // Load versions
                    const [resVersions, resNote] = await Promise.all([
                        listNoteVersions(noteId),
                        getNote(noteId),
                    ])
                    if (mounted && resVersions && resVersions.ok) setVersions(resVersions.versions || [])

                    // Decrypt current note content for diffing
                    if (mounted && resNote && resNote.ok && resNote.note) {
                        const n = resNote.note
                        const key = getNoteKey()
                        if (key && n.content_encrypted && n.nonce) {
                            try {
                                const plain = await decryptNotePayload(key, n.content_encrypted, n.nonce)
                                try {
                                    const obj = JSON.parse(plain)
                                    const text = (obj && obj.content) ? String(obj.content) : (typeof obj === 'string' ? obj : '')
                                    setCurrentText(text)
                                } catch {
                                    setCurrentText(String(plain))
                                }
                            } catch {
                                setCurrentText('')
                            }
                        }
                    }
                } finally { if (mounted) setLoading(false) }
            })()
        return () => { mounted = false }
    }, [open, noteId])

    async function restore(id: string) {
        if (!noteId) return
        setRestoring(id)
        try { await restoreNoteVersion(noteId, id) } finally { setRestoring(null); onClose() }
    }

    async function preview(id: string) {
        if (!noteId) return
        try {
            const res = await getNoteVersion(noteId, id)
            if (res && res.ok && res.version) {
                const v = res.version
                let snippet = ''
                const key = getNoteKey()
                if (key && v.content_encrypted && v.nonce) {
                    try {
                        const plain = await decryptNotePayload(key, v.content_encrypted, v.nonce)
                        try {
                            const obj = JSON.parse(plain)
                            const text = (obj && obj.content) ? String(obj.content) : (typeof obj === 'string' ? obj : '')
                            snippet = text.trim().split(/\n/).slice(0, 8).join('\n')
                        } catch {
                            snippet = String(plain).trim().split(/\n/).slice(0, 8).join('\n')
                        }
                    } catch {
                        // decryption failed; fall back to raw
                        snippet = JSON.stringify(v).slice(0, 200)
                    }
                } else {
                    snippet = JSON.stringify(v).slice(0, 200)
                }
                setPreviewText(snippet)
                setDiffLines([])
            }
        } catch { setPreviewText('') }
    }

    // Simple line-based diff using LCS
    function computeLineDiff(aText: string, bText: string): Array<{ type: 'ctx' | 'add' | 'del'; text: string }> {
        const a = (aText || '').split('\n')
        const b = (bText || '').split('\n')
        const n = a.length
        const m = b.length
        const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1
                else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
            }
        }
        const out: Array<{ type: 'ctx' | 'add' | 'del'; text: string }> = []
        let i = 0, j = 0
        while (i < n && j < m) {
            if (a[i] === b[j]) { out.push({ type: 'ctx', text: a[i] }); i++; j++; }
            else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i++; }
            else { out.push({ type: 'add', text: b[j] }); j++; }
        }
        while (i < n) { out.push({ type: 'del', text: a[i++] }) }
        while (j < m) { out.push({ type: 'add', text: b[j++] }) }
        return out
    }

    async function previewDiff(id: string) {
        if (!noteId) return
        try {
            const res = await getNoteVersion(noteId, id)
            if (res && res.ok && res.version) {
                const v = res.version
                const key = getNoteKey()
                let versionText = ''
                if (key && v.content_encrypted && v.nonce) {
                    try {
                        const plain = await decryptNotePayload(key, v.content_encrypted, v.nonce)
                        try {
                            const obj = JSON.parse(plain)
                            versionText = (obj && obj.content) ? String(obj.content) : (typeof obj === 'string' ? obj : '')
                        } catch { versionText = String(plain) }
                    } catch { versionText = '' }
                }
                const lines = computeLineDiff(versionText, currentText)
                setDiffLines(lines)
                setPreviewText('')
            }
        } catch { setDiffLines([]) }
    }

    if (!open) return null
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative z-10 w-full max-w-lg max-h-[85vh] bg-white dark:bg-slate-800 rounded shadow-lg overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-semibold">Version history</h3>
                    <button className="text-slate-500" onClick={onClose} aria-label="Close">✕</button>
                </div>
                <div className="p-4 overflow-y-auto">
                    {loading ? <div className="text-sm text-slate-500">Loading		…</div> : (
                        <ul className="space-y-1 text-sm">
                            {versions.map((v: any) => (
                                <li key={v.id} className="py-1 px-2 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                    <div>
                                        <div>{new Date(v.created_at).toLocaleString()}</div>
                                        <div className="text-xs text-slate-500">{v.reason || 'autosave'} · {v.word_count ?? 0} words</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button className="text-xs px-2 py-0.5 rounded border" onClick={() => preview(v.id)}>Preview</button>
                                        <button className="text-xs px-2 py-0.5 rounded border" onClick={() => previewDiff(v.id)}>Diff</button>
                                        <button className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white disabled:opacity-50" disabled={restoring === v.id} onClick={() => restore(v.id)}>{restoring === v.id ? 'Restoring…' : 'Restore'}</button>
                                    </div>
                                </li>
                            ))}
                            {versions.length === 0 && <li className="py-1 px-2 text-slate-500">No versions</li>}
                        </ul>
                    )}
                    {previewText && (
                        <div className="mt-3 p-2 rounded bg-slate-50 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
                            {previewText}
                        </div>
                    )}
                    {diffLines.length > 0 && (
                        <div className="mt-3 p-2 rounded bg-slate-50 dark:bg-slate-900 text-xs whitespace-pre-wrap break-words font-mono">
                            {diffLines.map((l, idx) => (
                                <div key={idx} className={l.type === 'add' ? 'text-green-700' : l.type === 'del' ? 'text-red-700' : 'text-slate-600'}>
                                    {l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}{l.text}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

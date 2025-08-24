import React from 'react'

type Props = {
    open: boolean
    onClose: () => void
    words: number
    sentences: number
    syllables: number
    characters: number
    fleschScore: number | null
    fleschKincaid: number | null
    automatedReadabilityIndex: number | null
    readingTimeMin: number | null
    readingDifficulty: string | null
}

export default function NoteInfoDialog({ open, onClose, words, sentences, syllables, characters, fleschScore, fleschKincaid, automatedReadabilityIndex, readingTimeMin, readingDifficulty }: Props) {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative z-10 w-full max-w-xl bg-white dark:bg-slate-800 rounded shadow-lg p-6">
                <div className="flex items-start justify-between">
                    <h3 className="text-lg font-semibold">Note information</h3>
                    <button aria-label="Close" onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
                </div>

                <div className="mt-4 text-sm text-slate-700 dark:text-slate-200 space-y-2">
                    <div>Words: {words}</div>
                    <div>Sentences: {sentences}</div>
                    <div>Characters (no spaces): {characters}</div>
                    <div>Syllables: {syllables}</div>
                    <div>Flesch Reading Ease: {fleschScore != null ? fleschScore.toFixed(1) : '—'}</div>
                    <div>Flesch–Kincaid Grade Level: {fleschKincaid != null ? fleschKincaid.toFixed(1) : '—'}</div>
                    <div>Automated Readability Index: {automatedReadabilityIndex != null ? automatedReadabilityIndex.toFixed(1) : '—'}</div>
                    <div>Estimated reading time: {readingTimeMin != null ? `${readingTimeMin} min` : '—'}{readingDifficulty ? ` (${readingDifficulty})` : ''}</div>
                </div>

                <div className="mt-6 text-right">
                    <button onClick={onClose} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700">Close</button>
                </div>
            </div>
        </div>
    )
}

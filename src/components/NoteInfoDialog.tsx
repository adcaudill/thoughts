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
                    <div>
                        <h3 className="text-lg font-semibold">Note information</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Quick metrics and readability scores to help you understand this note's complexity.</p>
                    </div>
                    <button aria-label="Close" onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
                </div>

                <div className="mt-4 text-sm text-slate-700 dark:text-slate-200">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 items-start">
                        <div className="font-medium">Words</div>
                        <div className="text-right">{words}</div>

                        <div className="font-medium">Sentences</div>
                        <div className="text-right">{sentences}</div>

                        <div className="font-medium">Characters (no spaces)</div>
                        <div className="text-right">{characters}</div>

                        <div className="font-medium">Syllables</div>
                        <div className="text-right">{syllables}</div>

                        <div className="font-medium">Flesch Reading Ease</div>
                        <div className="text-right">{fleschScore != null ? fleschScore.toFixed(1) : '—'}</div>
                        <div className="col-span-2 text-xs text-slate-500 dark:text-slate-400">Higher is easier to read (0–100). Scores &gt;60 are typically considered plain/standard English; lower scores indicate more complex text.</div>

                        <div className="font-medium">Flesch–Kincaid Grade</div>
                        <div className="text-right">{fleschKincaid != null ? fleschKincaid.toFixed(1) : '—'}</div>
                        <div className="col-span-2 text-xs text-slate-500 dark:text-slate-400">Estimates U.S. school grade level required to understand the text (lower is easier).</div>

                        <div className="font-medium">Automated Readability Index (ARI)</div>
                        <div className="text-right">{automatedReadabilityIndex != null ? automatedReadabilityIndex.toFixed(1) : '—'}</div>
                        <div className="col-span-2 text-xs text-slate-500 dark:text-slate-400">Another grade-level metric based primarily on characters per word and words per sentence; useful as a cross-check with Flesch–Kincaid.</div>

                        <div className="font-medium">Estimated reading time</div>
                        <div className="text-right">{readingTimeMin != null ? `${readingTimeMin} min` : '—'}{readingDifficulty ? ` (${readingDifficulty})` : ''}</div>
                        <div className="col-span-2 text-xs text-slate-500 dark:text-slate-400">Based on word count and reading difficulty; use as a rough guide — individual reading speed varies.</div>
                    </div>
                </div>

                <div className="mt-6 text-right">
                    <button onClick={onClose} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700">Close</button>
                </div>
            </div>
        </div>
    )
}

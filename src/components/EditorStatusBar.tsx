import React from 'react'

type Props = {
    editorSettings?: any
    words: number
    readingTimeMin: number | null
    readingDifficulty: string | null
    fleschScore: number | null
    loading: boolean
    lastSavedAt: number | null
    dirty: boolean
    onSave: () => void
}

export default function EditorStatusBar({ editorSettings, words, readingTimeMin, readingDifficulty, fleschScore, loading, lastSavedAt, dirty, onSave }: Props) {
    return (
        <div className="editor-statusbar mt-3 sm:mt-4 flex-none flex items-center gap-4 justify-between sticky bottom-0 z-20 bg-white/95 dark:bg-slate-950/90 backdrop-blur border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-4">
                {editorSettings && (editorSettings.showWordCount || editorSettings.showReadingTime) && (
                    <div className="text-sm text-slate-500 dark:text-slate-300 flex items-center gap-3">
                        {editorSettings.showWordCount && (
                            <div>Words: {words}</div>
                        )}
                        {editorSettings.showReadingTime && (
                            <div title={fleschScore != null ? `Flesch Reading Ease: ${fleschScore.toFixed(1)}` : undefined}>
                                Read: {readingTimeMin ?? Math.ceil(words / 200)} min{readingDifficulty ? ` (${readingDifficulty})` : ''}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-4">
                <div className="text-sm mr-2 text-slate-500 dark:text-slate-300">
                    {loading ? 'Saving…' : (lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : '')}
                </div>
                <button
                    className={`px-4 py-2 rounded transition-colors duration-150 ${dirty && !loading ? 'bg-slate-800 text-white hover:bg-slate-700 dark:bg-sky-600 dark:hover:bg-sky-700 dark:text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}
                    onClick={() => onSave()}
                    disabled={!dirty || loading}
                >
                    Save
                </button>
            </div>
        </div>
    )
}

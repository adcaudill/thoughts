import { useEffect, useState } from 'react'

export function computeWordCount(md: string) {
    const t = String(md || '')
        .replace(/```[\s\S]*?```/g, ' ') // fenced code
        .replace(/`[^`]*`/g, ' ') // inline code
        .replace(/\[[^\]]*\]\([^)]*\)/g, ' ') // links/images
        .replace(/[>#*_\-\[\]()`~]/g, ' ') // punctuation
        .replace(/\s+/g, ' ').trim()
    if (!t) return 0
    return t.split(' ').length
}

type Difficulty = 'very easy' | 'standard' | 'difficult' | 'very difficult'

function estimate(words: number, flesch: number): { minutes: number, label: Difficulty } {
    let wpm: number
    let label: Difficulty
    if (flesch > 80) { wpm = 250; label = 'very easy' }
    else if (flesch > 60) { wpm = 200; label = 'standard' }
    else if (flesch > 30) { wpm = 150; label = 'difficult' }
    else { wpm = 75; label = 'very difficult' }
    const minutes = Math.ceil(words / Math.max(1, wpm))
    return { minutes, label }
}

export function useReadingStats(content: string, enabled: boolean) {
    const [readingTimeMin, setReadingTimeMin] = useState<number | null>(null)
    const [readingDifficulty, setReadingDifficulty] = useState<Difficulty | null>(null)
    const [fleschScore, setFleschScore] = useState<number | null>(null)

    const words = computeWordCount(content)

    useEffect(() => {
        if (!enabled) { setReadingTimeMin(null); setReadingDifficulty(null); setFleschScore(null); return }
        if (!words) { setReadingTimeMin(0); setReadingDifficulty(null); setFleschScore(null); return }
        let cancelled = false
        const t = window.setTimeout(async () => {
            try {
                const mod = await import('text-readability') as any
                const rs = (mod && mod.default) ? mod.default : mod
                const flesch = (rs && typeof rs.fleschReadingEase === 'function') ? rs.fleschReadingEase(String(content || '')) : null
                if (cancelled) return
                if (typeof flesch === 'number' && isFinite(flesch)) {
                    const est = estimate(words, flesch)
                    setReadingTimeMin(est.minutes)
                    setReadingDifficulty(est.label)
                    setFleschScore(flesch)
                } else {
                    setReadingTimeMin(Math.ceil(words / 200))
                    setReadingDifficulty(null)
                    setFleschScore(null)
                }
            } catch {
                if (cancelled) return
                setReadingTimeMin(Math.ceil(words / 200))
                setReadingDifficulty(null)
                setFleschScore(null)
            }
        }, 2000)
        return () => { cancelled = true; window.clearTimeout(t) }
    }, [content, enabled, words])

    return { words, readingTimeMin, readingDifficulty, fleschScore }
}

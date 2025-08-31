export type IssueCategory =
    | 'weasel'
    | 'redundancy'
    | 'cliche'
    | 'adverb'
    | 'passive'
    | 'longSentence'
    | 'nominalization'
    | 'expletive'

export type Issue = {
    from: number
    to: number
    category: IssueCategory
    message: string
}

export type StyleCheckOptions = {
    longSentenceWordLimit?: number
    skipMarkdown?: boolean
    enabled?: Partial<Record<IssueCategory, boolean>>
    ignores?: string[]
}

const DEFAULTS: Required<Pick<StyleCheckOptions, 'longSentenceWordLimit' | 'skipMarkdown'>> = {
    longSentenceWordLimit: 30,
    skipMarkdown: true,
}

function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildIgnoreRegex(ignores: string[] | undefined) {
    if (!ignores || !ignores.length) return null
    const parts = ignores.map(escapeRegex)
    return new RegExp(parts.join('|'), 'gi')
}

// Basic English lists (compact; can grow later)
const WEASEL = [
    'actually', 'basically', 'pretty much', 'sort of', 'kind of', 'really', 'very', 'quite', 'rather', 'somewhat', 'just', 'literally', 'probably', 'maybe', 'likely', 'possibly', 'generally', 'typically', 'virtually'
]

const REDUNDANCIES = [
    'advance planning', 'added bonus', 'close proximity', 'end result', 'free gift', 'final outcome', 'past history', 'plan ahead', 'revert back', 'unexpected surprise', 'true facts', 'fall down', 'combine together', 'join together', 'each and every', 'absolutely essential', 'past experience'
]

const CLICHES = [
    'against all odds', 'at the end of the day', 'back to square one', 'ballpark figure', 'big picture', 'crystal clear', 'dead as a doornail', 'in the nick of time', 'light at the end of the tunnel', 'long and short of it', 'low[-\s]?hanging fruit', 'move the needle', 'needle in a haystack', 'think outside the box', 'tip of the iceberg', 'touch base', 'under the radar', 'brass tacks', 'win[-\s]?win', 'paradigm shift', 'boil the ocean', 'synergy', 'bring to the table', 'hit the ground running'
]

const ADVERB_EXCEPTIONS = [
    'only', 'family', 'early', 'friendly', 'holy', 'july', 'italy', 'silly', 'bully', 'belly', 'jelly', 'rally', 'apply', 'supply', 'rely', 'reply'
]

const PASSIVE_BE = ['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']
const PASSIVE_PARTICIPLES = ['known', 'given', 'taken', 'shown', 'seen', 'made', 'born', 'built', 'bought', 'caught', 'felt', 'found', 'kept', 'left', 'lost', 'paid', 'put', 'read', 'sold', 'sent', 'set', 'told', 'won', 'worn', 'torn', 'written', 'thrown', 'driven', 'eaten']

function maskMarkdown(text: string): string {
    // Replace MD constructs with spaces to preserve indices
    const replacer = (m: string) => ' '.repeat(m.length)
    return text
        // fenced code
        .replace(/```[\s\S]*?```/g, replacer)
        // inline code
        .replace(/`[^`]*`/g, replacer)
        // links/images
        .replace(/!\[[^\]]*\]\([^)]*\)/g, replacer)
        .replace(/\[[^\]]*\]\([^)]*\)/g, replacer)
        // raw URLs
        .replace(/https?:\/\/\S+/g, replacer)
        // headings
        .replace(/^#{1,6}\s.*$/gm, replacer)
        // blockquotes (optional)
        .replace(/^>\s.*$/gm, replacer)
}

function wordCount(s: string) {
    const t = s.replace(/[^A-Za-z0-9'\-\s]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!t) return 0
    return t.split(' ').length
}

function findByRegex(
    text: string,
    pattern: RegExp,
    category: IssueCategory,
    messageFor: (m: RegExpExecArray) => string,
    base = 0
): Issue[] {
    const out: Issue[] = []
    pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(text))) {
        const from = base + m.index
        const to = from + m[0].length
        out.push({ from, to, category, message: messageFor(m) })
        if (pattern.lastIndex === m.index) pattern.lastIndex++ // avoid zero-length loops
    }
    return out
}

export function findStyleIssues(text: string, opts?: StyleCheckOptions, baseFrom = 0): Issue[] {
    const options: Required<StyleCheckOptions> = {
        longSentenceWordLimit: opts?.longSentenceWordLimit ?? DEFAULTS.longSentenceWordLimit,
        skipMarkdown: opts?.skipMarkdown ?? DEFAULTS.skipMarkdown,
        enabled: { weasel: true, redundancy: true, cliche: true, adverb: true, passive: true, longSentence: true, nominalization: true, expletive: true, ...(opts?.enabled || {}) },
        ignores: opts?.ignores || [],
    }

    const ignoresRx = buildIgnoreRegex(options.ignores)
    const source = options.skipMarkdown ? maskMarkdown(text) : text
    const issues: Issue[] = []

    const pushFiltered = (arr: Issue[]) => {
        if (!arr || !arr.length) return
        if (!ignoresRx) { issues.push(...arr); return }
        for (const it of arr) {
            const frag = text.slice(it.from - baseFrom, it.to - baseFrom)
            if (ignoresRx.test(frag)) continue
            issues.push(it)
        }
    }

    // Nominalizations (generic suffix-based heuristic)
    if (options.enabled.nominalization) {
        const rx = /\b([A-Za-z]{5,}?(?:tion|sion|ment|ance|ence|ity|ness|ization|alization))\b/gi
        pushFiltered(findByRegex(source, rx, 'nominalization', m => `Nominalization: “${m[1]}” — consider a simpler verb or phrasing.`, baseFrom))
    }

    // Expletive constructions: "There is/are/was/were ..." or "It is/was ... that"
    if (options.enabled.expletive) {
        const rx1 = /\bThere\s+(?:is|are|was|were)\b/gi
        const rx2 = /\bIt\s+(?:is|was)(?=\s+[^.!?]{0,50}\bthat\b)/gi
        pushFiltered(findByRegex(source, rx1, 'expletive', () => `Expletive construction: “There is/are …” — try subject-first.`, baseFrom))
        pushFiltered(findByRegex(source, rx2, 'expletive', () => `Expletive construction: “It is … that …” — try a direct subject.`, baseFrom))
    }

    // Weasel
    if (options.enabled.weasel) {
        const parts = WEASEL.map(w => `\\b${escapeRegex(w).replace(/\\\s\+/g, '\\s+')}\\b`)
        const rx = new RegExp(parts.join('|'), 'gi')
        pushFiltered(findByRegex(source, rx, 'weasel', m => `Weasel word: “${m[0]}” — consider removing or being specific.`, baseFrom))
    }

    // Redundancy
    if (options.enabled.redundancy) {
        const parts = REDUNDANCIES.map(w => `\\b${escapeRegex(w).replace(/\\\s\+/g, '\\s+')}\\b`)
        const rx = new RegExp(parts.join('|'), 'gi')
        pushFiltered(findByRegex(source, rx, 'redundancy', m => `Redundancy: “${m[0]}” — trim one of the words.`, baseFrom))
    }

    // Cliche
    if (options.enabled.cliche) {
        const rx = new RegExp(CLICHES.join('|'), 'gi')
        pushFiltered(findByRegex(source, rx, 'cliche', m => `Cliché: “${m[0]}” — consider a fresher expression.`, baseFrom))
    }

    // Adverbs
    if (options.enabled.adverb) {
        const rx = /\b([A-Za-z]{3,}ly)\b/gi
        pushFiltered(findByRegex(source, rx, 'adverb', m => {
            const w = (m[1] || '').toLowerCase()
            if (ADVERB_EXCEPTIONS.includes(w)) return '' // we will filter later by empty message
            return `Adverb: “${m[1]}” — consider a stronger verb or concise phrasing.`
        }, baseFrom).filter(i => i.message))
    }

    // Passive voice (heuristic)
    if (options.enabled.passive) {
        const be = PASSIVE_BE.join('|')
        const irregular = PASSIVE_PARTICIPLES.join('|')
        const rx = new RegExp(`\\b(?:${be})\\s+(?:[A-Za-z]+?(?:ed|en)|(?:${irregular}))\\b`, 'gi')
        pushFiltered(findByRegex(source, rx, 'passive', m => `Passive voice: “${m[0]}” — active voice is often clearer.`, baseFrom))
    }

    // Long sentences
    if (options.enabled.longSentence && options.longSentenceWordLimit > 0) {
        // Walk sentences naïvely within this text block
        // We maintain indices by scanning char by char and splitting on ., !, ? followed by space/newline or end
        const ends: number[] = []
        for (let i = 0; i < source.length; i++) {
            const ch = source[i]
            if (ch === '.' || ch === '!' || ch === '?') {
                // lookahead for end of sentence
                let j = i + 1
                while (j < source.length && /[\)\]\"'\s]/.test(source[j])) j++
                ends.push(j)
            }
        }
        let start = 0
        const pushSentence = (sFrom: number, sTo: number) => {
            if (sTo <= sFrom) return
            const seg = source.slice(sFrom, sTo)
            const count = wordCount(seg)
            if (count > options.longSentenceWordLimit) {
                issues.push({
                    from: baseFrom + sFrom,
                    to: baseFrom + sTo,
                    category: 'longSentence',
                    message: `Long sentence (${count} words). Consider splitting.`
                })
            }
        }
        for (const e of ends) {
            pushSentence(start, e)
            start = e
        }
        // tail
        if (start < source.length) pushSentence(start, source.length)
    }

    // De-duplicate overlaps preferring specific categories over generic ones
    // Priority order: redundancy/cliche > passive/expletive > weasel/adverb/nominalization > longSentence
    const priority: Record<IssueCategory, number> = {
        redundancy: 0,
        cliche: 0,
        passive: 1,
        expletive: 1,
        weasel: 2,
        adverb: 2,
        nominalization: 2,
        longSentence: 3,
    }
    issues.sort((a, b) => a.from - b.from || priority[a.category] - priority[b.category])
    const final: Issue[] = []
    let lastTo = -1
    for (const it of issues) {
        if (it.from < lastTo) {
            // overlap: keep the higher priority one (already sorted by priority)
            continue
        }
        final.push(it)
        lastTo = it.to
    }

    return final
}

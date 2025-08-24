import { useMemo } from 'react'
import { EditorView, ViewPlugin, Decoration, DecorationSet, ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

export function useStyleIssuesExt(enabled: boolean, content: string) {
    return useMemo(() => {
        if (!enabled) return [] as any
        const fillers = [
            'actually', 'basically', 'pretty much', 'sort of', 'kind of', 'really', 'very', 'quite', 'rather', 'somewhat', 'just', 'literally'
        ]
        const redundancies = [
            'basic fundamentals', 'close proximity', 'end result', 'free gift', 'final outcome', 'past history', 'advance planning', 'added bonus', 'plan ahead', 'revert back', 'unexpected surprise', 'true facts', 'fall down', 'combine together', 'join together'
        ]
        const cliches = [
            'against all odds', 'at the end of the day', 'back to square one', 'ballpark figure', 'big picture', 'crystal clear', 'dead as a doornail', 'in the nick of time', 'light at the end of the tunnel', 'long and short of it', 'low[-\\s]?hanging fruit', 'move the needle', 'needle in a haystack', 'think outside the box', 'tip of the iceberg', 'touch base', 'under the radar', 'brass tacks'
        ]
        const escape = (s: string) => s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
        const parts = [...fillers, ...redundancies].map(escape).map(s => `\\b${s}\\b`).concat(cliches)
        const pattern = new RegExp(parts.join('|'), 'gi')
        return [
            ViewPlugin.fromClass(class {
                decorations: DecorationSet
                constructor(view: EditorView) { this.decorations = this.build(view) }
                update(update: ViewUpdate) { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view) }
                build(view: EditorView) {
                    const builder = new RangeSetBuilder<Decoration>()
                    const deco = Decoration.mark({ class: 'cm-style-issue' })
                    const text = view.state.doc.toString()
                    pattern.lastIndex = 0
                    let m: RegExpExecArray | null
                    while ((m = pattern.exec(text))) {
                        builder.add(m.index, m.index + m[0].length, deco)
                        if (pattern.lastIndex === m.index) pattern.lastIndex++
                    }
                    return builder.finish()
                }
            }, { decorations: v => v.decorations })
        ]
    }, [enabled, content])
}

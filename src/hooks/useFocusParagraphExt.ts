import { useMemo } from 'react'
import { EditorView, ViewPlugin, Decoration, DecorationSet, ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

export function useFocusParagraphExt(enabled: boolean, content: string) {
    return useMemo(() => {
        if (!enabled) return [] as any
        return [
            ViewPlugin.fromClass(class {
                decorations: DecorationSet
                constructor(view: EditorView) { this.decorations = this.build(view) }
                update(update: ViewUpdate) { if (update.selectionSet || update.docChanged) this.decorations = this.build(update.view) }
                build(view: EditorView) {
                    const sel = view.state.selection.main
                    const head = sel.head
                    const doc = view.state.doc
                    const cur = doc.lineAt(head)
                    let start = cur.number
                    for (let n = cur.number; n >= 1; n--) {
                        const ln = doc.line(n)
                        if (ln.text.trim() === '' && n !== cur.number) { start = n + 1; break }
                        if (n === 1) start = 1
                    }
                    let end = cur.number
                    for (let n = cur.number; n <= doc.lines; n++) {
                        const ln = doc.line(n)
                        if (ln.text.trim() === '' && n !== cur.number) { end = n - 1; break }
                        if (n === doc.lines) end = doc.lines
                    }
                    const builder = new RangeSetBuilder<Decoration>()
                    const lineDeco = Decoration.line({ class: 'cm-active-paragraph' })
                    for (let n = start; n <= end; n++) {
                        const ln = doc.line(n)
                        builder.add(ln.from, ln.from, lineDeco)
                    }
                    return builder.finish()
                }
            }, { decorations: v => v.decorations })
        ]
    }, [enabled, content])
}

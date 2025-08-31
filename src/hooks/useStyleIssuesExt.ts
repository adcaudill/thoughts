import { useMemo } from 'react'
import { EditorView, ViewPlugin, Decoration, DecorationSet, ViewUpdate, hoverTooltip, Tooltip } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { findStyleIssues, Issue, StyleCheckOptions } from '../lib/styleCheck'

export function useStyleIssuesExt(enabled: boolean, content: string, options?: StyleCheckOptions) {
    return useMemo(() => {
        if (!enabled) return [] as any

        const decoFor = (issue: Issue) => {
            const baseClass = 'cm-style-issue'
            const cls = `${baseClass} cm-style-${issue.category}`
            return Decoration.mark({ class: cls })
        }

        const plugin = ViewPlugin.fromClass(class {
            decorations: DecorationSet
            constructor(view: EditorView) { this.decorations = this.build(view) }
            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view)
            }
            build(view: EditorView) {
                const builder = new RangeSetBuilder<Decoration>()
                const doc = view.state.doc
                for (const vr of view.visibleRanges) {
                    const text = doc.sliceString(vr.from, vr.to)
                    const issues = findStyleIssues(text, { longSentenceWordLimit: 28, ...(options || {}) }, vr.from)
                    for (const it of issues) builder.add(it.from, it.to, decoFor(it))
                }
                return builder.finish()
            }
        }, { decorations: v => v.decorations })

        // Tooltip on hover across categories
        const tooltip = hoverTooltip((view, pos, side): Tooltip | null => {
            const { decorations } = (plugin as any).pluginSpec
                ? (view as any).plugin(plugin).value
                : { decorations: null }
            // Fallback: inspect decorations in viewport
            const iter = (view as any).state.field ? null : null
            // Use DOM hit testing: check if class is present at pos
            const line = view.state.doc.lineAt(pos)
            const text = view.state.doc.sliceString(line.from, line.to)
            // Cheap scan for issues overlapping pos within the line range
            const issues = findStyleIssues(text, { longSentenceWordLimit: 28 }, line.from)
            const found = issues.find(i => pos >= i.from && pos <= i.to)
            if (!found) return null
            return {
                pos: found.from,
                end: found.to,
                create() {
                    const dom = document.createElement('div')
                    dom.className = 'cm-style-tooltip'
                    dom.textContent = found.message
                    return { dom }
                }
            }
        }, { hoverTime: 150 })

        return [plugin, tooltip]
    }, [enabled, content, options && JSON.stringify(options)])
}

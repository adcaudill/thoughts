import { useMemo } from 'react'
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'

/**
 * Typewriter scroll: keep the caret within a comfortable vertical band.
 * Softly adjusts scrollTop when the selection moves outside a 35–55% band.
 */
export function useTypewriterScrollExt(enabled: boolean) {
    return useMemo(() => {
        if (!enabled) return [] as any
        return [
            ViewPlugin.fromClass(class {
                private forceCenter = false
                constructor(private view: EditorView) { this.schedule() }
                update(u: ViewUpdate) {
                    if (u.docChanged || u.selectionSet) this.forceCenter = true
                    if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) this.schedule()
                }
                schedule() {
                    const view = this.view
                    const head = view.state.selection.main.head
                    const scroller = view.scrollDOM as HTMLElement
                    if (!scroller) return
                    view.requestMeasure({
                        read: () => {
                            try {
                                const caretRect = view.coordsAtPos(head)
                                if (this.forceCenter) {
                                    if (!caretRect) return { adjust: 'center' as const }
                                    const h = scroller.clientHeight || 0
                                    if (h <= 0) return { adjust: false }
                                    const containerTop = scroller.getBoundingClientRect().top
                                    const offsetY = caretRect.top - containerTop
                                    const targetY = h * 0.45
                                    const delta = offsetY - targetY
                                    let newTop = scroller.scrollTop + delta
                                    const maxTop = scroller.scrollHeight - h
                                    if (newTop < 0) newTop = 0
                                    if (newTop > maxTop) newTop = maxTop
                                    return { adjust: true, top: newTop, forced: true }
                                }
                                // normal banded behavior
                                if (!caretRect) return { adjust: false }
                                if (!caretRect) return { adjust: false }
                                const containerTop = scroller.getBoundingClientRect().top
                                const h = scroller.clientHeight || 0
                                if (h <= 0) return { adjust: false }
                                const offsetY = caretRect.top - containerTop
                                const bandTop = h * 0.35
                                const bandBottom = h * 0.55
                                const outside = offsetY < bandTop - 12 || offsetY > bandBottom + 12
                                if (!outside) return { adjust: false }
                                const targetY = h * 0.45
                                const delta = offsetY - targetY
                                let newTop = scroller.scrollTop + delta
                                const maxTop = scroller.scrollHeight - h
                                if (newTop < 0) newTop = 0
                                if (newTop > maxTop) newTop = maxTop
                                return { adjust: true, top: newTop }
                            } catch {
                                return { adjust: 'center' as const }
                            }
                        },
                        write: (data: any) => {
                            if (!data) return
                            if (data.adjust === true && typeof data.top === 'number') {
                                scroller.scrollTop = data.top
                            } else if (data.adjust === 'center' || data.adjust === 'center-forced') {
                                try { view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) }) } catch { }
                            }
                            this.forceCenter = false
                        }
                    })
                }
            })
        ]
    }, [enabled])
}

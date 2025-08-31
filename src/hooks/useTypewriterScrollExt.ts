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
                private forceCenter = false // used for typing events
                private pointerDown = false
                private lastPointerUpAt = 0
                private downX = 0
                private downY = 0
                private dragging = false
                private gentleTimer: number | null = null
                private removeListeners: (() => void) | null = null
                constructor(private view: EditorView) {
                    const dom = view.dom as HTMLElement
                    const onPointerDown = (e: PointerEvent | MouseEvent) => {
                        this.pointerDown = true
                        this.downX = 'clientX' in e ? (e as MouseEvent).clientX : 0
                        this.downY = 'clientY' in e ? (e as MouseEvent).clientY : 0
                        this.dragging = false
                        if (this.gentleTimer) { window.clearTimeout(this.gentleTimer); this.gentleTimer = null }
                    }
                    const onPointerMove = (e: PointerEvent | MouseEvent) => {
                        if (!this.pointerDown) return
                        const x = 'clientX' in e ? (e as MouseEvent).clientX : 0
                        const y = 'clientY' in e ? (e as MouseEvent).clientY : 0
                        if (Math.abs(x - this.downX) > 5 || Math.abs(y - this.downY) > 5) this.dragging = true
                    }
                    const onPointerUp = () => {
                        this.pointerDown = false
                        this.lastPointerUpAt = Date.now()
                        // If it was a drag selection, avoid any automatic recenter. Wait for typing/keyboard.
                        if (this.dragging) { this.dragging = false; return }
                        // For a simple click, debounce a gentle recenter slightly so it feels less jumpy
                        if (this.gentleTimer) window.clearTimeout(this.gentleTimer)
                        this.gentleTimer = window.setTimeout(() => { this.gentleTimer = null; this.schedule() }, 180)
                    }
                    dom.addEventListener('pointerdown', onPointerDown as any, { passive: true })
                    dom.addEventListener('pointermove', onPointerMove as any, { passive: true })
                    dom.addEventListener('pointerup', onPointerUp, { passive: true })
                    // fallback for older browsers
                    dom.addEventListener('mousedown', onPointerDown as any, { passive: true })
                    dom.addEventListener('mousemove', onPointerMove as any, { passive: true })
                    dom.addEventListener('mouseup', onPointerUp, { passive: true })
                    this.removeListeners = () => {
                        dom.removeEventListener('pointerdown', onPointerDown as any)
                        dom.removeEventListener('pointermove', onPointerMove as any)
                        dom.removeEventListener('pointerup', onPointerUp)
                        dom.removeEventListener('mousedown', onPointerDown as any)
                        dom.removeEventListener('mousemove', onPointerMove as any)
                        dom.removeEventListener('mouseup', onPointerUp)
                    }
                    this.schedule()
                }
                update(u: ViewUpdate) {
                    // Force center only when the document changes (typing). This keeps the typing flow smooth.
                    if (u.docChanged) this.forceCenter = true
                    // Selection changes from keyboard are allowed to gently adjust; from mouse will set pointerDown
                    if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) this.schedule()
                }
                schedule() {
                    const view = this.view
                    const head = view.state.selection.main.head
                    const scroller = view.scrollDOM as HTMLElement
                    if (!scroller) return
                    if (this.pointerDown) return // never adjust while the pointer is down
                    view.requestMeasure({
                        read: () => {
                            try {
                                const caretRect = view.coordsAtPos(head)
                                const h = scroller.clientHeight || 0
                                if (!caretRect || h <= 0) return { adjust: false }
                                // If we just clicked, let things settle briefly; avoid immediate recenter
                                if (Date.now() - this.lastPointerUpAt < 160) return { adjust: false }
                                const containerTop = scroller.getBoundingClientRect().top
                                const offsetY = caretRect.top - containerTop
                                const targetY = h * 0.45
                                const bandTop = h * 0.35
                                const bandBottom = h * 0.55
                                const outside = offsetY < bandTop - 12 || offsetY > bandBottom + 12

                                if (this.forceCenter) {
                                    // Strong recenter for typing only
                                    const delta = offsetY - targetY
                                    let newTop = scroller.scrollTop + delta
                                    const maxTop = scroller.scrollHeight - h
                                    if (newTop < 0) newTop = 0
                                    if (newTop > maxTop) newTop = maxTop
                                    return { adjust: true, top: newTop, smooth: false }
                                }

                                // For clicks/keyboard-only selection moves, adjust gently if outside the band
                                if (!outside) return { adjust: false }
                                const delta = offsetY - targetY
                                let newTop = scroller.scrollTop + delta
                                const maxTop = scroller.scrollHeight - h
                                if (newTop < 0) newTop = 0
                                if (newTop > maxTop) newTop = maxTop
                                return { adjust: true, top: newTop, smooth: true }
                            } catch {
                                return { adjust: false }
                            }
                        },
                        write: (data: any) => {
                            if (!data || data.adjust !== true || typeof data.top !== 'number') {
                                this.forceCenter = false
                                return
                            }
                            // For gentle mode (after click/keyboard), prefer smooth scrolling when available.
                            if (data.smooth && 'scrollTo' in scroller) {
                                try { (scroller as any).scrollTo({ top: data.top, behavior: 'smooth' }) } catch { scroller.scrollTop = data.top }
                            } else {
                                scroller.scrollTop = data.top
                            }
                            this.forceCenter = false
                        }
                    })
                }
                destroy() {
                    if (this.removeListeners) this.removeListeners()
                    if (this.gentleTimer) { window.clearTimeout(this.gentleTimer); this.gentleTimer = null }
                }
            })
        ]
    }, [enabled])
}

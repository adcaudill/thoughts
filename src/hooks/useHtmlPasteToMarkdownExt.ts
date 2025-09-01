import { useMemo } from 'react'
import { EditorView } from '@codemirror/view'

/**
 * Returns a CodeMirror extension that intercepts paste events.
 * If the clipboard contains HTML, it's converted to Markdown before insertion.
 */
export function useHtmlPasteToMarkdownExt() {
    return useMemo(() => {
        const handler = EditorView.domEventHandlers({
            paste: (event, view) => {
                const e = event as ClipboardEvent
                const dt = e.clipboardData
                if (!dt) return false

                const html = dt.getData('text/html')
                const plain = dt.getData('text/plain') || ''

                // Only handle when real HTML is present
                if (!html || !/[<][a-zA-Z!/]/.test(html)) return false

                e.preventDefault()

                    ; (async () => {
                        try {
                            const TurndownModule: any = await import('turndown')
                            const TurndownService = TurndownModule.default || TurndownModule
                            const service = new TurndownService({
                                headingStyle: 'atx',
                                codeBlockStyle: 'fenced',
                                bulletListMarker: '-',
                                emDelimiter: '_',
                            })
                            try {
                                const gfmModule: any = await import('turndown-plugin-gfm')
                                const gfm = gfmModule.gfm || gfmModule.default
                                if (gfm) service.use(gfm)
                            } catch { /* optional plugin */ }

                            // Preserve <br> as hard line breaks
                            service.addRule('preserveLineBreaks', {
                                filter: ['br'],
                                replacement: () => '  \n',
                            })

                            // Sanitize DOM: drop scripts/styles/comments
                            const doc = new DOMParser().parseFromString(html, 'text/html')
                            try { doc.querySelectorAll('script,style,noscript').forEach(n => n.remove()) } catch { }
                            try {
                                const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT)
                                const comments: Comment[] = []
                                let n: Node | null = walker.nextNode()
                                while (n) { comments.push(n as Comment); n = walker.nextNode() }
                                comments.forEach(c => c.remove())
                            } catch { }

                            let md = service.turndown(doc.body?.innerHTML || '')
                            if (!md || !md.trim()) md = plain
                            md = md.replace(/\r\n/g, '\n')

                            const sel = view.state.selection.main
                            view.dispatch({ changes: { from: sel.from, to: sel.to, insert: md } })
                            view.focus()
                        } catch {
                            // Fallback: plain text
                            const sel = view.state.selection.main
                            const text = plain || html
                            view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text } })
                            view.focus()
                        }
                    })()

                return true
            },
        })
        return [handler] as any
    }, [])
}

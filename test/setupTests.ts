import '@testing-library/jest-dom'

// Provide global vi for tests if not present (vitest provides it automatically)
if (typeof (globalThis as any).vi === 'undefined') {
    (globalThis as any).vi = (globalThis as any).vi || {}
}

// jsdom polyfills for DOM geometry methods used by CodeMirror
try {
    const g: any = globalThis as any
    if (g.Element && !g.Element.prototype.getClientRects) {
        g.Element.prototype.getClientRects = function () { return [] }
    }
    if (g.Range && g.Range.prototype && typeof g.Range.prototype.getClientRects !== 'function') {
        g.Range.prototype.getClientRects = function () { return [] }
    }
    if (g.Element && !g.Element.prototype.getBoundingClientRect) {
        g.Element.prototype.getBoundingClientRect = function () {
            return { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON() { return this } }
        }
    }
} catch {
    // ignore
}

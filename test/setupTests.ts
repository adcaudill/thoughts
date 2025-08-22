import '@testing-library/jest-dom'

// Provide global vi for tests if not present (vitest provides it automatically)
// @ts-ignore
if (typeof globalThis.vi === 'undefined') {
    // @ts-ignore
    globalThis.vi = (globalThis as any).vi || {}
}

import '@testing-library/jest-dom'

// Provide global vi for tests if not present (vitest provides it automatically)
if (typeof (globalThis as any).vi === 'undefined') {
    (globalThis as any).vi = (globalThis as any).vi || {}
}

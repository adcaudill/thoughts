import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import Editor, { EditorHandle } from '../../src/components/Editor'

// Stub CodeMirror to avoid layout/timer complications in unit tests
vi.mock('@uiw/react-codemirror', () => ({
    __esModule: true,
    default: (props: any) => React.createElement('div', { 'data-testid': 'cm-stub' }),
}))

vi.mock('../../src/lib/session', () => ({
    getNoteKey: () => 'test-note-key',
}))

const encryptSpy = vi.fn(async (_key: string, plaintext: string) => {
    // Return dummy cipher/nonce but expose plaintext to assertions via mock.calls
    return { ciphertext: 'cipher', nonce: 'nonce' }
})

vi.mock('../../src/lib/crypto', async () => {
    const actual: any = await vi.importActual('../../src/lib/crypto')
    return {
        ...actual,
        encryptNotePayload: (...args: any[]) => (encryptSpy as any)(...args),
    }
})

const updateSpy = vi.fn(async () => ({ ok: true }))
const createSpy = vi.fn(async () => ({ ok: true, id: 'note-1' }))

vi.mock('../../src/lib/api', async () => {
    const actual: any = await vi.importActual('../../src/lib/api')
    return {
        ...actual,
        updateNote: (...args: any[]) => (updateSpy as any)(...args),
        createNote: (...args: any[]) => (createSpy as any)(...args),
    }
})

describe('Editor autosave captures freshest title', () => {
    beforeEach(() => {
        encryptSpy.mockClear()
        updateSpy.mockClear()
        createSpy.mockClear()
    })

    it('reads latest title from input ref during save (even if React state lags)', async () => {
        const ref = React.createRef<EditorHandle>()
        const editingNote = { id: 'abc', title: 'Old Title', content: '' }

        render(<Editor ref={ref} editingNote={editingNote} />)

        // Grab the title input and simulate DOM value change without firing onChange
        const input = (await screen.findByPlaceholderText('Untitled')) as HTMLInputElement
        expect(input).toBeInTheDocument()

        // Directly mutate the input value to simulate user typing that hasn't propagated to React state yet
        input.value = 'New Title'

        // Trigger save immediately (like autosave/shortcut firing right after typing)
        await act(async () => {
            await ref.current!.save()
        })

        // Ensure encryption was invoked with a payload that includes the freshest title
        expect(encryptSpy).toHaveBeenCalled()
        const payloadArg = encryptSpy.mock.calls[0][1] as string
        const parsed = JSON.parse(payloadArg)
        expect(parsed.title).toBe('New Title')

        // Since note has an id, it should call updateNote, not createNote
        expect(updateSpy).toHaveBeenCalled()
        expect(createSpy).not.toHaveBeenCalled()
    })
})

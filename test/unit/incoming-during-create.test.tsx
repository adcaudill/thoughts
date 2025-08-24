import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Editor from '../../src/components/Editor'
import * as api from '../../src/lib/api'
import * as session from '../../src/lib/session'
import * as crypto from '../../src/lib/crypto'
import { vi } from 'vitest'

// Reproduce: start a create (pending), then parent supplies an incoming
// editingNote with an older server copy; the editor should not apply the
// incoming copy while the save is in-flight, and only one create should occur.
test('incoming parent update during create does not clobber or duplicate', async () => {
    vi.spyOn(api, 'getFolders').mockResolvedValue({ ok: true, folders: [] } as any)
    const keySpy = vi.spyOn(session, 'getNoteKey').mockReturnValue('test-note-key')
    const encSpy = vi.spyOn(crypto, 'encryptNotePayload').mockResolvedValue({ ciphertext: 'ct', nonce: 'n' } as any)

    let resolveCreate: (v: any) => void = () => { }
    const createPromise = new Promise(resolve => { resolveCreate = resolve })
    const createSpy = vi.spyOn(api, 'createNote').mockImplementation(() => createPromise as any)
    const updateSpy = vi.spyOn(api, 'updateNote').mockResolvedValue({ ok: true } as any)

    const { rerender } = render(<Editor editingNote={{ id: '', title: '', content: '' }} />)

    // Type a title so the editor is dirty
    const titleInput = await screen.findByPlaceholderText('Untitled') as HTMLInputElement
    fireEvent.input(titleInput, { target: { value: 'My Draft Title' } })

    const saveBtn = await screen.findByRole('button', { name: /Save/i })
    await waitFor(() => expect(saveBtn).not.toBeDisabled())

    // Click save which starts the pending create
    fireEvent.click(saveBtn)

    // While create is pending, simulate parent giving an older server copy
    rerender(<Editor editingNote={{ id: 'note-1', title: 'Old Title', content: 'old content', folder_id: undefined }} />)

    // Ensure exactly one write occurred (create or update), not both
    await waitFor(() => {
        const total = createSpy.mock.calls.length + updateSpy.mock.calls.length
        expect(total).toBe(1)
    })

    // Resolve the create with server id if the create path was taken
    if (createSpy.mock.calls.length === 1) {
        resolveCreate({ ok: true, id: 'note-1' })
    }

    // After save completes, Save button should be disabled again
    await waitFor(() => expect(saveBtn).toBeDisabled())

    // Ensure only a single write happened total
    const total = createSpy.mock.calls.length + updateSpy.mock.calls.length
    expect(total).toBe(1)

    // Title should remain the user's typed title, not overwritten by the older server copy
    expect((titleInput as HTMLInputElement).value).toBe('My Draft Title')

    createSpy.mockRestore()
    updateSpy.mockRestore()
    keySpy.mockRestore()
    encSpy.mockRestore()
})

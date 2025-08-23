import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Editor from '../../src/components/Editor'
import * as api from '../../src/lib/api'
import * as session from '../../src/lib/session'
import * as crypto from '../../src/lib/crypto'
import { vi } from 'vitest'

// Ensure rapid double-save only creates a single note
test('concurrent saves only create one note', async () => {
    // mock getFolders to avoid network
    vi.spyOn(api, 'getFolders').mockResolvedValue({ ok: true, folders: [] } as any)

    // ensure editor save path runs by providing a note key and bypassing heavy crypto
    const keySpy = vi.spyOn(session, 'getNoteKey').mockReturnValue('test-note-key')
    const encSpy = vi.spyOn(crypto, 'encryptNotePayload').mockResolvedValue({ ciphertext: 'ct', nonce: 'n' } as any)

    // create controllable promise for createNote
    let resolveCreate: (v: any) => void = () => { }
    const createPromise = new Promise(resolve => { resolveCreate = resolve })
    const createSpy = vi.spyOn(api, 'createNote').mockImplementation(() => createPromise as any)
    const updateSpy = vi.spyOn(api, 'updateNote').mockResolvedValue({ ok: true } as any)

    render(<Editor editingNote={{ id: '', title: '', content: '' }} />)

    // Make the editor dirty by changing the title input (simpler than manipulating Quill internals)
    const titleInput = await screen.findByPlaceholderText('Untitled') as HTMLInputElement
    fireEvent.input(titleInput, { target: { value: 'Hello' } })

    // Find the Save button (could be 'Save' or 'Save changes')
    const saveBtn = await screen.findByRole('button', { name: /Save/i })

    // Wait for the title change to mark the editor dirty and enable Save, then click twice
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    fireEvent.click(saveBtn)
    fireEvent.click(saveBtn)

    // createNote is invoked after async encryption, wait for it to be called once
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1))

    // now resolve the create
    resolveCreate({ ok: true, id: 'note-1' })

    // wait for the component to finish saving (editor clears dirty so Save becomes disabled)
    await waitFor(() => expect(saveBtn).toBeDisabled())

    // ensure still only one create and no updates called to create another
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).not.toHaveBeenCalled()

    // cleanup mocks
    createSpy.mockRestore()
    updateSpy.mockRestore()
    keySpy.mockRestore()
    encSpy.mockRestore()
})

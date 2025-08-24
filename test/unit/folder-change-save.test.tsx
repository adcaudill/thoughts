import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import '@testing-library/jest-dom'
import Editor from '../../src/components/Editor'
import * as api from '../../src/lib/api'
import * as session from '../../src/lib/session'
import * as crypto from '../../src/lib/crypto'
import { vi } from 'vitest'

// When changing an existing note's folder, updateNote should be called with the new folder_id
test('changing folder for existing note triggers updateNote with new folder_id', async () => {
    vi.spyOn(api, 'getFolders').mockResolvedValue({
        ok: true, folders: [
            { id: 'f1', is_default: 1, name_encrypted: 'Inbox' },
            { id: 'f2', is_default: 0, name_encrypted: 'Other' }
        ]
    } as any)

    const keySpy = vi.spyOn(session, 'getNoteKey').mockReturnValue('test-note-key')
    const encSpy = vi.spyOn(crypto, 'encryptNotePayload').mockResolvedValue({ ciphertext: 'ct', nonce: 'n' } as any)

    const updateSpy = vi.spyOn(api, 'updateNote').mockResolvedValue({ ok: true } as any)

    render(<Editor editingNote={{ id: 'note-1', title: 'T', content: 'C', folder_id: 'f1' }} />)

    const select = await screen.findByLabelText('select-folder') as HTMLSelectElement

    // Change to folder f2
    fireEvent.change(select, { target: { value: 'f2' } })

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())

    // updateNote should be called with note id and a payload containing folder_id 'f2'
    expect(updateSpy).toHaveBeenCalledWith('note-1', expect.objectContaining({ folder_id: 'f2' }))

    // cleanup
    updateSpy.mockRestore()
    keySpy.mockRestore()
    encSpy.mockRestore()
})

// When changing folder for a new note (no id), createNote should be invoked
test('changing folder for new note triggers createNote', async () => {
    vi.spyOn(api, 'getFolders').mockResolvedValue({
        ok: true, folders: [
            { id: 'f1', is_default: 1, name_encrypted: 'Inbox' },
            { id: 'f2', is_default: 0, name_encrypted: 'Other' }
        ]
    } as any)

    const keySpy = vi.spyOn(session, 'getNoteKey').mockReturnValue('test-note-key')
    const encSpy = vi.spyOn(crypto, 'encryptNotePayload').mockResolvedValue({ ciphertext: 'ct', nonce: 'n' } as any)

    const createSpy = vi.spyOn(api, 'createNote').mockResolvedValue({ ok: true, id: 'new-note' } as any)

    render(<Editor editingNote={{ id: '', title: '', content: '' }} />)

    const select = await screen.findByLabelText('select-folder') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'f2' } })

    await waitFor(() => expect(createSpy).toHaveBeenCalled())

    // createNote should be called with an object containing folder_id 'f2'
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ folder_id: 'f2' }))

    // cleanup
    createSpy.mockRestore()
    keySpy.mockRestore()
    encSpy.mockRestore()
})

import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
vi.mock('../../src/lib/crypto', async () => {
    const actual = await vi.importActual('../../src/lib/crypto')
    return {
        ...actual,
        encryptNotePayload: vi.fn(async (noteKey: string, plaintext: string) => ({ nonce: 'nonceB64', ciphertext: btoa(plaintext) }))
    }
})

import Sidebar from '../../src/components/Sidebar'

describe('Sidebar', () => {
    beforeEach(() => {
        ; (global as any).fetch = vi.fn()
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    it('renders loading and then folder tree with Inbox', async () => {
        const mockFolders = [
            { id: 'f1', parent_id: null, name_encrypted: '', is_default: 1 },
            { id: 'f2', parent_id: 'f1', name_encrypted: 'Child', is_default: 0 },
            { id: 'f3', parent_id: null, name_encrypted: 'Work', is_default: 0 },
        ]
            ; (global as any).fetch.mockResolvedValue({ json: async () => ({ ok: true, folders: mockFolders }) })

        render(<Sidebar noteKey={null} />)
        expect(screen.getByText(/Loading/i)).toBeInTheDocument()

        await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument())
        expect(screen.getByText('Inbox')).toBeInTheDocument()
        expect(screen.getByText('Child')).toBeInTheDocument()
        expect(screen.getByText('Work')).toBeInTheDocument()
    })

    it('shows error when API fails', async () => {
        ; (global as any).fetch.mockRejectedValue(new Error('network'))
        render(<Sidebar noteKey={null} />)
        await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument())
        expect(screen.getByText(/network/i)).toBeInTheDocument()
    })

    it('creates, renames and deletes a folder via API', async () => {
        // initial folders empty
        ; (global as any).fetch
            .mockResolvedValueOnce({ json: async () => ({ ok: true, folders: [] }) }) // initial load
            .mockResolvedValueOnce({ json: async () => ({ ok: true, id: 'new1' }) }) // createFolder
            .mockResolvedValueOnce({ json: async () => ({ ok: true, folders: [{ id: 'new1', parent_id: null, name_encrypted: 'MyFolder', is_default: 0 }] }) }) // reload after create
            .mockResolvedValueOnce({ json: async () => ({ ok: true }) }) // updateFolder
            .mockResolvedValueOnce({ json: async () => ({ ok: true, folders: [{ id: 'new1', parent_id: null, name_encrypted: 'Renamed', is_default: 0 }] }) }) // reload after rename
            .mockResolvedValueOnce({ json: async () => ({ ok: true }) }) // deleteFolder
            .mockResolvedValueOnce({ json: async () => ({ ok: true, folders: [] }) }) // reload after delete

        render(<Sidebar noteKey={null} />)
        await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument())

        const input = screen.getByPlaceholderText('New folder name') as HTMLInputElement
        const createBtn = screen.getByLabelText('create-folder')
        // set value via change event and click create
        fireEvent.change(input, { target: { value: 'MyFolder' } })
        createBtn.click()

        await waitFor(() => expect(screen.getByText('MyFolder')).toBeInTheDocument())

        // click rename for the new folder (id from mocked create is 'new1')
        const renameBtn = screen.getByLabelText('rename-new1')
        renameBtn.click()
        const saveBtn = await screen.findByLabelText('save-new1')
        // find input and change value
        const editInput = screen.getByLabelText('edit-folder-new1') as HTMLInputElement
        fireEvent.change(editInput, { target: { value: 'Renamed' } })
        saveBtn.click()

        await waitFor(() => expect(screen.getByText('Renamed')).toBeInTheDocument())

        // delete (mock confirm)
        vi.spyOn(window, 'confirm').mockImplementation(() => true)
        const delBtn = screen.getByLabelText('delete-new1')
        delBtn.click()
        await waitFor(() => expect(screen.queryByText('Renamed')).not.toBeInTheDocument())
    })
})

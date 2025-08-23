import React from 'react'
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
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
        globalThis.fetch = vi.fn()
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    it('renders loading and then folder tree with Inbox', async () => {
        const mockFolders = [
            { id: 'f1', parent_id: null, name_encrypted: '', is_default: 1 },
            { id: 'f2', parent_id: 'f1', name_encrypted: 'Child', is_default: 0 },
            { id: 'f3', parent_id: null, name_encrypted: 'Work', is_default: 0 },
        ];
        const fetchMock = vi.fn()
        fetchMock.mockResolvedValue({ json: async () => ({ ok: true, folders: mockFolders }) })
        const G = globalThis as any
        G.fetch = fetchMock

        render(<Sidebar noteKey={null} />)
        // loading state appears first
        expect(await screen.findByText(/Loading/i)).toBeInTheDocument()
        // then the folders are shown
        await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument())
        expect(await screen.findByText('Inbox')).toBeInTheDocument()
        expect(await screen.findByText('Child')).toBeInTheDocument()
        expect(await screen.findByText('Work')).toBeInTheDocument()
    })

    it('shows error when API fails', async () => {
        const fetchMock = vi.fn()
        fetchMock.mockRejectedValue(new Error('network'))
        const G = globalThis as any
        G.fetch = fetchMock
        render(<Sidebar noteKey={null} />)
        await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument())
    })

    it('creates, renames and deletes a folder via API', async () => {
        // initial folders empty
        (global as any).fetch
            .mockResolvedValueOnce({ json: async () => ({ ok: true, folders: [] }) }) // initial load
            .mockResolvedValueOnce({ json: async () => ({ ok: true, id: 'new1' }) }) // createFolder
        const fetchMock = vi.fn()
        fetchMock
            .mockResolvedValueOnce({ json: async () => ({ ok: true, folders: [] }) }) // initial load
            .mockResolvedValueOnce({ json: async () => ({ ok: true, id: 'new1' }) }) // createFolder
            .mockResolvedValueOnce({ json: async () => ({ ok: true, folders: [{ id: 'new1', parent_id: null, name_encrypted: 'MyFolder', is_default: 0 }] }) }) // reload after create
            .mockResolvedValueOnce({ json: async () => ({ ok: true }) }) // updateFolder
            .mockResolvedValueOnce({ json: async () => ({ ok: true, folders: [{ id: 'new1', parent_id: null, name_encrypted: 'Renamed', is_default: 0 }] }) }) // reload after rename
            .mockResolvedValueOnce({ json: async () => ({ ok: true }) }) // deleteFolder
            .mockResolvedValueOnce({ json: async () => ({ ok: true, folders: [] }) }) // reload after delete
        const G = globalThis as any
        G.fetch = fetchMock

        render(<Sidebar noteKey={null} />)
        const input = await screen.findByPlaceholderText('New folder name') as HTMLInputElement
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

import React from 'react'
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// Mock session key retrieval
vi.mock('../../src/lib/session', () => ({ getNoteKey: () => 'test-key' }))

// Mock crypto decrypt to simply base64-decode the input
vi.mock('../../src/lib/crypto', async () => {
    return {
        decryptNotePayload: vi.fn(async (_key: string, ciphertextB64: string) => atob(ciphertextB64)),
    }
})

// Delegated mocks for offlineApi and api so each test can control behavior
let offlineGetNotes: any = async () => ({ ok: true, notes: [] })
let offlineRestoreNote: any = async () => ({ ok: true })
vi.mock('../../src/lib/offlineApi', () => ({
    getNotes: (...args: any[]) => offlineGetNotes(...args),
    restoreNote: (...args: any[]) => offlineRestoreNote(...args),
}))

let apiListNoteVersions: any = async () => ({ ok: true, versions: [] })
let apiGetNoteVersion: any = async () => ({ ok: true, version: null })
let apiRestoreNoteVersion: any = async () => ({ ok: true })
let apiGetNote: any = async () => ({ ok: true, note: { id: 'n1', content_encrypted: btoa(JSON.stringify({ content: '' })), nonce: 'nonce' } })
vi.mock('../../src/lib/api', () => ({
    listNoteVersions: (...args: any[]) => apiListNoteVersions(...args),
    getNoteVersion: (...args: any[]) => apiGetNoteVersion(...args),
    restoreNoteVersion: (...args: any[]) => apiRestoreNoteVersion(...args),
    getNote: (...args: any[]) => apiGetNote(...args),
}))

describe('Trash UI and Note History Dialog', () => {
    beforeEach(() => {
        vi.resetAllMocks()
            ; (globalThis as any).fetch = vi.fn()
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        await vi.resetModules()
    })

    it('Trash shows decrypted titles and can restore an item', async () => {
        const trashed: any[] = [
            {
                id: 'n1',
                content_encrypted: btoa(JSON.stringify({ title: 'Trashed Title', content: 'Hello world' })),
                nonce: 'nonce',
                deleted_at: new Date().toISOString(),
            },
        ]

        // Mock offline API used by Trash
        const getNotesMock = vi.fn(async (_folderId?: string, opts?: { trashed?: boolean }) => ({ ok: true, notes: opts?.trashed ? trashed.slice() : [] }))
        const restoreNoteMock = vi.fn(async (id: string) => {
            const idx = trashed.findIndex(n => n.id === id)
            if (idx >= 0) trashed.splice(idx, 1)
            return { ok: true }
        })
        offlineGetNotes = getNotesMock
        offlineRestoreNote = restoreNoteMock

        const Trash = (await import('../../src/components/Trash')).default
        render(<Trash />)

        // Decrypted title should render
        expect(await screen.findByText('Trashed Title')).toBeInTheDocument()

        // Click Restore
        const restoreBtn = screen.getByText('Restore')
        fireEvent.click(restoreBtn)

        await waitFor(() => {
            expect(restoreNoteMock).toHaveBeenCalledWith('n1')
            expect(screen.queryByText('Trashed Title')).not.toBeInTheDocument()
        })
    })

    it('Trash can purge an item', async () => {
        const trashed: any[] = [
            {
                id: 'n2',
                content_encrypted: btoa(JSON.stringify({ title: 'To Purge', content: 'bye' })),
                nonce: 'nonce',
                deleted_at: new Date().toISOString(),
            },
        ]

        const getNotesMock = vi.fn(async (_folderId?: string, opts?: { trashed?: boolean }) => ({ ok: true, notes: opts?.trashed ? trashed.slice() : [] }))
        offlineGetNotes = getNotesMock
        offlineRestoreNote = vi.fn()

        // Mock confirm to allow purge
        vi.spyOn(window, 'confirm').mockImplementation(() => true)
        // Mock fetch DELETE
        const fetchMock = vi.fn(async (url: string, init?: any) => {
            if (url.includes('/api/notes/n2') && init?.method === 'DELETE') {
                // simulate server purge and update our local state so subsequent load is empty
                const idx = trashed.findIndex(n => n.id === 'n2')
                if (idx >= 0) trashed.splice(idx, 1)
                return { json: async () => ({ ok: true, purged: true }) } as any
            }
            return { json: async () => ({ ok: true }) } as any
        }) as any
            ; (globalThis as any).fetch = fetchMock

        const Trash = (await import('../../src/components/Trash')).default
        render(<Trash />)

        expect(await screen.findByText(/To Purge/)).toBeInTheDocument()
        const delBtn = screen.getByText('Delete forever')
        fireEvent.click(delBtn)

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalled()
            expect(screen.getByText('Trash is empty')).toBeInTheDocument()
        })
    })

    it('History preview decrypts and shows snippet, and restore triggers API + close', async () => {
        // Mock API used by NoteHistoryDialog
        const versions = [{ id: 'v1', created_at: new Date().toISOString(), word_count: 2, reason: 'autosave' }]
        const listNoteVersions = vi.fn(async (_id: string) => ({ ok: true, versions }))
        const getNoteVersion = vi.fn(async (_id: string, _vid: string) => ({ ok: true, version: { id: 'v1', content_encrypted: btoa(JSON.stringify({ content: 'Decrypted content\nLine 2' })), nonce: 'nonce' } }))
        const restoreNoteVersion = vi.fn(async (_id: string, _vid: string) => ({ ok: true }))
        apiListNoteVersions = listNoteVersions
        apiGetNoteVersion = getNoteVersion
        apiRestoreNoteVersion = restoreNoteVersion
        // current note can be anything for preview path
        apiGetNote = vi.fn(async (_id: string) => ({ ok: true, note: { id: 'n1', content_encrypted: btoa(JSON.stringify({ content: 'current' })), nonce: 'nonce' } }))

        const NoteHistoryDialog = (await import('../../src/components/NoteHistoryDialog')).default
        const onClose = vi.fn()
        render(<NoteHistoryDialog open={true} noteId="n1" onClose={onClose} />)

        // Wait for list to render
        expect(await screen.findByText(/autosave/)).toBeInTheDocument()

        // Preview should decrypt and show snippet
        fireEvent.click(screen.getByText('Preview'))
        expect(await screen.findByText(/Decrypted content/)).toBeInTheDocument()

        // Restore should call API and then close
        fireEvent.click(screen.getByText('Restore'))
        await waitFor(() => {
            expect(restoreNoteVersion).toHaveBeenCalledWith('n1', 'v1')
            expect(onClose).toHaveBeenCalled()
        })
    })

    it('History shows a simple line diff compared to current note', async () => {
        const versions = [{ id: 'v1', created_at: new Date().toISOString(), word_count: 3, reason: 'autosave' }]
        const listNoteVersions = vi.fn(async (_id: string) => ({ ok: true, versions }))
        const getNoteVersion = vi.fn(async (_id: string, _vid: string) => ({ ok: true, version: { id: 'v1', content_encrypted: btoa(JSON.stringify({ content: 'line1\nold line\nline3' })), nonce: 'nonce' } }))
        const restoreNoteVersion = vi.fn(async () => ({ ok: true }))
        // current note used by dialog to generate diff base
        apiGetNote = vi.fn(async (_id: string) => ({ ok: true, note: { id: 'n1', content_encrypted: btoa(JSON.stringify({ content: 'line1\nnew line\nline3' })), nonce: 'nonce' } }))
        apiListNoteVersions = listNoteVersions
        apiGetNoteVersion = getNoteVersion
        apiRestoreNoteVersion = restoreNoteVersion

        const NoteHistoryDialog = (await import('../../src/components/NoteHistoryDialog')).default
        const onClose = vi.fn()
        render(<NoteHistoryDialog open={true} noteId="n1" onClose={onClose} />)

        expect(await screen.findByText(/autosave/)).toBeInTheDocument()
        fireEvent.click(screen.getByText('Diff'))

        // Expect diff markers
        await waitFor(() => {
            expect(screen.getByText(/^\+ new line$/)).toBeInTheDocument()
            expect(screen.getByText(/^\- old line$/)).toBeInTheDocument()
        })
    })
})

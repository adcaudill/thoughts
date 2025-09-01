import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import Editor from '../../src/components/Editor'
import * as api from '../../src/lib/api'
import * as session from '../../src/lib/session'
import * as crypto from '../../src/lib/crypto'
import { getDB } from '../../src/lib/db'
import * as offline from '../../src/lib/offlineApi'

describe('creating a new note in Inbox keeps existing notes visible', () => {
    let origFetch: any
    beforeEach(async () => {
        // Clean DB
        const db = await getDB()
        for (const store of ['notes', 'folders', 'settings', 'outbox', 'history', 'searchIndex']) {
            const all = await (db as any).getAll(store)
            for (const r of all) await (db as any).transaction(store, 'readwrite').store.delete(r.id ?? r.key ?? r)
        }
        origFetch = (globalThis as any).fetch
    })

    afterEach(() => { (globalThis as any).fetch = origFetch })

    it('new blank note in Inbox does not hide or overwrite an existing Inbox note', async () => {
        // Mock folders: Inbox present
        vi.spyOn(api, 'getFolders').mockResolvedValue({
            ok: true, folders: [
                { id: 'f-inbox', is_default: 1, name_encrypted: 'Inbox' },
            ]
        } as any)

        // Seed existing note in Inbox
        const db = await getDB()
        await (db as any).put('folders', { id: 'f-inbox', is_default: 1, name_encrypted: 'Inbox', parent_id: null, order: 0 })
        await (db as any).put('notes', { id: 'n-1', folder_id: 'f-inbox', content_encrypted: 'c1', nonce: 'n1', word_count: 0, server_updated_at: null, dirty: false })

        // Crypto/session mocks
        vi.spyOn(session, 'getNoteKey').mockReturnValue('test-key')
        vi.spyOn(crypto, 'encryptNotePayload').mockResolvedValue({ ciphertext: 'ct', nonce: 'nn' } as any)

        // API mocks: create returns id; getNote returns folder assignment
        const createSpy = vi.spyOn(api, 'createNote').mockResolvedValue({ ok: true, id: 'n-2', updated_at: '2025-01-01T00:00:00.000Z' } as any)
        const getNoteSpy = vi.spyOn(api, 'getNote').mockImplementation(async (id: string) => {
            if (id === 'n-2') return { ok: true, note: { id, folder_id: 'f-inbox', content_encrypted: 'ct', nonce: 'nn', updated_at: '2025-01-01T00:00:00.000Z', word_count: 0 } } as any
            return { ok: true, note: { id, folder_id: 'f-inbox', content_encrypted: 'c1', nonce: 'n1', updated_at: '2025-01-01T00:00:00.000Z', word_count: 0 } } as any
        })
        const updateSpy = vi.spyOn(api, 'updateNote').mockResolvedValue({ ok: true } as any)

        // Render editor with existing note open
        const { rerender } = render(<Editor editingNote={{ id: 'n-1', title: 'Old', content: 'Body', folder_id: 'f-inbox' }} />)

        // Switch to a brand-new blank note in Inbox (like clicking + New)
        rerender(<Editor editingNote={{ id: '', title: '', content: '', folder_id: 'f-inbox' }} />)

        // Type a title to mark dirty
        const titleInput = await screen.findByPlaceholderText('Untitled') as HTMLInputElement
        fireEvent.change(titleInput, { target: { value: 'New Note' } })

        // Save
        const saveBtn = await screen.findByText('Save')
        fireEvent.click(saveBtn)

        await waitFor(() => expect(createSpy).toHaveBeenCalled())

        // Should not have tried to update the previously open note
        expect(updateSpy).not.toHaveBeenCalledWith('n-1', expect.anything())

        // Both notes should be present and visible in Inbox
        const list = await offline.getNotes('f-inbox')
        expect(list.ok).toBe(true)
        const ids = (list.notes || []).map((n: any) => n.id).sort()
        expect(ids).toEqual(['n-1', 'n-2'])

        // Cleanup spies
        createSpy.mockRestore()
        getNoteSpy.mockRestore()
        updateSpy.mockRestore()
    })
})

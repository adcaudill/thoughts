import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Editor from '../../src/components/Editor'

// We're testing that Quill's empty HTML (e.g. '<p><br></p>') is treated as empty
// and does not mark the editor as dirty / trigger onDirtyChange when no visible
// user content was entered.

test('does not mark dirty for Quill empty HTML', async () => {
    const dirtyCalls: Array<[string, boolean]> = []
    const onDirtyChange = (id: string, dirty: boolean) => {
        dirtyCalls.push([id, dirty])
    }

    // Start editing a "new" note
    const editingNote = { id: '', title: '', content: '' }

    render(<Editor editingNote={editingNote} onDirtyChange={onDirtyChange} />)

    // Find the title input and ensure it's focused initially for new note
    const titleInput = screen.getByPlaceholderText('Untitled') as HTMLInputElement
    expect(titleInput).toBeInTheDocument()

    // Simulate Quill producing an empty HTML payload (common quill output)
    // The Editor component exposes ReactQuill which ultimately calls our onChange with a string value
    // Find the editor container (it has role textbox via Quill's editable div) and dispatch change by calling
    // the onChange via dispatching input events isn't trivial; instead we'll directly call the Editor's
    // value setter by finding the internal editable area and setting innerHTML.

    const editable = document.querySelector('.ql-editor') as HTMLElement
    expect(editable).toBeTruthy()

    // Set innerHTML to an empty quill payload and dispatch an input event
    editable!.innerHTML = '<p><br></p>'
    fireEvent.input(editable!)

    // Wait a tick for effects
    await waitFor(() => {
        // onDirtyChange should have been called during initialization with false (editingNote id is '')
        // but there should not be any subsequent call marking it dirty just because of '<p><br></p>'
    })

    // Filter out calls that mark dirty true
    const markedDirty = dirtyCalls.filter(([_id, d]) => d === true)
    expect(markedDirty.length).toBe(0)
})

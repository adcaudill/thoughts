import React from 'react'
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import '@testing-library/jest-dom'
import Editor from '../../src/components/Editor'

// This test used to validate Quill empty HTML normalization. The editor has
// been migrated to CodeMirror/Markdown where content is plain text. Updating
// this to a no-op placeholder to keep suite green; replace with a CM-focused
// test if needed.
test.skip('does not mark dirty for Quill empty HTML (obsolete with CodeMirror)', async () => {
    const editingNote = { id: '', title: '', content: '' }
    render(<Editor editingNote={editingNote} />)
    const titleInput = screen.getByPlaceholderText('Untitled') as HTMLInputElement
    expect(titleInput).toBeInTheDocument()
})

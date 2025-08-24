import React from 'react'
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import '@testing-library/jest-dom'
import NoteInfoDialog from '../../src/components/NoteInfoDialog'

test('NoteInfoDialog renders provided metrics', () => {
    render(
        <NoteInfoDialog
            open={true}
            onClose={() => { }}
            words={402}
            sentences={12}
            syllables={600}
            characters={2100}
            fleschScore={72.4}
            fleschKincaid={5.8}
            automatedReadabilityIndex={6.2}
            readingTimeMin={2}
            readingDifficulty={'standard'}
        />
    )

    expect(screen.getByText('Note information')).toBeInTheDocument()
    expect(screen.getByText('Words: 402')).toBeInTheDocument()
    expect(screen.getByText('Sentences: 12')).toBeInTheDocument()
    expect(screen.getByText('Characters (no spaces): 2100')).toBeInTheDocument()
    expect(screen.getByText('Syllables: 600')).toBeInTheDocument()
    expect(screen.getByText('Flesch Reading Ease: 72.4')).toBeInTheDocument()
    expect(screen.getByText('Flesch–Kincaid Grade Level: 5.8')).toBeInTheDocument()
    expect(screen.getByText('Automated Readability Index: 6.2')).toBeInTheDocument()
    expect(screen.getByText('Estimated reading time: 2 min (standard)')).toBeInTheDocument()
})

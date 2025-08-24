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
    // Labels and values are rendered in separate cells; assert both exist
    expect(screen.getByText('Words')).toBeInTheDocument()
    expect(screen.getByText('402')).toBeInTheDocument()
    expect(screen.getByText('Sentences')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Characters (no spaces)')).toBeInTheDocument()
    expect(screen.getByText('2100')).toBeInTheDocument()
    expect(screen.getByText('Syllables')).toBeInTheDocument()
    expect(screen.getByText('600')).toBeInTheDocument()
    expect(screen.getByText('Flesch Reading Ease')).toBeInTheDocument()
    expect(screen.getByText('72.4')).toBeInTheDocument()
    expect(screen.getByText('Flesch–Kincaid Grade')).toBeInTheDocument()
    expect(screen.getByText('5.8')).toBeInTheDocument()
    expect(screen.getByText('Automated Readability Index (ARI)')).toBeInTheDocument()
    expect(screen.getByText('6.2')).toBeInTheDocument()
    expect(screen.getByText(/2\s*min/)).toBeInTheDocument()
    expect(screen.getByText(/\(standard\)/)).toBeInTheDocument()
})

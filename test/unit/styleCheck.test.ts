import { describe, it, expect } from 'vitest'
import { findStyleIssues } from '../../src/lib/styleCheck'

describe('styleCheck', () => {
    it('detects weasel words', () => {
        const issues = findStyleIssues('It is actually really quite good.')
        expect(issues.some(i => i.category === 'weasel')).toBe(true)
    })

    it('detects redundancies', () => {
        const issues = findStyleIssues('The end result was clear.')
        expect(issues.some(i => i.category === 'redundancy')).toBe(true)
    })

    it('detects adverbs', () => {
        const issues = findStyleIssues('He quickly ran.')
        expect(issues.some(i => i.category === 'adverb')).toBe(true)
    })

    it('skips fenced code and inline code when skipMarkdown=true', () => {
        const md = 'Normal text actually.\n```\nreally very\n```\nInline `basically` code.'
        const issues = findStyleIssues(md, { skipMarkdown: true })
        // Should only catch the weasel in normal text
        expect(issues.filter(i => i.category === 'weasel').length).toBe(1)
    })

    it('detects passive voice heuristically', () => {
        const issues = findStyleIssues('The ball was thrown by John.')
        expect(issues.some(i => i.category === 'passive')).toBe(true)
    })

    it('detects long sentences based on word limit', () => {
        const text = 'This is a simple sentence. ' +
            'This sentence has a lot of words that will exceed the threshold quite easily because it just keeps going on and on without much pause to demonstrate detection.'
        const issues = findStyleIssues(text, { longSentenceWordLimit: 20 })
        expect(issues.some(i => i.category === 'longSentence')).toBe(true)
    })

    it('respects ignores', () => {
        const text = 'This is actually fine.'
        const issues = findStyleIssues(text, { ignores: ['actually'] })
        expect(issues.some(i => i.category === 'weasel')).toBe(false)
    })

    it('detects nominalizations', () => {
        const issues = findStyleIssues('We performed an analysis of the implementation.')
        expect(issues.some(i => i.category === 'nominalization')).toBe(true)
    })

    it('detects expletives', () => {
        const issues1 = findStyleIssues('There are many reasons to proceed.')
        const issues2 = findStyleIssues('It is the team that delivers results.')
        expect(issues1.some(i => i.category === 'expletive')).toBe(true)
        expect(issues2.some(i => i.category === 'expletive')).toBe(true)
    })
})

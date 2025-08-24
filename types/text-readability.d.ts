declare module 'text-readability' {
    const rs: {
        fleschReadingEase(text: string): number
        fleschKincaidGrade(text: string): number
        automatedReadabilityIndex(text: string): number
        sentenceCount(text: string): number
        syllableCount(text: string): number
        charactersCount(text: string): number
    }
    export default rs
}

import { describe, it, expect } from 'vitest'
import { isChallengeExpired } from '../worker/routes/auth'

describe('challenge TTL', () => {
    it('marks recent challenge as not expired', () => {
        const now = Math.floor(Date.now() / 1000)
        const created = now - 60 // 1 minute ago
        expect(isChallengeExpired(created, now)).toBe(false)
    })
    it('marks old challenge as expired', () => {
        const now = Math.floor(Date.now() / 1000)
        const created = now - (60 * 20) // 20 minutes ago
        expect(isChallengeExpired(created, now)).toBe(true)
    })
})

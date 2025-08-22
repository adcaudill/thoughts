import { describe, it, expect } from 'vitest'
import { base64ToUint8, uint8ToBase64, uint8ToBase64Url } from '../../src/lib/base64'

describe('base64 helpers', () => {
    it('encodes and decodes basic input', () => {
        const u8 = new Uint8Array([104, 101, 108, 108, 111]) // 'hello'
        const b64 = uint8ToBase64(u8)
        expect(b64).toBe('aGVsbG8=')
        const out = base64ToUint8(b64)
        expect(Array.from(out)).toEqual(Array.from(u8))
    })

    it('handles base64url without padding', () => {
        const u8 = new Uint8Array([1, 2, 3, 250, 251])
        const b64url = uint8ToBase64Url(u8)
        // should decode back
        const out = base64ToUint8(b64url)
        expect(Array.from(out)).toEqual(Array.from(u8))
    })

    it('accepts input with whitespace and missing padding', () => {
        const u8 = new Uint8Array([116, 101, 115, 116]) // 'test'
        const b64 = uint8ToBase64(u8) // 'dGVzdA=='
        const noisy = b64.replace(/=/g, '').split('').join(' ')
        const out = base64ToUint8(noisy)
        expect(new TextDecoder().decode(out)).toBe('test')
    })

    it('returns empty Uint8Array for empty input', () => {
        const out = base64ToUint8('')
        expect(out).toBeInstanceOf(Uint8Array)
        expect(out.length).toBe(0)
    })

    it('throws on invalid input', () => {
        expect(() => base64ToUint8('!!!')).toThrow()
    })
})

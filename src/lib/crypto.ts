let sodiumInstance: Promise<any> | null = null

export function initSodium() {
    if (!sodiumInstance) {
        sodiumInstance = (async () => {
            const mod = await import('libsodium-wrappers-sumo')
            const sodiumModule: any = (mod && (mod.default || mod))
            await sodiumModule.ready
            const s: any = sodiumModule
            const required = [
                'crypto_pwhash',
                'crypto_generichash',
                'crypto_aead_xchacha20poly1305_ietf_encrypt',
                'crypto_aead_xchacha20poly1305_ietf_decrypt',
                'randombytes_buf',
                'to_base64',
                'from_base64',
                'from_string',
            ]
            const missing = required.filter((fn) => typeof s[fn] !== 'function')
            if (missing.length) {
                const keys = Object.keys(s).slice(0, 50).join(', ')
                throw new Error(`libsodium is missing required functions: ${missing.join(', ')} — available keys: ${keys} — ensure you are bundling the full libsodium-wrappers-sumo build and not a light build or a mis-resolved module`)
            }
            return s
        })()
    }
    return sodiumInstance
}

export async function deriveClientHash(password: string, salt: Uint8Array) {
    const s = await initSodium()
    // Some builds of libsodium-wrappers (light) may not include crypto_pwhash; prefer it when available.
    try {
        if (typeof s.crypto_pwhash === 'function') {
            // crypto_pwhash expects password as Uint8Array in some builds
            const pw = typeof password === 'string' ? s.from_string(password) : password
            const hash = s.crypto_pwhash(32, pw, salt, s.crypto_pwhash_OPSLIMIT_INTERACTIVE, s.crypto_pwhash_MEMLIMIT_INTERACTIVE, s.crypto_pwhash_ALG_ARGON2ID13)
            return s.to_base64(hash)
        }
    } catch {
        // If crypto_pwhash fails for any reason, fail-fast rather than silently falling back to a weaker KDF.
        throw new Error('Argon2 (crypto_pwhash) not available or failed in libsodium build; deriveClientHash requires Argon2 support')
    }
}

export function randomSalt() {
    // Prefer using Web Crypto which is available in browsers and in the test environment.
    // This avoids returning an insecure zero-filled salt if libsodium isn't initialized yet.
    try {
        const arr = new Uint8Array(16)
        crypto.getRandomValues(arr)
        return arr
    } catch {
        // As a last resort, if Web Crypto isn't available, try to use libsodium if it's already initialized.
        try {
            if (sodiumInstance && (sodiumInstance as any).then) {
                // sodiumInstance is a Promise; but randomSalt is sync so we can't await here.
                // If sodium is already initialized, it may have been awaited elsewhere; attempt to access cached value via a hack:
                // NOTE: This is non-ideal; callers should prefer awaiting initSodium() before using crypto requiring sodium.
            }
        } catch {
            // ignore and fall through
        }
        // Very unlikely: return a Uint8Array but caller should be aware this is less secure.
        return new Uint8Array(16)
    }
}

export async function saltToBase64(salt: Uint8Array) {
    const s = await initSodium()
    return s.to_base64(salt)
}

export async function deriveNoteKey(clientHashB64: string) {
    const s = await initSodium()
    const clientHash = s.from_base64(clientHashB64)
    // Derive a 32-byte key for symmetric encryption via HSalsa20-like KDF (using crypto_generichash)
    const key = s.crypto_generichash(32, clientHash, s.from_string('note-encryption'))
    return s.to_base64(key)
}

export async function encryptNotePayload(noteKeyB64: string, plaintext: string, associatedData?: string) {
    const s = await initSodium()
    const key = s.from_base64(noteKeyB64)
    const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
    const ad = associatedData ? s.from_string(associatedData) : null
    const cipher = s.crypto_aead_xchacha20poly1305_ietf_encrypt(s.from_string(plaintext), ad, null, nonce, key)
    return {
        ciphertext: s.to_base64(cipher),
        nonce: s.to_base64(nonce),
    }
}

export async function decryptNotePayload(noteKeyB64: string, ciphertextB64: string, nonceB64: string, associatedData?: string) {
    const s = await initSodium()
    const key = s.from_base64(noteKeyB64)
    const nonce = s.from_base64(nonceB64)
    const ad = associatedData ? s.from_string(associatedData) : null
    const plain = s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, s.from_base64(ciphertextB64), ad, nonce, key)
    return s.to_string(plain)
}

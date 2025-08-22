// UTF-8 safe base64url helpers and JWT sign/verify helpers for the Worker runtime
export function uint8ArrayToBase64Url(u8: Uint8Array) {
    let s = ''
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
    const b64 = btoa(s)
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToUint8Array(b64url: string) {
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
    // pad with =
    while (b64.length % 4 !== 0) b64 += '='
    const bin = atob(b64)
    const u8 = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    return u8
}

export function base64UrlEncodeUtf8(str: string) {
    const enc = new TextEncoder().encode(str)
    return uint8ArrayToBase64Url(enc)
}

export function base64UrlDecodeToUtf8(b64url: string) {
    const u8 = base64UrlToUint8Array(b64url)
    return new TextDecoder().decode(u8)
}

export async function signJwt(payloadObj: any, key: string, opts?: { expSeconds?: number }) {
    const header = { alg: 'HS256', typ: 'JWT' }
    const now = Math.floor(Date.now() / 1000)
    if (opts?.expSeconds) payloadObj.exp = now + opts.expSeconds
    const headerB64 = base64UrlEncodeUtf8(JSON.stringify(header))
    const payloadB64 = base64UrlEncodeUtf8(JSON.stringify(payloadObj))
    const toSign = `${headerB64}.${payloadB64}`
    const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(toSign))
    const sigU8 = new Uint8Array(sig as ArrayBuffer)
    const sigB64url = uint8ArrayToBase64Url(sigU8)
    return `${toSign}.${sigB64url}`
}

export async function verifyJwt(token: string, key: string, expectedPurpose?: string) {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('invalid token')
    const [headerB64, payloadB64, sigB64] = parts
    const toSign = `${headerB64}.${payloadB64}`
    const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = base64UrlToUint8Array(sigB64)
    // compute expected signature and compare in constant time
    const expectedBuf = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(toSign))
    const expected = new Uint8Array(expectedBuf as ArrayBuffer)
    if (!constantTimeEqual(expected, signature)) throw new Error('invalid signature')
    const payloadJson = base64UrlDecodeToUtf8(payloadB64)
    let payload
    try { payload = JSON.parse(payloadJson) } catch { throw new Error('invalid payload') }
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && now > payload.exp) throw new Error('token expired')
    if (expectedPurpose && payload.purpose !== expectedPurpose) throw new Error('invalid purpose')
    return payload
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
    if (a.length !== b.length) return false
    let v = 0
    for (let i = 0; i < a.length; i++) v |= a[i] ^ b[i]
    return v === 0
}

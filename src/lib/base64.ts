// Shared base64 helpers for the client-side code
export function base64ToUint8(b64: string): Uint8Array {
    if (!b64) return new Uint8Array(0)
    // Accept base64url or standard base64 input. Normalize and pad before atob.
    let s = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
    while (s.length % 4 !== 0) s += '='
    let bin: string
    try {
        bin = atob(s)
    } catch (err) {
        throw new Error('invalid base64 input')
    }
    const len = bin.length
    const arr = new Uint8Array(len)
    for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i)
    return arr
}

export function uint8ToBase64(u8: Uint8Array): string {
    let s = ''
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
    return btoa(s)
}

export function uint8ToBase64Url(u8: Uint8Array): string {
    return uint8ToBase64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToUint8Array(b64url: string): Uint8Array {
    return base64ToUint8(b64url)
}

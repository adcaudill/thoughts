export function uint8ToBase64(u8: Uint8Array) {
    let s = ''
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
    return btoa(s)
}

export function base64ToUint8(b64: string) {
    // Accept base64url or standard base64 input
    let b = b64.replace(/-/g, '+').replace(/_/g, '/')
    while (b.length % 4 !== 0) b += '='
    const bin = atob(b)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return arr
}

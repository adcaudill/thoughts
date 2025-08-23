import React, { useState, useEffect } from 'react'
import { randomSalt, deriveClientHash, deriveNoteKey, saltToBase64, encryptNotePayload, decryptNotePayload } from '../lib/crypto'
import { base64ToUint8, uint8ToBase64 } from '../lib/base64'
import { register } from '../lib/api'
import { setSessionFromServer, loadSessionFromStorage } from '../lib/session'

export default function Auth({ onAuth, initialMode, onCancel }: { onAuth: () => void, initialMode?: 'login' | 'register', onCancel?: () => void }) {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [email, setEmail] = useState('')
    const [mode, setMode] = useState<'login' | 'register'>(initialMode || 'register')
    const [loading, setLoading] = useState(false)
    const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [recoverMode, setRecoverMode] = useState(false)
    const [recoveryToken, setRecoveryToken] = useState<string | null>(null)
    const [rememberMe, setRememberMe] = useState(true)

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        const salt = randomSalt()
        const clientHash = await deriveClientHash(password, salt)
        const saltB64 = await saltToBase64(salt)
        // generate a one-time recovery key for the user to store; send a hash to server
        const recBytes = crypto.getRandomValues(new Uint8Array(32))
        const recB64 = btoa(String.fromCharCode(...Array.from(recBytes)))
        setRecoveryKey(recB64)
        // compute a lightweight hash of recovery key to store server-side (do not store raw recovery key)
        const recHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(recB64))
        const recHashB64 = btoa(String.fromCharCode(...new Uint8Array(recHashBuf)))

        // derive the note key so we can encrypt it with the recovery key for server storage
        const noteKey = await deriveNoteKey(clientHash)
        // encrypt noteKey (base64) with recovery key (recB64) using AES-GCM
        // Use the raw 32 bytes as the AES key (not the base64 string bytes)
        const recKeyRaw = recBytes
        const recCryptoKey = await crypto.subtle.importKey('raw', recKeyRaw, { name: 'AES-GCM' }, false, ['encrypt'])
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const encBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, recCryptoKey, new TextEncoder().encode(noteKey))
        const encB64 = btoa(String.fromCharCode(...new Uint8Array(encBuf)))
        const ivB64 = btoa(String.fromCharCode(...iv))

        // persist client salt so login can reuse it later
        try { localStorage.setItem('thoughts.client_salt', saltB64) } catch { }
        const res = await register({ username, email, client_salt: saltB64, client_hash: clientHash, recovery_hash: recHashB64, recovery_encrypted_key: `${ivB64}.${encB64}` })
        setLoading(false)
        if (res.ok) {
            // attempt login flow to get token and derive note key
            await handleLogin(e)
        }
    }

    async function handleLogin(e?: React.FormEvent | null) {
        if (e) e.preventDefault()
        setLoading(true)
        // try to reuse the client salt saved at registration
        let saltB64 = null
        try { saltB64 = localStorage.getItem('thoughts.client_salt') } catch { }
        let clientHash
        if (saltB64) {
            const saltBytes = base64ToUint8(saltB64)
            clientHash = await deriveClientHash(password, saltBytes)
        } else {
            // fallback: generate temporary salt (less likely to succeed if user registered elsewhere)
            const salt = randomSalt()
            clientHash = await deriveClientHash(password, salt)
        }

        // request challenge (server will return client_salt so we can derive clientHash on this device)
        const chalRes = await fetch('/api/auth/challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
        })
        const chal = await chalRes.json()
        if (!chal.ok) {
            setLoading(false)
            return
        }
        // if server returned client_salt, prefer it to local storage
        const serverClientSalt = chal.client_salt
        if (serverClientSalt) {
            try { localStorage.setItem('thoughts.client_salt', serverClientSalt) } catch { }
            // recompute clientHash using server-provided salt
            const saltBytes = base64ToUint8(serverClientSalt)
            clientHash = await deriveClientHash(password, saltBytes)
        }

        const nonceB64 = chal.nonce
        const challengeId = chal.challenge_id

        // compute HMAC(clientHash, nonce)
        const clientKey = base64ToUint8(clientHash)
        const nonceBytes = base64ToUint8(nonceB64)
        const sig = await hmacSha256(clientKey, nonceBytes)
        const proofB64 = uint8ToBase64(new Uint8Array(sig))

        const verifyRes = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, client_hash: clientHash, proof: proofB64, challenge_id: challengeId }),
            credentials: 'same-origin',
        })
        const verifyJson = await verifyRes.json()
        setLoading(false)
        if (verifyJson.ok) {
            // derive note key from clientHash
            const noteKey = await deriveNoteKey(clientHash)
            // Persist note key locally if rememberMe is true
            setSessionFromServer(verifyJson.token || null, noteKey, rememberMe)
            onAuth()
        }
    }

    async function finishRegistration() {
        // attempt to log the user in using the current username/password
        try {
            await handleLogin(null)
        } catch (err) {
            // if login fails, at least switch to login mode so user can try
            setMode('login')
        }
    }

    async function copyRecoveryKey() {
        if (!recoveryKey) return
        try {
            await navigator.clipboard.writeText(recoveryKey)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            // fallback to selecting and alerting
            try { await navigator.clipboard.writeText(recoveryKey) } catch (_) { alert('Copy failed; please select and copy the key manually') }
        }
    }

    async function handleRecoverRequest(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        const res = await fetch('/api/auth/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, recovery_key: recoveryKey }) })
        const j = await res.json()
        setLoading(false)
        if (j.ok) {
            setRecoveryToken(j.token)
            alert('Recovery token issued — enter a new password to rekey your account')
        } else {
            alert('Recovery failed')
        }
    }

    async function handleRekey(e: React.FormEvent) {
        e.preventDefault()
        if (!recoveryToken) return
        setLoading(true)

        // 1) fetch server stored recovery_encrypted_key using the rekey token
        const keyRes = await fetch('/api/auth/recover/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: recoveryToken }) })
        const keyJson = await keyRes.json()
        if (!keyJson.ok || !keyJson.recovery_encrypted_key) {
            setLoading(false)
            alert('Unable to fetch recovery key')
            return
        }
        const [ivB64, encB64] = keyJson.recovery_encrypted_key.split('.')
        // decrypt recovery_encrypted_key with provided recoveryKey to get oldNoteKey
        try {
            const iv = base64ToUint8(ivB64)
            const enc = base64ToUint8(encB64)
            // recoveryKey is the base64 string of the raw 32-byte key; decode it to bytes for AES
            const recKeyBytes = base64ToUint8(recoveryKey || '')
            const recCryptoKey = await crypto.subtle.importKey('raw', (new Uint8Array(recKeyBytes)).buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt'])
            const encArrBuf = (new Uint8Array(enc)).buffer as ArrayBuffer
            const ivView = new Uint8Array(iv)
            const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivView }, recCryptoKey, encArrBuf)
            const oldNoteKey = new TextDecoder().decode(plainBuf)

            // 2) fetch all encrypted notes for this user using the token
            const notesRes = await fetch('/api/auth/recover/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: recoveryToken }) })
            const notesJson = await notesRes.json()
            if (!notesJson.ok) { setLoading(false); alert('Unable to fetch notes'); return }
            const notes = notesJson.notes || []

            // 3) derive new client hash using a new salt
            const newSalt = randomSalt()
            const newClientHash = await deriveClientHash(password, newSalt)
            const newSaltB64 = await saltToBase64(newSalt)
            const newNoteKey = await deriveNoteKey(newClientHash)

            // 4) decrypt each note with oldNoteKey and re-encrypt with newNoteKey
            const reencrypted_notes: Array<any> = []
            for (const n of notes) {
                try {
                    const decrypted = await decryptNotePayload(oldNoteKey, n.content_encrypted, n.nonce)
                    const { ciphertext, nonce } = await encryptNotePayload(newNoteKey, decrypted)
                    reencrypted_notes.push({ id: n.id, content_encrypted: ciphertext, nonce })
                } catch (err) {
                    // skip if decryption fails
                }
            }

            // 5) compute new recovery_encrypted_key (encrypt newNoteKey with recoveryKey)
            const recKey = recoveryKey || ''
            const recKeyBytes2 = base64ToUint8(recKey)
            const recCryptoKey2 = await crypto.subtle.importKey('raw', recKeyBytes2.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt'])
            const iv2 = crypto.getRandomValues(new Uint8Array(12))
            const plainNewKeyBuf = new TextEncoder().encode(newNoteKey)
            const encBuf2 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv2 }, recCryptoKey2, (new Uint8Array(plainNewKeyBuf)).buffer as ArrayBuffer)
            const encB642 = btoa(String.fromCharCode(...new Uint8Array(encBuf2)))
            const ivB642 = btoa(String.fromCharCode(...iv2))
            const newRecoveryEncryptedKey = `${ivB642}.${encB642}`
            const recHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(recKey))
            const recHashB64 = btoa(String.fromCharCode(...new Uint8Array(recHashBuf)))

            // 6) send /rekey with new client hash/salt and the re-encrypted notes
            const res = await fetch('/api/auth/rekey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: recoveryToken, new_client_hash: newClientHash, new_client_salt: newSaltB64, new_recovery_encrypted_key: newRecoveryEncryptedKey, new_recovery_hash: recHashB64, reencrypted_notes }) })
            const j = await res.json()
            setLoading(false)
            if (j.ok) {
                alert('Rekey successful  logging you in')
                // now perform login flow to get token normally
                await handleLogin(e)
            } else {
                alert('Rekey failed')
            }
        } catch (err) {
            setLoading(false)
            alert('Failed to decrypt recovery key or notes')
            return
        }
    }

    useEffect(() => {
        // load remembered note key if present
        try { loadSessionFromStorage() } catch { }
    }, [])

    async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array) {
        const cryptoKey = await crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        return await crypto.subtle.sign('HMAC', cryptoKey, data.buffer as ArrayBuffer)
    }

    return (
        <div className="max-w-xl mx-auto bg-white p-6 rounded shadow">
            <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex gap-2">
                    <button className={`px-3 py-1 rounded ${mode === 'register' ? 'bg-slate-100 auth-pill' : ''}`} onClick={() => setMode('register')}>
                        register
                    </button>
                    <button className={`px-3 py-1 rounded ${mode === 'login' ? 'bg-slate-100 auth-pill' : ''}`} onClick={() => setMode('login')}>
                        login
                    </button>
                </div>
                {onCancel && (
                    <button className="text-sm text-slate-500 underline" onClick={() => onCancel()}>back</button>
                )}
            </div>

            <form onSubmit={mode === 'register' ? handleRegister : handleLogin}>
                <label className="block text-sm">username</label>
                <input placeholder="Username" className="w-full mb-2 border dark:border-slate-800/30 p-2" value={username} onChange={e => setUsername(e.target.value)} />

                {mode === 'register' && (
                    <>
                        <label className="block text-sm">email (optional)</label>
                        <input className="w-full mb-2 border dark:border-slate-800/30 p-2" value={email} onChange={e => setEmail(e.target.value)} />
                    </>
                )}

                <label className="block text-sm">password</label>
                <input placeholder="Password" type="password" className="w-full mb-4 border dark:border-slate-800/30 p-2" value={password} onChange={e => setPassword(e.target.value)} />

                <div className="flex items-center gap-3 mb-3">
                    <label className="inline-flex items-center text-sm">
                        <input type="checkbox" className="mr-2" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                        remember me
                    </label>
                </div>

                <button className="bg-slate-800 text-white px-4 py-2 rounded" disabled={loading}>
                    {mode === 'register' ? 'Create account' : 'Log in'}
                </button>
            </form>
            {mode === 'login' && (
                <div className="mt-4">
                    <button className="text-sm underline" onClick={() => setRecoverMode(v => !v)}>{recoverMode ? 'back to login' : 'recover using recovery key'}</button>
                    {recoverMode && (
                        <form onSubmit={recoveryToken ? handleRekey : handleRecoverRequest} className="mt-2">
                            <label className="block text-sm">recovery key</label>
                            <input className="w-full mb-2 border dark:border-slate-800/30 p-2" value={recoveryKey || ''} onChange={e => setRecoveryKey(e.target.value)} />
                            <button className="bg-yellow-500 px-3 py-1 rounded mr-2" disabled={loading}>{recoveryToken ? 'apply new password' : 'request recovery token'}</button>
                        </form>
                    )}
                </div>
            )}
            {recoveryKey && mode === 'register' && (
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-slate-800/30 rounded">
                    <strong className="text-yellow-800 dark:text-yellow-200">recovery key (save this now):</strong>
                    <div className="mt-2 font-mono break-all p-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded ring-1 ring-slate-100/60 dark:ring-slate-800/60">{recoveryKey}</div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">this one-time recovery key can be used to regain access to encrypted notes if you forget your password. store it safely; it will not be shown again.</p>
                    <div className="mt-2 flex gap-2">
                        <button className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded" onClick={() => copyRecoveryKey()}>{copied ? 'copied' : 'copy recovery key'}</button>
                        <button className="px-3 py-1 bg-green-500 text-white rounded" onClick={() => finishRegistration()}>finish</button>
                    </div>
                </div>
            )}
        </div>
    )
}

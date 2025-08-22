let noteKeyB64: string | null = null
const NOTE_KEY_STORAGE = 'thoughts.note_key'
const REMEMBER_KEY_FLAG = 'thoughts.remember'

// Set session: token is stored as HttpOnly cookie by the server. We only keep the note key client-side.
export function setSessionFromServer(token: string | null, keyB64: string, remember = true) {
    // token is expected to be set via HttpOnly cookie; we still accept it optionally for compatibility
    noteKeyB64 = keyB64
    try {
        if (remember) {
            localStorage.setItem(NOTE_KEY_STORAGE, keyB64)
            localStorage.setItem(REMEMBER_KEY_FLAG, '1')
        } else {
            localStorage.removeItem(NOTE_KEY_STORAGE)
            localStorage.setItem(REMEMBER_KEY_FLAG, '0')
        }
    } catch { }
}

export function clearSessionLocal() {
    noteKeyB64 = null
    try {
        localStorage.removeItem(NOTE_KEY_STORAGE)
        localStorage.removeItem(REMEMBER_KEY_FLAG)
    } catch { }
}

export function loadSessionFromStorage() {
    try {
        const flag = localStorage.getItem(REMEMBER_KEY_FLAG)
        if (flag === '1') {
            const stored = localStorage.getItem(NOTE_KEY_STORAGE)
            if (stored) noteKeyB64 = stored
        }
    } catch { }
}

export function getNoteKey() { return noteKeyB64 }

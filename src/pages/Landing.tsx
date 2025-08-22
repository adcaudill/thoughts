import React from 'react'

export default function Landing() {
    return (
        <div className="mx-auto max-w-5xl">
            <section className="bg-white p-10 rounded-lg shadow-md mb-8">
                <div className="max-w-3xl">
                    <div className="flex items-center gap-6">
                        <div aria-hidden="true" className="w-20 h-20 bg-gradient-to-br from-sky-100 to-slate-50 rounded-full flex items-center justify-center">
                            <svg width="48" height="48" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                {/* notebook */}
                                <rect x="8" y="12" width="36" height="40" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
                                <line x1="14" y1="18" x2="40" y2="18" stroke="#e6eef7" strokeWidth="1.2" />
                                <line x1="14" y1="26" x2="40" y2="26" stroke="#eef6fb" strokeWidth="1" />
                                <line x1="14" y1="34" x2="40" y2="34" stroke="#eef6fb" strokeWidth="1" />

                                {/* padlock overlay */}
                                <g transform="translate(28, 30)">
                                    <rect x="0" y="0" width="20" height="14" rx="2" fill="#0ea5e9" />
                                    <path d="M14 0v-4a4 4 0 0 0-8 0v4" transform="translate(0,-8)" stroke="#0f172a" strokeWidth="2" fill="none" strokeLinecap="round" />
                                    <circle cx="10" cy="7" r="1.6" fill="#031026" />
                                </g>
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-3xl font-semibold lowercase">thoughts</h2>
                            <p className="mt-2 text-slate-600 lowercase">private, end-to-end encrypted notes for writers and thinkers.</p>
                        </div>
                    </div>

                    <div className="mt-6 prose space-y-6">
                        <p className="lowercase">thoughts encrypts your notes in the browser before they leave your device. the server stores only encrypted blobs and associated metadata (timestamps, folder ids). the server does not have the keys needed to read your notes.</p>

                        <h3 className="lowercase">why it matters</h3>
                        <ul>
                            <li className="lowercase">keep sensitive drafts and ideas private by encrypting client-side</li>
                            <li className="lowercase">minimize trust in the server: encrypted data is unreadable without your key</li>
                            <li className="lowercase">simple recovery option: generate a one-time recovery key at signup to rekey notes if needed</li>
                        </ul>

                        <h3 className="lowercase">security (what we use)</h3>
                        <p className="lowercase">the implementation uses audited, well-known primitives provided by <code>libsodium-wrappers-sumo</code> and the browser's web crypto where appropriate. in plain terms:</p>
                        <ul>
                            <li className="lowercase">password hashing / kdf: argon2id (via libsodium's <code>crypto_pwhash</code>) with interactive limits for a balance of security and performance</li>
                            <li className="lowercase">note-key derivation: a keyed generichash (<code>crypto_generichash</code>) to derive a stable symmetric key for note encryption</li>
                            <li className="lowercase">authenticated encryption: xchacha20-poly1305 ae/aead (<code>crypto_aead_xchacha20poly1305_ietf_encrypt</code>) for encrypting note payloads with a random nonce</li>
                            <li className="lowercase">secure random: libsodium's or the browser's secure RNG is used for salts, nonces, and recovery key material</li>
                            <li className="lowercase">recovery wrapping: the client encrypts the note key with a one-time recovery key using aes-gcm (web crypto) before sending the wrapped blob to the server</li>
                        </ul>

                        <h3 className="lowercase">open source & audit</h3>
                        <p className="lowercase">the code is open-source, non-commercial, and available to inspect. the cryptographic choices and code are auditable in the repository: <a href="https://github.com/adcaudill/thoughts" className="text-sky-600 underline" target="_blank" rel="noreferrer">github</a>.</p>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <article className="bg-white p-6 rounded shadow-sm">
                    <h4 className="font-semibold lowercase">security highlights</h4>
                    <ul className="mt-3 lowercase">
                        <li>end-to-end encryption with client-side key derivation</li>
                        <li>recovery key option to re-encrypt notes if you lose your password</li>
                        <li>minimal, non-commercial service model</li>
                    </ul>
                </article>

                <article className="bg-white p-6 rounded shadow-sm">
                    <h4 className="font-semibold lowercase">faq</h4>
                    <div className="mt-3 text-sm lowercase">
                        <p><strong>is this free?</strong> yes — open-source and non-commercial.</p>
                        <details className="lowercase">
                            <summary className="font-medium">what algorithms are used?</summary>
                            <p className="mt-2">argon2id for password hashing, libsodium generichash for deriving the note key, and xchacha20-poly1305 for authenticated encryption of note contents. recovery wrapping uses aes-gcm in the browser.</p>
                        </details>

                        <details className="lowercase">
                            <summary className="font-medium">does the server store my keys or plaintext?</summary>
                            <p className="mt-2">no — the server stores ciphertext blobs and nonces. only the client can derive and hold the keys needed to decrypt the notes.</p>
                        </details>

                        <details className="lowercase">
                            <summary className="font-medium">what if i lose my password?</summary>
                            <p className="mt-2">if you created a recovery key at signup, you can use it to request a rekey token and re-encrypt notes with a new password. without a recovery key, lost passwords cannot be recovered (this is by design for end-to-end security).</p>
                        </details>

                        <details className="lowercase">
                            <summary className="font-medium">can i export my notes?</summary>
                            <p className="mt-2">export is planned: you will be able to export encrypted blobs or decrypted plaintext if you have your note key. for now, you can copy content from the editor manually.</p>
                        </details>

                        <details className="lowercase">
                            <summary className="font-medium">how long is my data retained?</summary>
                            <p className="mt-2">retention follows the service policy in the repo — by default, notes remain until deleted. since the server stores ciphertext only, retention concerns should be considered along with key management.</p>
                        </details>

                        <details className="lowercase">
                            <summary className="font-medium">is multi-device supported?</summary>
                            <p className="mt-2">yes — logging in from another device derives the same note key from your password (assuming the same client salt). recovery key flows can help when salts differ or you need to rekey notes.</p>
                        </details>
                    </div>
                </article>
            </section>
            <footer className="mt-10 text-sm text-slate-500">
                <div className="mx-auto max-w-5xl px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="text-slate-600">
                        © {new Date().getFullYear()} <a href="https://adamcaudill.com" target="_blank" rel="noreferrer" className="text-sky-600 underline">Adam Caudill</a>
                    </div>

                    <div className="flex items-center space-x-4">
                        <a href="https://github.com/adcaudill/thoughts" target="_blank" rel="noreferrer" aria-label="GitHub" className="text-slate-600 hover:text-sky-600">
                            <i className="fa-brands fa-github fa-lg" aria-hidden="true"></i>
                            <span className="sr-only">GitHub</span>
                        </a>

                        <a href="https://infosec.exchange/@adam_caudill" target="_blank" rel="noreferrer" aria-label="Mastodon" className="text-slate-600 hover:text-sky-600">
                            <i className="fa-brands fa-mastodon fa-lg" aria-hidden="true"></i>
                            <span className="sr-only">Mastodon</span>
                        </a>

                        <a href="https://bsky.app/profile/adamcaudill.com" target="_blank" rel="noreferrer" aria-label="Bluesky" className="text-slate-600 hover:text-sky-600">
                            <i className="fa-brands fa-bluesky fa-lg" aria-hidden="true"></i>
                            <span className="sr-only">Bluesky</span>
                        </a>
                    </div>
                </div>
            </footer>

        </div>
    )
}

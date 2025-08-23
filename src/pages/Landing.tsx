import React from 'react'

export default function Landing() {
    return (
        <div className="mx-auto max-w-6xl">
            {/* hero */}
            <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 via-white to-slate-50 p-10 shadow-md ring-1 ring-slate-100 mb-10 dark:bg-gradient-to-br dark:from-slate-800 dark:via-slate-900 dark:to-slate-950 dark:ring-0 dark:shadow-none">
                <div className="max-w-3xl">
                    <div className="flex items-start gap-6">
                        <div aria-hidden="true" className="w-20 h-20 bg-gradient-to-br from-sky-100 to-slate-50 rounded-full flex items-center justify-center shadow-sm dark:bg-gradient-to-br dark:from-slate-700 dark:via-slate-800 dark:to-slate-700">
                            <svg width="48" height="48" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                {/* notebook */}
                                <rect x="8" y="12" width="36" height="40" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" className="dark:fill-[#0f172a] dark:stroke-[#334155]" />
                                <line x1="14" y1="18" x2="40" y2="18" stroke="#e6eef7" strokeWidth="1.2" className="dark:stroke-[#1e293b]" />
                                <line x1="14" y1="26" x2="40" y2="26" stroke="#eef6fb" strokeWidth="1" className="dark:stroke-[#1e293b]" />
                                <line x1="14" y1="34" x2="40" y2="34" stroke="#eef6fb" strokeWidth="1" className="dark:stroke-[#1e293b]" />

                                {/* padlock overlay */}
                                <g transform="translate(28, 30)">
                                    <rect x="0" y="0" width="20" height="14" rx="2" fill="#0ea5e9" className="dark:fill-[#60a5fa]" />
                                    <path d="M14 0v-4a4 4 0 0 0-8 0v4" transform="translate(0,-8)" stroke="#0f172a" strokeWidth="2" fill="none" strokeLinecap="round" className="dark:stroke-[#e6eef7]" />
                                    <circle cx="10" cy="7" r="1.6" fill="#031026" className="dark:fill-[#0b1220]" />
                                </g>
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-3xl font-semibold lowercase text-slate-900 dark:text-slate-100">collect your thoughts. write privately.</h2>
                            <p className="mt-2 text-slate-600 lowercase dark:text-slate-300">a focused, end-to-end encrypted notes app for writers and anyone who values privacy.</p>
                            <p className="mt-3 text-slate-500 italic lowercase dark:text-slate-400">lowercase on purpose — a small nod to e. e. cummings and the quiet focus of writing.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* value props */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <article className="bg-white p-6 rounded-xl shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/30">
                    <h3 className="font-semibold lowercase">for writers</h3>
                    <p className="mt-2 text-slate-600 lowercase">organise ideas with folders, keep drafts together, and write in a clean, distraction-light editor. autosave and cmd/ctrl+s keep your flow.</p>
                </article>
                <article className="bg-white p-6 rounded-xl shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/30">
                    <h3 className="font-semibold lowercase">private by design</h3>
                    <p className="mt-2 text-slate-600 lowercase">notes and folder names are encrypted on your device before they are stored. the server only sees ciphertext and metadata like timestamps and folder ids.</p>
                </article>
                <article className="bg-white p-6 rounded-xl shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/30">
                    <h3 className="font-semibold lowercase">simple & mobile-friendly</h3>
                    <p className="mt-2 text-slate-600 lowercase">works comfortably on phones, tablets, and desktops. the sidebar collapses on small screens; the editor adapts its toolbar — easy from any device.</p>
                </article>
            </section>

            {/* details that matter */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <article className="bg-white p-6 rounded-xl shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/30">
                    <h4 className="font-semibold lowercase">how security actually works</h4>
                    <ul className="mt-3 space-y-2 text-slate-700 text-sm">
                        <li className="lowercase">client-side key derivation: your password is converted to a key with argon2id (<code>crypto_pwhash</code> via <code>libsodium-wrappers-sumo</code>).</li>
                        <li className="lowercase">note key: a stable symmetric key is derived with <code>crypto_generichash</code> and used only in your browser.</li>
                        <li className="lowercase">encryption: note contents are sealed with xchacha20-poly1305 (<code>crypto_aead_xchacha20poly1305_ietf_encrypt</code>) and a random nonce.</li>
                        <li className="lowercase">recovery: an optional one-time recovery key wraps the note key using aes-gcm (web crypto). this enables rekeying without exposing plaintext to the server.</li>
                        <li className="lowercase">auth: sessions use jwt set as an httponly cookie with samesite=strict. the server never receives the plaintext password or note key.</li>
                    </ul>
                </article>

                <article className="bg-white p-6 rounded-xl shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/30">
                    <h4 className="font-semibold lowercase">built for organising and focus</h4>
                    <ul className="mt-3 space-y-2 text-slate-700 text-sm">
                        <li className="lowercase">folders (with nesting) to group projects, chapters, characters, or research.</li>
                        <li className="lowercase">a clean editor with headings, lists, quotes, links, and code when you need it.</li>
                        <li className="lowercase">autosave in the background; manual save with cmd/ctrl+s.</li>
                        <li className="lowercase">titles live with your content — even previews are decrypted locally.</li>
                    </ul>
                </article>
            </section>

            <section className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
                <article className="bg-white p-6 rounded-xl shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/30">
                    <h4 className="font-semibold lowercase">multi‑device</h4>
                    <p className="mt-2 text-slate-600 lowercase">sign in on another device and derive the same note key using your password and client salt. nothing sensitive is emailed or exported.</p>
                </article>
                <article className="bg-white p-6 rounded-xl shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/30">
                    <h4 className="font-semibold lowercase">open-source & non‑commercial</h4>
                    <p className="mt-2 text-slate-600 lowercase">this project is open-source and not a commercial service. read the code, file issues, or contribute: <a href="https://github.com/adcaudill/thoughts" className="text-sky-600 underline" target="_blank" rel="noreferrer">github</a>.</p>
                </article>
                <article className="bg-white p-6 rounded-xl shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/30">
                    <h4 className="font-semibold lowercase">what we store</h4>
                    <p className="mt-2 text-slate-600 lowercase">only encrypted note blobs, nonces, and basic metadata (timestamps, folder ids). non-default folder names are encrypted on the client.</p>
                </article>
            </section>

            <footer className="mt-10 text-sm text-slate-500">
                <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="text-slate-600">
                        © {new Date().getFullYear()} <a href="https://adamcaudill.com" target="_blank" rel="noreferrer" className="text-sky-600 underline">adam caudill</a>
                    </div>

                    <div className="flex items-center space-x-4">
                        <a href="https://github.com/adcaudill/thoughts" target="_blank" rel="noreferrer" aria-label="GitHub" className="text-slate-600 hover:text-sky-600">
                            <i className="fa-brands fa-github fa-lg" aria-hidden="true"></i>
                            <span className="sr-only">github</span>
                        </a>

                        <a href="https://infosec.exchange/@adam_caudill" target="_blank" rel="noreferrer" aria-label="Mastodon" className="text-slate-600 hover:text-sky-600">
                            <i className="fa-brands fa-mastodon fa-lg" aria-hidden="true"></i>
                            <span className="sr-only">mastodon</span>
                        </a>

                        <a href="https://bsky.app/profile/adamcaudill.com" target="_blank" rel="noreferrer" aria-label="Bluesky" className="text-slate-600 hover:text-sky-600">
                            <i className="fa-brands fa-bluesky fa-lg" aria-hidden="true"></i>
                            <span className="sr-only">bluesky</span>
                        </a>
                    </div>
                </div>
            </footer>

        </div>
    )
}

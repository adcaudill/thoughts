# thoughts

Thoughts is a private, end-to-end encrypted notes app aimed at writers and anyone who wants simple, secure note-taking.

The repo contains:

- A Vite + React + TypeScript frontend (source in `src/`).
- A Cloudflare Worker backend (entry: `worker/index.ts`) using itty-router and Cloudflare D1 for storage.
- Client-side cryptography using `libsodium-wrappers-sumo` and browser WebCrypto primitives. Password hashing and KDFs use Argon2 (via libsodium where available).

## Key features

- Client-side E2EE for note contents (xchacha20-poly1305 + authenticated encryption).
- Password-derived keys and Argon2 for server-side verification without storing raw passwords.
- D1-backed storage for notes and user metadata via the Worker.
- Test coverage with Vitest and Playwright for integration/e2e checks.

## Quick start (local)

1. Install dependencies:

```bash
npm install
```

2. Run the frontend only (fast dev server):

```bash
npm run dev
```

3. Run the full local development environment (frontend build watcher + Wrangler dev):

```bash
npm run dev:local
```

This uses `concurrently` to run a Vite build in watch mode and `wrangler dev --local` to serve the Worker and static assets from `dist/`.

## Worker & Cloudflare

- Worker entry is `worker/index.ts`. Configuration is in `wrangler.toml`.
- The project expects a D1 database binding named `DB`; migrations live in `migrations/` and can be applied with:

```bash
npm run db:migrate
```

See `wrangler.toml` for configured database ids and preview ids.

## Scripts

- `npm run dev` — Vite dev server for the frontend.
- `npm run dev:local` — Build watcher + Wrangler local dev (recommended for full-stack local testing).
- `npm run worker:dev` — Run the Worker with Wrangler (local/remote options depend on flags).
- `npm run build` — Build the frontend for production.
- `npm run preview` — Serve the production build locally.
- `npm test` — Run Vitest tests.
- `npm run test:watch` — Run Vitest in watch mode.
- `npm run typecheck` — Run TypeScript compiler for types-only checks.
- `npm run lint` — Run ESLint.
- `npm run fmt` — Run Prettier to format files.

## Security notes (important)

- End-to-end encryption: the client derives encryption keys locally from your password. Encrypted note content is stored on the server, but the server never receives the plaintext or the raw password.
- Password hashing / KDF: Argon2 (libsodium's crypto_pwhash) is used where available with interactive parameters tuned for client performance.
- Recovery: Password resets will not decrypt existing notes. A recovery key is required to wrap/unwrap note keys. Treat recovery keys like secrets.
- Cryptography is implemented using audited primitives from `libsodium-wrappers-sumo` and the browser WebCrypto API; do not substitute custom crypto.

Testing

- Unit tests: `vitest` (see `test/unit` and `test` folders).
- Integration/e2e: Playwright and Vitest-powered browser tests live in `test/e2e` and `test/integration`.

## Notable files & folders

- `src/` — Frontend React + TypeScript app (components, pages, styles).
- `worker/` — Cloudflare Worker code and route handlers.
- `migrations/` — D1 migrations for the database schema.
- `wrangler.toml` — Wrangler configuration (bindings, assets, databases).
- `package.json` — Scripts and dependencies.

## Contributing

- Open an issue or a PR. Tests should be added for new features or bug fixes.
- Run `npm run fmt` and `npm run lint` before opening a PR.

## License

- This project is licensed under the terms in `LICENSE`.

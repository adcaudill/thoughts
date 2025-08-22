# thoughts

Simple, private notes for writers.

This repo contains a Vite + React + TypeScript frontend and a Cloudflare Worker backend skeleton intended for D1 storage. The project uses client-side end-to-end encryption with libsodium and server-side argon2id for password hashing.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Frontend dev:

   ```bash
   npm run dev
   ```

3. Worker development requires Wrangler and a Cloudflare account. See `wrangler.toml` and the Cloudflare docs.

## Security notes

- The client derives an encryption key from your password and encrypts note content locally; the server never receives your raw password.
- Password resets will not recover encrypted notes. Keep a recovery key.

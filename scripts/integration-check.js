#!/usr/bin/env node
const http = require('http')
const https = require('https')
const { URL } = require('url')
const crypto = require('crypto')

function post(path, body) {
    const url = new URL(path)
    const data = JSON.stringify(body)
    const opts = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    }
    const lib = url.protocol === 'https:' ? https : http
    return new Promise((resolve, reject) => {
        const req = lib.request(opts, res => {
            let bufs = []
            res.on('data', d => bufs.push(d))
            res.on('end', () => {
                const text = Buffer.concat(bufs).toString()
                let json = null
                try { json = JSON.parse(text) } catch (e) { }
                resolve({ status: res.statusCode, text, json })
            })
        })
        req.on('error', reject)
        req.write(data)
        req.end()
    })
}

async function run() {
    const base = process.env.BASE_URL || 'http://localhost:8787'
    const suffix = Math.random().toString(36).slice(2, 8)
    const registerBody = {
        username: `adamcaudill_${suffix}`,
        email: `adam+${suffix}@adamcaudill.com`,
        client_salt: 'H1BS0uukF73fINYp5OVQ2w',
        client_hash: 'iBWMEaAyQaaYrn8KZWY_6tvSO5jG5I_JCNL7F-UJzGg',
        recovery_hash: 'O5A536CgNyc+qQCdpvCd1UpFOpfOe8b54r2CIpfM7kw=',
        recovery_encrypted_key: 'PTXCX89XnRyAepSD.33OwrPBw0nerVkHi0JeU/6VVPMR4k/yn/xFoyKCaMR0WlEQItwk+nCtOybC9uq4CGsLtwI890PIhvWk='
    }

    console.log('POST', base + '/api/auth/register')
    const reg = await post(base + '/api/auth/register', registerBody)
    console.log('register', reg.status, reg.text)
    if (!reg.json || !reg.json.ok) {
        console.error('register failed; aborting')
        process.exit(2)
    }

    console.log('POST', base + '/api/auth/challenge')
    const chall = await post(base + '/api/auth/challenge', { username: registerBody.username })
    console.log('challenge', chall.status, chall.text)
    if (!chall.json || !chall.json.ok) {
        console.error('challenge failed; aborting')
        process.exit(3)
    }

    const { nonce, challenge_id } = chall.json
    const clientHashB64 = registerBody.client_hash
    // convert base64url to base64 if needed
    const normalize = s => s.replace(/-/g, '+').replace(/_/g, '/').replace(/\./g, '\+') // keep dot as is? but client hash can contain _ and -
    // We'll handle typical base64url -> base64
    const toStandardB64 = s => s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '') + (s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '')
    const clientKey = Buffer.from(toStandardB64(clientHashB64), 'base64')
    const nonceBuf = Buffer.from(toStandardB64(nonce), 'base64')

    const proofBuf = crypto.createHmac('sha256', clientKey).update(nonceBuf).digest()
    const proofB64 = proofBuf.toString('base64')

    console.log('Computed proof (base64):', proofB64)

    console.log('POST', base + '/api/auth/verify')
    const verify = await post(base + '/api/auth/verify', { username: registerBody.username, client_hash: registerBody.client_hash, proof: proofB64, challenge_id })
    console.log('verify', verify.status, verify.text)
    if (!verify.json || !verify.json.ok) {
        console.error('verify failed')
        process.exit(4)
    }

    console.log('Integration check succeeded; token:', verify.json.token)
}

run().catch(err => { console.error('script error', err); process.exit(1) })

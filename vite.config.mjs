import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('libsodium')) return 'vendor.libsodium'
                        if (id.includes('argon2-browser')) return 'vendor.argon2'
                        if (id.includes('react')) return 'vendor.react'
                        if (id.includes('@mui') || id.includes('@emotion')) return 'vendor.mui'
                        // group other node_modules into a vendors chunk
                        return 'vendor'
                    }
                },
            },
        },
    },
})

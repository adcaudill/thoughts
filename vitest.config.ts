import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./test/setupTests.ts'],
        pool: 'threads',
        poolOptions: {
            threads: {
                minThreads: 1,
                maxThreads: 2,
            },
        },
        maxConcurrency: 1,
    },
})

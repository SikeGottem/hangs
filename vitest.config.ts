// Vitest config: local file DB, @/ alias, and a stub for the server-only marker.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^server-only$/, replacement: `${root}tests/server-only-stub.ts` },
      { find: /^@\//, replacement: root },
    ],
  },
  test: {
    env: { HANGS_LOCAL_DB: '1' },
    include: ['lib/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
  },
})

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // These are pure functions. jsdom costs seconds of startup to provide a
    // DOM none of them touch; the two Storage objects they do touch are
    // faked in setup.ts, deterministically.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
})

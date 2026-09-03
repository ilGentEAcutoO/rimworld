import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

// Read on the Node side at config time, then handed to the Workers runtime as a
// binding — the setup file cannot import this config from inside the isolate.
const migrations = await readD1Migrations('./migrations');

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // The real secrets live in .dev.vars / `wrangler secret put`.
        // Tests pin their own throwaway values so assertions are deterministic.
        bindings: {
          AUTH_USER: 'testuser',
          AUTH_PASS: 'test-pass-not-real',
          TEST_MIGRATIONS: migrations,
        },
      },
    }),
  ],
  test: {
    // public/*.test.js are CommonJS node:test files run by `npm run test:app`.
    include: ['src/**/*.test.js'],
    setupFiles: ['./test/setup.js'],
  },
});

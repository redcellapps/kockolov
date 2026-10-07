import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: {
      // Integration tests need a throwaway database; they are skipped when it is unreachable.
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://kockolov:kockolov@127.0.0.1:54329/kockolov_test',
      CRAWLER_DELAY_MS: '0',
      PUBLIC_MODE: 'false',
      TZ_NAME: 'Europe/Belgrade',
      // preview images go to a throwaway folder; no background drawing during tests
      OG_CACHE_DIR: path.join(os.tmpdir(), `kockolov-og-test-${process.pid}`),
      OG_WARM_MINUTES: '0',
    },
    testTimeout: 30000,
    fileParallelism: false,
  },
});

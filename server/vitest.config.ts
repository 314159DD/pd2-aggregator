import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 30000,
    include: ['test/**/*.test.ts'],
  },
});

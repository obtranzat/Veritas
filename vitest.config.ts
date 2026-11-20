import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    env: {
      VERITAS_DATA_DIR: '/tmp/veritas-vitest-store',
    },
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/visual-regression.spec.ts', 'node_modules/**', 'dist/**'],
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: [
        'src/server/app.ts',
        'src/server/codeAnalysis.ts',
        'src/server/openapi.ts',
        'src/server/parsers.ts',
        'src/server/pipeline.ts',
        'src/server/security.ts',
        'src/server/store.ts',
        'src/server/stylometry.ts',
        'src/utils/exportClient.ts',
      ],
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 80,
      },
    },
  },
});

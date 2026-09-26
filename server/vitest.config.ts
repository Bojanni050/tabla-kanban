import { defineConfig } from 'vitest/config';

// API tests run against a real PostgreSQL database (see tests/setup.ts and README
// "Integration API tests"). Run migrations for it first:
//   DATABASE_URL=<test-url> npx prisma migrate deploy
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://kanban:kanban@localhost:5432/kanban_test?schema=public';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    // One shared test database: run files sequentially, each in an isolated worker.
    pool: 'forks',
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: 'test',
    },
  },
});

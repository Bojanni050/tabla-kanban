// Runs in each test worker before any test file is imported, so the app (which loads
// server/.env through dotenv at import time) already sees the test database URL.
// dotenv never overrides variables that are already set.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://kanban:kanban@localhost:5432/kanban_test?schema=public';

// Tests must never fall through to production-only configuration checks.
process.env.NODE_ENV = 'test';

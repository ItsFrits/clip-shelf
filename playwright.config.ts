import { defineConfig } from '@playwright/test'

// The end to end smoke test drives the built app, see docs/specs/e2e-smoke.md.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  // One app at a time, and no retries: a flaky step gets fixed, not retried.
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list'
})

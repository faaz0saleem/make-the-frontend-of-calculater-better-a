import { defineConfig } from '@playwright/test';

/**
 * E2E against the PRODUCTION build served under a nested path inside an iframe host page.
 * Chromium uses SwiftShader (software WebGL) in CI containers, so flows use the query-gated QA
 * hooks (?qa=1) to drive with the scripted autopilot at accelerated simulation speed.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  // E2E_JSON lets each suite keep its own results file (e.g. qa/e2e-flows-results.json).
  reporter: [['list'], ['json', { outputFile: process.env.E2E_JSON ?? 'qa/e2e-results.json' }]],
  use: {
    baseURL: 'http://localhost:4180',
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    command: 'node scripts/serve-nested.mjs dist 4180',
    port: 4180,
    reuseExistingServer: true,
  },
});

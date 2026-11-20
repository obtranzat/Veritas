import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.VERITAS_BASE_URL || 'http://127.0.0.1:3000';
const externalServer = Boolean(process.env.VERITAS_BASE_URL);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.015,
      animations: 'disabled',
    },
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(externalServer
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: `${baseURL}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      }),
});

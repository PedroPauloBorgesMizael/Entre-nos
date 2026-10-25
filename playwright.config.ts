import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  workers: 1, // um worker por vez devido ao banco de dados embutido
  use: {
    baseURL: 'http://127.0.0.1:8899',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'Mobile Narrow (320px)',
      use: {
        browserName: 'chromium',
        viewport: { width: 320, height: 568 },
        hasTouch: true,
      },
    },
    {
      name: 'Mobile Conventional (390px)',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
  ],
});

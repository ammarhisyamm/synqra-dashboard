import { defineConfig, devices } from '@playwright/test';
const devPort=process.env.E2E_DEV_PORT || '5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:'+devPort,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name:'chromium', use:{ ...devices['Desktop Chrome'] } },
    ...(process.env.E2E_CROSS_BROWSER === '1' ? [
      { name:'firefox', use:{ ...devices['Desktop Firefox'] } },
      { name:'webkit', use:{ ...devices['Desktop Safari'] } }
    ] : [])
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1 --strictPort --port '+devPort,
    url: 'http://127.0.0.1:'+devPort,
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', timeout: 60000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4174', browserName: 'chromium',
    viewport: { width: 1440, height: 1000 }, permissions: ['camera'],
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node tools/serve-web.mjs --demo --port 4174', url: 'http://127.0.0.1:4174', reuseExistingServer: !process.env.CI },
});

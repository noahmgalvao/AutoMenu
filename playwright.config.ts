import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  outputDir: 'test-results',
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    channel: process.env.AUTOMENU_TEST_BROWSER || undefined,
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: 'npm exec -- vite --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/tests/fixtures/template-editor.html',
    env: {
      VITE_HISTORY_V12_ENABLED: 'false',
      VITE_SUPABASE_URL: 'http://127.0.0.1:4174',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'local-editor-browser-test',
    },
    timeout: 90000,
  },
});

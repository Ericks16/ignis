import { defineConfig } from '@playwright/test';

// Usa Microsoft Edge instalado (no descarga navegadores). El entorno (BD, API y web) lo levanta global-setup.js.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  retries: 0,
  reporter: [['list']],
  globalSetup: './global-setup.js',
  use: { baseURL: 'http://localhost:5174', channel: process.env.E2E_BROWSER === 'chromium' ? undefined : 'msedge', headless: true, locale: 'es-EC', timezoneId: 'America/Guayaquil', trace: 'retain-on-failure' },
});

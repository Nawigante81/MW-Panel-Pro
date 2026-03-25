import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
  },
  webServer: [
    {
      command: 'node server/index.js',
      port: 8787,
      reuseExistingServer: !process.env.CI,
      env: {
        API_TOKEN: 'e2e_api_token_1234567890_abcdefghijklmnopqrstuvwxyz',
        JWT_SECRET: 'e2e_jwt_secret_1234567890_abcdefghijklmnopqrstuvwxyz',
        BOOTSTRAP_ADMIN_EMAIL: 'e2e-admin@mwpanel.local',
        BOOTSTRAP_ADMIN_PASSWORD: 'E2eAdminPassword!123',
        DB_PATH: 'data/mwpanel-e2e.sqlite',
      },
    },
    {
      command: 'npm run dev:web -- --host 127.0.0.1 --port 5173',
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});

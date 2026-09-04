import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    env: {
      MOSTRO_PUBKEY: "1".repeat(64),
      RELAYS: "wss://relay.example",
      MOSTRO_WEB_MOCK_CLI: "1",
      MOSTRO_STATE_PATH: ".next-e2e/local-state.json",
      NEXT_DIST_DIR: ".next-e2e"
    },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});

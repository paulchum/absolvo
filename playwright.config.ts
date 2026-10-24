import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const port = 3320;
const origin = `http://127.0.0.1:${port}`;
// Workers re-import this config, so only the runner clears old data, and each run gets its own directory.
if (!process.env.TEST_WORKER_INDEX && !process.env.ABSOLVO_E2E_RUN) fs.rmSync(".data-e2e", { recursive: true, force: true });
process.env.ABSOLVO_E2E_RUN ??= String(Date.now());
const dataDir = path.resolve(".data-e2e", process.env.ABSOLVO_E2E_RUN);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL: origin, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: origin,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      APP_URL: origin,
      ABSOLVO_DATA_DIR: dataDir,
      ABSOLVO_INQUISITOR: "mock",
      DEEPSEEK_API_KEY: "",
      ABSOLVO_JUDGMENTS_PER_HOUR: "100",
      ABSOLVO_MOCK_DELAY_MS: "300",
      ABSOLVO_DEV_BYPASS: "true",
      ABSOLVO_DEV_BYPASS_IN_PRODUCTION: "true",
      ABSOLVO_WALL_DELAY_SECONDS: "0",
      STRIPE_SECRET_KEY: "",
      ANTHROPIC_API_KEY: ""
    }
  }
});

import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["connected.spec.ts", "security.connected.spec.ts"],
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:5174",
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev:local",
    url: "http://localhost:5174",
    reuseExistingServer: true,
  },
  projects: [
    { name: "supabase-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});

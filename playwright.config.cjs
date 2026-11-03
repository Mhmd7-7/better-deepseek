const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: ["quick-access.spec.cjs", "workspace.spec.cjs", "compiled.spec.cjs"],
  workers: 1,
  timeout: 20_000,
  reporter: "list",
  use: {
    headless: true,
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});

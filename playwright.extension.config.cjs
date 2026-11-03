const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e', testMatch: 'workspace-smoke.spec.js', workers: 1,
  timeout: 45000, reporter: 'list', use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});

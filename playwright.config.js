// @ts-check
const { defineConfig } = require("@playwright/test");

const isCI = !!process.env.CI;

module.exports = defineConfig({
  testDir: "./ests",
  forbidOnly: isCI,
  retries: 0,
  workers: isCI ? 2 : undefined,
  use: {
    trace: "off",
  },
});

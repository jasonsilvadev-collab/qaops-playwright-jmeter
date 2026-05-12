// @ts-check
require("dotenv").config();
const { defineConfig } = require("@playwright/test");

const isCI = !!process.env.CI;
const reqresKey = process.env.REQRES_API_KEY?.trim();

module.exports = defineConfig({
  testDir: "./ests",
  forbidOnly: isCI,
  retries: 0,
  workers: isCI ? 2 : undefined,
  use: {
    trace: "off",
    ...(reqresKey
      ? { extraHTTPHeaders: { "x-api-key": reqresKey } }
      : {}),
  },
});

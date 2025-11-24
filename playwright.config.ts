import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./generated-tests",
  outputDir: "test-results",
  testMatch: ["**/*.spec.js"],

  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,

  reporter: [
    ["list"],
    [
      "allure-playwright",
      {
        outputFolder: "allure-results",
        detail: true,
        suiteTitle: false,
      },
    ],
  ],

  use: {
    // baseURL: 'https://www.bcr.ro',
    headless: true,
    ignoreHTTPSErrors: true,
    video: "off",
    screenshot: "only-on-failure",
    trace: "off",
  },

  projects: [
    {
      name: "ui",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        channel: "chrome",
        screenshot: "only-on-failure",
        trace: "off",
        video: "off",
        viewport: { 
            width: 1280, 
            height: 720 
        },
        launchOptions: {
          args: ["--start-maximized"],
        },
      },
    },
  ],

  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://127.0.0.1:3000',
  // }
});

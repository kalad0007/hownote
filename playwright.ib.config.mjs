import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests',testMatch:'ib-browser.spec.mjs',fullyParallel:false,workers:1,retries:0,timeout:30000,
  reporter:'list',globalSetup:'./tests/ib-ui-setup.mjs',
  use:{baseURL:'http://127.0.0.1:8788',headless:true,channel:process.env.IB_BROWSER_CHANNEL || 'chrome',trace:'off',screenshot:'off'},
  webServer:{command:'node scripts/ib-ui-server.mjs',url:'http://127.0.0.1:8788/ib',reuseExistingServer:false,timeout:60000},
});

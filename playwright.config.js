const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.WP_BASE_URL || 'http://localhost:8889';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
	testDir: './tests/e2e',
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	/* Retry on CI only */
	retries: process.env.CI ? 2 : 0,
	/* Opt out of parallel tests on CI. */
	workers: process.env.CI ? 1 : undefined,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: 'html',
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		baseURL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],

	webServer: {
		command: 'npm run wp-env start',
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
	},
});

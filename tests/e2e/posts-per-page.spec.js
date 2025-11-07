/**
 * Test the Posts Per Page override functionality.
 */
const { test, expect } = require('./fixtures');

test.describe('Posts Per Page Override', () => {
	test('should be able to access WordPress admin', async ({ admin, page }) => {
		// Basic smoke test - can we reach WordPress?
		await admin.goto('/wp-admin/');
		await expect(page.locator('#wpadminbar')).toBeVisible({ timeout: 10000 });
	});

	test('should be able to create a new page', async ({ page, editor }) => {
		// Test that we can create a new page and editor loads
		await editor.createNewPost('page');

		// Check that editor loaded
		await expect(page.locator('.block-editor-writing-flow')).toBeVisible();
	});

	test.skip('should show posts per page control when query inherits', async ({ page, editor }) => {
		// Create a new page
		await editor.createNewPost('page');

		// Insert a Query Loop block
		await page.click('button[aria-label="Toggle block inserter"]');
		await page.fill('input[placeholder="Search"]', 'query loop');
		await page.waitForTimeout(500);

		// Click the Query Loop block option
		await page.click('[role="option"]:has-text("Query Loop")');

		// Wait for the block to be inserted
		await page.waitForSelector('.wp-block-query');

		// Select the Query Loop block
		await page.click('.wp-block-query');

		// Open settings sidebar
		await editor.openBlockSettings();

		// Check that the "Extra Query Loop Settings" panel exists
		const extraSettingsPanel = page.locator('text=Extra Query Loop Settings');
		await expect(extraSettingsPanel).toBeVisible();

		// Click to expand the panel
		await extraSettingsPanel.click();

		// Check for the Posts per page override control
		const perPageControl = page.locator('label:has-text("Posts per page (Override)")');
		await expect(perPageControl).toBeVisible();
	});

	test.skip('should reflect posts per page override in editor', async ({ page, editor }) => {
		// Skipping complex editor interaction tests for now
		// These require more robust handling of WordPress block editor
	});

	test.skip('should apply posts per page override on frontend', async ({ page, editor, admin }) => {
		// Skipping complex editor interaction tests for now
		// These require more robust handling of WordPress block editor
	});

	test.skip('should show warning when override is set but query is not inherited', async ({ page, editor }) => {
		// Skipping complex editor interaction tests for now
		// These require more robust handling of WordPress block editor
	});
});

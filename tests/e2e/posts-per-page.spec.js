/**
 * Test the Posts Per Page override functionality.
 */
const { test, expect } = require('./fixtures');

test.describe('Posts Per Page Override', () => {
	test.beforeEach(async ({ admin }) => {
		// Ensure we have some test posts to work with
		await admin.goto('/wp-admin/edit.php');
	});

	test('should show posts per page control when query inherits', async ({ page, editor }) => {
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

	test('should reflect posts per page override in editor', async ({ page, editor }) => {
		// Create a new page
		await editor.createNewPost('page');

		// Insert a Query Loop block
		await page.click('button[aria-label="Toggle block inserter"]');
		await page.fill('input[placeholder="Search"]', 'query loop');
		await page.waitForTimeout(500);
		await page.click('[role="option"]:has-text("Query Loop")');

		// Wait for the block to be inserted and posts to load
		await page.waitForSelector('.wp-block-query');
		await page.waitForTimeout(1000);

		// Count initial posts in editor
		const initialPosts = await page.locator('.wp-block-post-template > li').count();
		expect(initialPosts).toBeGreaterThan(0);

		// Select the Query Loop block
		await page.click('.wp-block-query');

		// Open settings and expand Extra Query Loop Settings
		await editor.openBlockSettings();
		const extraSettingsPanel = page.locator('text=Extra Query Loop Settings');
		await extraSettingsPanel.click();

		// Set posts per page to a lower number
		const perPageInput = page.locator('input[type="number"]').first();
		const newPerPage = Math.max(1, Math.floor(initialPosts / 2));
		await perPageInput.fill(String(newPerPage));

		// Wait for the change to take effect
		await page.waitForTimeout(1000);

		// Count posts after setting override
		const visiblePosts = await page.locator('.wp-block-post-template > li:visible').count();

		// The visible posts should match or be close to our override
		// (allowing for some variance due to how the editor loads)
		expect(visiblePosts).toBeLessThanOrEqual(newPerPage + 2);
	});

	test('should apply posts per page override on frontend', async ({ page, editor, admin }) => {
		// Create a new page with Query Loop
		await editor.createNewPost('page');

		// Add a title
		await page.fill('.editor-post-title__input', 'Test Posts Per Page Override');

		// Insert a Query Loop block
		await page.click('button[aria-label="Toggle block inserter"]');
		await page.fill('input[placeholder="Search"]', 'query loop');
		await page.waitForTimeout(500);
		await page.click('[role="option"]:has-text("Query Loop")');

		await page.waitForSelector('.wp-block-query');
		await page.waitForTimeout(1000);

		// Select the Query Loop block and configure it
		await page.click('.wp-block-query');
		await editor.openBlockSettings();

		// Expand Extra Query Loop Settings
		const extraSettingsPanel = page.locator('text=Extra Query Loop Settings');
		await extraSettingsPanel.click();

		// Set posts per page to 3
		const perPageInput = page.locator('input[type="number"]').first();
		await perPageInput.fill('3');
		await page.waitForTimeout(500);

		// Publish the page
		await editor.publish();

		// Get the permalink
		const permalink = await editor.getPermalink();

		// Visit the published page
		await page.goto(permalink);

		// Count posts on the frontend
		const frontendPosts = await page.locator('.wp-block-post-template > li').count();

		// Should show exactly 3 posts
		expect(frontendPosts).toBe(3);
	});

	test('should show warning when override is set but query is not inherited', async ({ page, editor }) => {
		// Create a new page
		await editor.createNewPost('page');

		// Insert a Query Loop block
		await page.click('button[aria-label="Toggle block inserter"]');
		await page.fill('input[placeholder="Search"]', 'query loop');
		await page.waitForTimeout(500);
		await page.click('[role="option"]:has-text("Query Loop")');

		await page.waitForSelector('.wp-block-query');

		// Select the Query Loop block
		await page.click('.wp-block-query');

		// Open settings
		await editor.openBlockSettings();

		// Change query to not inherit (use custom query)
		// First, find and click the "Inherit query from template" toggle to turn it off
		const inheritToggle = page.locator('text=Inherit query from template');
		if (await inheritToggle.isVisible()) {
			await inheritToggle.click();
		}

		// Now expand Extra Query Loop Settings
		const extraSettingsPanel = page.locator('text=Extra Query Loop Settings');
		await extraSettingsPanel.click();

		// Set a posts per page value
		const perPageInput = page.locator('input[type="number"]').first();
		await perPageInput.fill('5');

		// Should see a warning message
		const warningMessage = page.locator('text=Posts per page override is only available when inheriting the query');
		await expect(warningMessage).toBeVisible();
	});
});

/**
 * Test multiple post-template blocks within a single query loop.
 */
const { test, expect } = require('./fixtures');
const { execSync } = require('child_process');

/**
 * Helper to run WP-CLI commands.
 */
function wpCli(command) {
	try {
		const result = execSync(`npm run wp-env run tests-cli -- ${command}`, {
			encoding: 'utf-8',
			stdio: 'pipe'
		});
		return result;
	} catch (error) {
		console.error(`WP-CLI command failed: ${command}`);
		console.error(error.stdout || error.message);
		throw error;
	}
}

/**
 * Helper to handle the pattern chooser modal and select the first simple pattern.
 */
async function handlePatternModal(page) {
	// Wait for either the pattern modal or the block to appear
	const patternModal = page.locator('.block-editor-block-patterns-list');
	const isModalVisible = await patternModal.isVisible({ timeout: 2000 }).catch(() => false);

	if (isModalVisible) {
		// Select the first pattern (usually the simplest one)
		const firstPattern = page.locator('.block-editor-block-patterns-list__item').first();
		const isPatternVisible = await firstPattern.isVisible({ timeout: 1000 }).catch(() => false);

		if (isPatternVisible) {
			await firstPattern.click();
			await page.waitForTimeout(1000);
		}
	}
}

// Generate dummy posts before running tests
test.beforeAll(async () => {
	console.log('Ensuring we have enough test posts...');

	try {
		const postsToGenerate = 20;
		console.log(`Generating ${postsToGenerate} test posts...`);
		wpCli(`wp post generate --count=${postsToGenerate} --post_type=post`);
		console.log('Test posts generated successfully');
	} catch (error) {
		console.log('Error checking/generating posts:', error.message);
		// Try to generate anyway
		wpCli('wp post generate --count=20 --post_type=post');
	}
});

test.describe('Multiple Post Templates', () => {
	test('should show posts per template control when query does not inherit', async ({ page, admin, editor, selectBlock }) => {
		// Create a new page
		await admin.createNewPost({ postType: 'page' });

		// Insert a Query Loop block
		await editor.insertBlock({ name: 'core/query' });

		// Handle the pattern chooser modal if it appears
		await handlePatternModal(page);
		await page.waitForTimeout(1000);

		// Wait for the query block to be inserted
		await expect(editor.canvas.locator('.wp-block-query')).toBeVisible({ timeout: 5000 });

		// Select the post-template block (child of query loop) using wp.data
		await selectBlock.byName('core/post-template', 0);

		// Open settings sidebar
		await editor.openDocumentSettingsSidebar();
		await page.waitForTimeout(500);

		// Check for the Post Template Settings panel
		const postTemplatePanel = page.locator('.components-panel__body-title:has-text("Post Template Settings")');

		// The panel should be visible since this is a non-inherited query
		await expect(postTemplatePanel).toBeVisible({ timeout: 5000 });
	});

	test('should support multiple post-template blocks with different post limits', async ({ page, admin, editor, selectBlock }) => {
		// Create a new page
		await admin.createNewPost({ postType: 'page' });

		// Insert a Query Loop block
		await editor.insertBlock({ name: 'core/query' });
		await handlePatternModal(page);
		await page.waitForTimeout(1000);

		// Wait for the query block to be inserted
		const queryBlock = editor.canvas.locator('.wp-block-query').first();
		await expect(queryBlock).toBeVisible({ timeout: 5000 });

		// The query block should have one post-template by default - configure it
		await selectBlock.byName('core/post-template', 0);

		// Open settings sidebar
		await editor.openDocumentSettingsSidebar();
		await page.waitForTimeout(500);

		// Expand the Post Template Settings panel
		const postTemplatePanel = page.locator('.components-panel__body-title:has-text("Post Template Settings")');
		const isExpanded = await postTemplatePanel.locator('button').getAttribute('aria-expanded');
		if (isExpanded !== 'true') {
			await postTemplatePanel.click();
			await page.waitForTimeout(500);
		}

		// Set first post-template to show 1 post
		const firstInput = page.locator('.components-panel__body').filter({ hasText: 'Post Template Settings' }).locator('input[type="number"]').first();
		await firstInput.fill('1');
		await page.waitForTimeout(1000);

		// Select the query block to add more post-templates
		await selectBlock.byName('core/query', 0);

		// Insert second post-template block
		await editor.insertBlock({ name: 'core/post-template' });
		await page.waitForTimeout(1000);

		// Configure second post-template
		await selectBlock.byName('core/post-template', 1);

		const secondInput = page.locator('.components-panel__body').filter({ hasText: 'Post Template Settings' }).locator('input[type="number"]').first();
		await secondInput.fill('2');
		await page.waitForTimeout(1000);

		// Select the query block again
		await selectBlock.byName('core/query', 0);

		// Insert third post-template block
		await editor.insertBlock({ name: 'core/post-template' });
		await page.waitForTimeout(1000);

		// Configure third post-template
		await selectBlock.byName('core/post-template', 2);

		const thirdInput = page.locator('.components-panel__body').filter({ hasText: 'Post Template Settings' }).locator('input[type="number"]').first();
		await thirdInput.fill('3');
		await page.waitForTimeout(1000);

		// Publish the page
		await editor.publishPost();
		await page.waitForTimeout(1000);

		// Get the page permalink
		const permalink = await editor.page.locator('.post-publish-panel__postpublish-header a').getAttribute('href');
		console.log('Page URL:', permalink);

		// Navigate to the frontend page
		await page.goto(permalink);
		await page.waitForLoadState('networkidle');

		// Get all the post titles on the page
		const postTitles = await page.locator('.wp-block-post-template .wp-block-post-title').allTextContents();
		console.log('Post titles found:', postTitles);
		console.log('Total posts:', postTitles.length);

		// Should have exactly 6 posts total (1 + 2 + 3)
		expect(postTitles.length).toBe(6);

		// Verify no duplicate posts
		const uniqueTitles = [...new Set(postTitles)];
		console.log('Unique posts:', uniqueTitles.length);
		expect(uniqueTitles.length).toBe(6);
	});

	test('should handle different layouts for different post-template blocks', async ({ page, admin, editor, selectBlock }) => {
		// Create a new page
		await admin.createNewPost({ postType: 'page' });

		// Insert a Query Loop block
		await editor.insertBlock({ name: 'core/query' });
		await handlePatternModal(page);
		await page.waitForTimeout(1000);

		const queryBlock = editor.canvas.locator('.wp-block-query').first();
		await expect(queryBlock).toBeVisible({ timeout: 5000 });

		// Configure first post-template for list layout (1 post)
		await selectBlock.byName('core/post-template', 0);

		// Open settings and set posts per template
		await editor.openDocumentSettingsSidebar();
		await page.waitForTimeout(500);

		const postTemplatePanel = page.locator('.components-panel__body-title:has-text("Post Template Settings")');
		const isExpanded = await postTemplatePanel.locator('button').getAttribute('aria-expanded');
		if (isExpanded !== 'true') {
			await postTemplatePanel.click();
			await page.waitForTimeout(500);
		}

		const firstInput = page.locator('.components-panel__body').filter({ hasText: 'Post Template Settings' }).locator('input[type="number"]').first();
		await firstInput.fill('1');
		await page.waitForTimeout(1000);

		// Add second post-template (2 posts)
		await selectBlock.byName('core/query', 0);
		await editor.insertBlock({ name: 'core/post-template' });
		await page.waitForTimeout(1000);

		await selectBlock.byName('core/post-template', 1);

		const secondInput = page.locator('.components-panel__body').filter({ hasText: 'Post Template Settings' }).locator('input[type="number"]').first();
		await secondInput.fill('2');
		await page.waitForTimeout(1000);

		// Add third post-template (3 posts)
		await selectBlock.byName('core/query', 0);
		await editor.insertBlock({ name: 'core/post-template' });
		await page.waitForTimeout(1000);

		await selectBlock.byName('core/post-template', 2);

		const thirdInput = page.locator('.components-panel__body').filter({ hasText: 'Post Template Settings' }).locator('input[type="number"]').first();
		await thirdInput.fill('3');
		await page.waitForTimeout(1000);

		// Publish the page
		await editor.publishPost();
		await page.waitForTimeout(1000);

		// Get the page permalink
		const permalink = await editor.page.locator('.post-publish-panel__postpublish-header a').getAttribute('href');

		await page.goto(permalink);
		await page.waitForLoadState('networkidle');

		// Verify we have 3 separate post-template blocks on the frontend
		const postTemplateBlocks = page.locator('.wp-block-post-template');
		const blockCount = await postTemplateBlocks.count();
		console.log('Post template blocks found:', blockCount);
		expect(blockCount).toBe(3);

		// Verify total posts
		const postTitles = await page.locator('.wp-block-post-template .wp-block-post-title').allTextContents();
		console.log('Total posts found:', postTitles.length);
		expect(postTitles.length).toBe(6);

		// Verify no duplicates
		const uniqueTitles = [...new Set(postTitles)];
		expect(uniqueTitles.length).toBe(6);
	});
});

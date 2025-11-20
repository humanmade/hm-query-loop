/**
 * Test multiple post-template blocks within a single query loop.
 */
const { test, expect, wpCli } = require('./fixtures');

/**
 * Helper to handle the pattern/variation chooser modal for Query Loop blocks.
 * Selects "Start blank" then picks the first variation.
 */
async function handlePatternModal(page) {
	// Wait for the modal to appear
	await page.waitForTimeout(1000);

	// Look for "Start blank" button
	const startBlankButton = page.locator('button:has-text("Start blank")');
	const isStartBlankVisible = await startBlankButton.isVisible({ timeout: 2000 }).catch(() => false);

	if (isStartBlankVisible) {
		await startBlankButton.click();
		await page.waitForTimeout(500);
	}

	// Now select the first variation
	const firstVariation = page.locator('.block-editor-block-variation-picker__variation').first();
	const isVariationVisible = await firstVariation.isVisible({ timeout: 2000 }).catch(() => false);

	if (isVariationVisible) {
		await firstVariation.click();
		await page.waitForTimeout(1000);
	}
}

// Generate dummy posts before running tests
test.beforeAll(async () => {
	console.log(`Generating 20 test posts...`);
	const ids = wpCli('wp post list --post_type=post --format=ids');
	wpCli(`wp post delete 1 ${ids} --force`);
	wpCli(`wp post generate --count=20 --post_type=post`);
	console.log('Test posts generated successfully');
});

test.describe('Multiple Post Templates', () => {
	test('should show posts per template control when query does not inherit', async ({ page, admin, editor, selectBlock }) => {
		// Create a new page
		await admin.createNewPost({ postType: 'page' });

		// Handle the pattern chooser modal if it appears
		await handlePatternModal(page);
		await page.waitForTimeout(1000);

		// Insert a Query Loop block
		await editor.insertBlock({ name: 'core/query' });

		// Wait for the query block to be inserted
		await expect(editor.canvas.locator('.wp-block-query')).toBeVisible({ timeout: 5000 });

		// Make sure the query is NOT set to inherit by checking/unchecking inherit toggle
		await selectBlock.byName('core/query', 0);
		await editor.openDocumentSettingsSidebar();
		await page.waitForTimeout(500);

		// Look for the inherit toggle and make sure it's OFF
		const inheritToggle = page.locator('label:has-text("Inherit query from template")');
		const isInheritVisible = await inheritToggle.isVisible({ timeout: 2000 }).catch(() => false);

		if (isInheritVisible) {
			const toggleInput = inheritToggle.locator('..').locator('input[type="checkbox"]');
			const isChecked = await toggleInput.isChecked();

			if (isChecked) {
				await toggleInput.click();
				await page.waitForTimeout(500);
			}
		}

		// Debug: Check what block is actually selected
		const selectedBlockName = await page.evaluate(() => {
			const selectedBlockId = window.wp.data.select('core/block-editor').getSelectedBlockClientId();
			if (!selectedBlockId) return 'None';
			const block = window.wp.data.select('core/block-editor').getBlock(selectedBlockId);
			return block ? block.name : 'Unknown';
		});
		console.log('Selected block:', selectedBlockName);await page.locator('iframe[name="editor-canvas"]').contentFrame().getByRole('button', { name: 'Start blank' }).click();

		await page.locator('iframe[name="editor-canvas"]').contentFrame().getByRole('button', { name: 'Title & Date' }).click();
		await page.locator('iframe[name="editor-canvas"]').contentFrame().getByRole('listitem').getByRole('document', { name: 'Block: Title' }).click();
		await page.getByRole('button', { name: 'Select parent block: Post' }).click();
		await page.getByRole('button', { name: 'Post Template Settings' }).click();

		// Debug: Log all available panels
		const allPanels = await page.locator('.components-panel__body-title').allTextContents();
		console.log('Available panels:', allPanels);

		// Check for the Post Template Settings panel
		const postTemplatePanel = page.locator('.components-panel__body-title:has-text("Post Template Settings")');

		// The panel should be visible since this is a non-inherited query
		await expect(postTemplatePanel).toBeVisible({ timeout: 5000 });
	});

	test('should support multiple post-template blocks with different post limits', async ({ page, admin, editor, selectBlock }) => {
		// Create a new page
		await admin.createNewPost({ postType: 'page' });

		// Handle the pattern chooser modal if it appears
		await handlePatternModal(page);
		await page.waitForTimeout(1000);

		await page.locator('iframe[name="editor-canvas"]').contentFrame().getByRole('textbox', { name: 'Add title' }).click();
		await page.locator('iframe[name="editor-canvas"]').contentFrame().getByRole('textbox', { name: 'Add title' }).fill('test');
		await page.locator('iframe[name="editor-canvas"]').contentFrame().getByRole('button', { name: 'Add default block' }).click();
		await page.locator('iframe[name="editor-canvas"]').contentFrame().getByRole('document', { name: 'Empty block; start writing or' }).fill('/query');
		await page.getByRole('option', { name: 'Query Loop' }).click();
		await page.locator('iframe[name="editor-canvas"]').contentFrame().getByRole('button', { name: 'Start blank' }).click();
		await page.locator('iframe[name="editor-canvas"]').contentFrame().getByRole('button', { name: 'Image, Date, & Title' }).click();
		await page.locator('iframe[name="editor-canvas"]').contentFrame().locator('.components-placeholder__illustration').first().click();
		await page.getByRole('button', { name: 'Select parent block: Post' }).click();
		await page.getByRole('button', { name: 'Settings' }).click();
		await page.getByRole('button', { name: 'Post Template Settings' }).click();
		await page.getByRole('spinbutton', { name: 'Posts per template' }).click();
		await page.getByRole('spinbutton', { name: 'Posts per template' }).fill('1');
		await page.getByRole('toolbar', { name: 'Block tools' }).getByLabel('Options').click();
		await page.getByRole('menuitem', { name: 'Duplicate ⇧⌘D' }).click();
		await page.getByRole('button', { name: 'Grid view' }).click();
		await page.getByRole('button', { name: 'Post Template Settings' }).click();
		await page.getByRole('spinbutton', { name: 'Posts per template' }).click();
		await page.getByRole('spinbutton', { name: 'Posts per template' }).press('Shift+ArrowLeft');
		await page.getByRole('spinbutton', { name: 'Posts per template' }).fill('2');
		await page.getByRole('spinbutton', { name: 'Columns' }).click();
		await page.getByRole('spinbutton', { name: 'Columns' }).press('Shift+ArrowLeft');
		await page.getByRole('spinbutton', { name: 'Columns' }).fill('2');
		await page.getByRole('toolbar', { name: 'Block tools' }).getByLabel('Options').click();
		await page.getByRole('menuitem', { name: 'Duplicate ⇧⌘D' }).click();
		await page.getByRole('spinbutton', { name: 'Columns' }).click();
		await page.getByRole('spinbutton', { name: 'Columns' }).press('Shift+ArrowLeft');
		await page.getByRole('spinbutton', { name: 'Columns' }).fill('3');
		await page.getByRole('button', { name: 'Post Template Settings' }).click();
		await page.getByRole('spinbutton', { name: 'Posts per template' }).click();
		await page.getByRole('spinbutton', { name: 'Posts per template' }).press('Shift+ArrowLeft');
		await page.getByRole('spinbutton', { name: 'Posts per template' }).fill('3');
		await page.getByRole('button', { name: 'Publish', exact: true }).click();
		await page.getByLabel('Editor publish').getByRole('button', { name: 'Publish', exact: true }).click();
		await page.getByLabel('Editor publish').getByRole('link', { name: 'View Page' }).click();
		await expect(page.locator('#wp--skip-link--target')).toContainText('Post 16');
		await expect(page.locator('#wp--skip-link--target')).toContainText('Post 17');
		await expect(page.locator('#wp--skip-link--target')).toContainText('Post 18');
		await expect(page.locator('#wp--skip-link--target')).toContainText('Post 19');
		await expect(page.locator('#wp--skip-link--target')).toContainText('Post 20');
		await expect(page.locator('#wp--skip-link--target')).toContainText('Post 21');waitForTimeout(1000);

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
});

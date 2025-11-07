const { test: base, expect } = require('@playwright/test');

/**
 * WordPress test fixtures with admin login and utilities.
 */
export const test = base.extend({
	/**
	 * Navigate to WordPress admin and log in if needed.
	 */
	admin: async ({ page }, use) => {
		await page.goto('/wp-admin');

		// Check if we need to log in
		const loginForm = page.locator('#loginform');
		const isLoginPage = await loginForm.isVisible({ timeout: 5000 }).catch(() => false);

		if (isLoginPage) {
			await page.fill('#user_login', 'admin');
			await page.fill('#user_pass', 'password');
			await page.click('#wp-submit');
			await page.waitForURL('**/wp-admin/**', { timeout: 10000 });
		}

		await use(page);
	},

	/**
	 * Utilities for working with the block editor.
	 */
	editor: async ({ page, admin }, use) => {
		const editorUtils = {
			/**
			 * Create a new page/post in the editor.
			 */
			async createNewPost(postType = 'page') {
				await admin.goto(`/wp-admin/post-new.php?post_type=${postType}`);

				// Wait for editor layout to load
				await page.waitForSelector('.edit-post-layout, .edit-site-layout', { timeout: 15000 });

				// Close welcome guide if it appears (with timeout)
				const welcomeGuideVisible = await page.locator('.edit-post-welcome-guide')
					.isVisible({ timeout: 2000 })
					.catch(() => false);

				if (welcomeGuideVisible) {
					await page.click('button[aria-label="Close"]');
				}

				// Wait for the editor canvas to be ready
				// Use a more reliable selector - wait for the post title or canvas
				await Promise.race([
					page.waitForSelector('.editor-post-title__input', { timeout: 10000 }),
					page.waitForSelector('.edit-post-visual-editor', { timeout: 10000 }),
					page.waitForSelector('iframe[name="editor-canvas"]', { timeout: 10000 }),
				]).catch(() => {
					// If none of the selectors work, just continue
					console.log('Editor canvas selectors not found, continuing anyway');
				});

				// Give it a moment to settle
				await page.waitForTimeout(500);
			},

			/**
			 * Insert a block by name.
			 */
			async insertBlock(blockName) {
				// Click the block inserter
				await page.click('button[aria-label="Toggle block inserter"]');
				await page.fill('input[placeholder="Search"]', blockName);

				// Wait for search results
				await page.waitForTimeout(500);

				// Click the first result
				await page.click(`.editor-block-list-item-core-${blockName.replace('/', '-')}, .editor-block-list-item-${blockName.replace('/', '-')}`);
			},

			/**
			 * Open block settings sidebar.
			 */
			async openBlockSettings() {
				const settingsButton = page.locator('button[aria-label="Settings"]');
				const isExpanded = await settingsButton.getAttribute('aria-expanded');

				if (isExpanded !== 'true') {
					await settingsButton.click();
					await page.waitForTimeout(300);
				}
			},

			/**
			 * Publish the post/page.
			 */
			async publish() {
				// Click publish button
				const publishButton = page.locator('button.editor-post-publish-button__button, button.editor-post-publish-panel__toggle');
				await publishButton.first().click();

				// If there's a pre-publish panel, click publish again
				const prePublishButton = page.locator('.editor-post-publish-panel__header-publish-button button');
				const hasPrePublish = await prePublishButton.isVisible({ timeout: 2000 }).catch(() => false);

				if (hasPrePublish) {
					await prePublishButton.click();
				}

				// Wait for success notice
				await page.waitForSelector('.components-snackbar', { timeout: 10000 });
			},

			/**
			 * Get the permalink from the editor.
			 */
			async getPermalink() {
				// Open post publish panel if not already open
				const panel = page.locator('.editor-post-publish-panel');
				const isPanelVisible = await panel.isVisible({ timeout: 2000 }).catch(() => false);

				if (!isPanelVisible) {
					await this.publish();
				}

				const permalink = await page.locator('.post-publish-panel__postpublish-post-address input').inputValue();
				return permalink;
			},
		};

		await use(editorUtils);
	},
});

export { expect };

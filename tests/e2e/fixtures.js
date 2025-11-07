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
		if (await loginForm.isVisible()) {
			await page.fill('#user_login', 'admin');
			await page.fill('#user_pass', 'password');
			await page.click('#wp-submit');
			await page.waitForURL('**/wp-admin/**');
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
				await page.waitForSelector('.edit-post-layout, .edit-site-layout');

				// Close welcome guide if it appears
				const welcomeGuide = page.locator('.edit-post-welcome-guide');
				if (await welcomeGuide.isVisible()) {
					await page.click('button[aria-label="Close"]');
				}
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
				if (!(await settingsButton.getAttribute('aria-expanded')) === 'true') {
					await settingsButton.click();
				}
			},

			/**
			 * Publish the post/page.
			 */
			async publish() {
				// Click publish button
				const publishButton = page.locator('button.editor-post-publish-button__button, button.editor-post-publish-panel__toggle');
				await publishButton.click();

				// If there's a pre-publish panel, click publish again
				const prePublishButton = page.locator('.editor-post-publish-panel__header-publish-button button');
				if (await prePublishButton.isVisible()) {
					await prePublishButton.click();
				}

				// Wait for success notice
				await page.waitForSelector('.components-snackbar');
			},

			/**
			 * Get the permalink from the editor.
			 */
			async getPermalink() {
				// Open post publish panel if not already open
				const panel = page.locator('.editor-post-publish-panel');
				if (!(await panel.isVisible())) {
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

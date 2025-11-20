const { test: base, expect } = require('@wordpress/e2e-test-utils-playwright');
const { execSync } = require('child_process');

/**
 * Extended test fixtures with additional utilities.
 */
export const test = base.extend({
	/**
	 * Custom editor utilities extending the base Editor.
	 */
	siteEditor: async ({ admin, editor, page }, use) => {
		const siteEditorUtils = {
			/**
			 * Navigate to the site editor to edit a template.
			 */
			async visitSiteEditor(templateSlug = 'index', theme = 'twentytwentyfive') {
				const templateId = `${theme}//${templateSlug}`;
				await admin.visitAdminPage(`site-editor.php?postId=${encodeURIComponent(templateId)}&postType=wp_template&canvas=edit`);

				// Wait for site editor to load
				await page.waitForSelector('.edit-site-layout, iframe[name="editor-canvas"]', { timeout: 15000 });

				// Dismiss "Edit your site" modal if it appears
				const editSiteModalVisible = await page.locator('text=Edit your site')
					.isVisible({ timeout: 2000 })
					.catch(() => false);

				if (editSiteModalVisible) {
					const getStartedButton = page.locator('button:has-text("Get started")');
					const isGetStartedVisible = await getStartedButton.isVisible({ timeout: 1000 }).catch(() => false);
					if (isGetStartedVisible) {
						await getStartedButton.click();
						await page.waitForTimeout(500);
					}
				}

				// Close welcome guide if it appears
				const welcomeGuideVisible = await page.locator('.edit-site-welcome-guide, .edit-post-welcome-guide')
					.isVisible({ timeout: 2000 })
					.catch(() => false);

				if (welcomeGuideVisible) {
					const closeButton = page.locator('button[aria-label="Close"]');
					const isCloseButtonVisible = await closeButton.isVisible({ timeout: 1000 }).catch(() => false);
					if (isCloseButtonVisible) {
						await closeButton.click();
						await page.waitForTimeout(500);
					}
				}

				// Give the editor time to initialize
				await page.waitForTimeout(1000);
			},

			/**
			 * Select a block by its name using the WordPress data API.
			 * @param {string} blockName - The block name (e.g., 'core/query').
			 * @param {number} index - The index of the block to select (default: 0).
			 */
			async selectBlockByName(blockName, index = 0) {
				await page.evaluate(
					({ name, idx }) => {
						const blocks = window.wp.data.select('core/block-editor').getBlocksByName(name);
						if (blocks.length > idx) {
							window.wp.data.dispatch('core/block-editor').selectBlock(blocks[idx]);
						}
					},
					{ name: blockName, idx: index }
				);
				await page.waitForTimeout(1000);
			},

			/**
			 * Open the settings sidebar and wait for it to be ready.
			 */
			async openSettingsSidebar() {
				await editor.openDocumentSettingsSidebar();
				await page.waitForTimeout(1000);
			},

			/**
			 * Expand a settings panel if it's not already open.
			 * @param {string} panelTitle - The title text of the panel to expand.
			 */
			async expandPanel(panelTitle) {
				const panel = page.locator(`.components-panel__body-title:has-text("${panelTitle}")`);
				const isExpanded = await panel.locator('button').getAttribute('aria-expanded');
				if (isExpanded !== 'true') {
					await panel.locator('button').click();
					await page.waitForTimeout(300);
				}
			},

			/**
			 * Get the Posts per page input control.
			 * @returns {Locator} The input element locator.
			 */
			getPostsPerPageInput() {
				return page.locator('label:has-text("Posts per page (Override)")').locator('..').locator('input[type="number"]');
			},

			/**
			 * Get the editor canvas from the site editor.
			 */
			get canvas() {
				return editor.canvas;
			},
		};

		await use(siteEditorUtils);
	},

	/**
	 * Helper to select a block by name using the WordPress data API.
	 */
	selectBlock: async ({ page }, use) => {
		const selectBlock = {
			/**
			 * Select a block by its name.
			 * @param {string} blockName - The block name (e.g., 'core/post-template').
			 * @param {number} index - The index of the block to select (default: 0).
			 */
			async byName(blockName, index = 0) {
				await page.evaluate(
					({ name, idx }) => {
						const blocks = window.wp.data.select('core/block-editor').getBlocksByName(name);
						if (blocks.length > idx) {
							window.wp.data.dispatch('core/block-editor').selectBlock(blocks[idx]);
						}
					},
					{ name: blockName, idx: index }
				);
				await page.waitForTimeout(500);
			},

			/**
			 * Select a block by its client ID.
			 * @param {string} clientId - The block's client ID.
			 */
			async byId(clientId) {
				await page.evaluate(
					(id) => {
						window.wp.data.dispatch('core/block-editor').selectBlock(id);
					},
					clientId
				);
				await page.waitForTimeout(500);
			},
		};

		await use(selectBlock);
	},
});

export { expect };

/**
 * Helper to run WP-CLI commands.
 */
export function wpCli(command) {
	try {
		const result = execSync(`npm run wp-env run tests-cli -- ${command}`, {
			encoding: 'utf-8',
			stdio: 'pipe'
		});
		return String(result.split("\n").slice(-1));
	} catch (error) {
		console.error(`WP-CLI command failed: ${command}`);
		console.error(error.stdout || error.message);
		throw error;
	}
}

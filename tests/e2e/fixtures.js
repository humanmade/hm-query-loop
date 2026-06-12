/* eslint-disable no-console, jsdoc/require-param-type */
const {
	test: base,
	expect,
} = require( '@wordpress/e2e-test-utils-playwright' );
const { Locator } = require( '@playwright/test' );
const { execSync } = require( 'child_process' );

/**
 * Extended test fixtures with additional utilities.
 */
export const test = base.extend( {
	/**
	 * Custom editor utilities extending the base Editor.
	 * @param root0
	 * @param root0.admin
	 * @param root0.editor
	 * @param root0.page
	 * @param use
	 */
	blockEditor: async ( { admin, editor, page }, use ) => {
		const blockEditorUtils = {
			/**
			 * Navigate to the site editor to edit a template.
			 * @param templateSlug
			 * @param theme
			 */
			async visitSiteEditor(
				templateSlug = 'index',
				theme = 'twentytwentyfive'
			) {
				const templateId = `${ theme }//${ templateSlug }`;
				await admin.visitAdminPage(
					`site-editor.php?postId=${ encodeURIComponent(
						templateId
					) }&postType=wp_template&canvas=edit`
				);

				// Wait for site editor to load
				await page.waitForSelector(
					'.edit-site-layout, iframe[name="editor-canvas"]',
					{ timeout: 15000 }
				);

				// Dismiss "Edit your site" modal if it appears
				const editSiteModalVisible = await page
					.locator( 'text=Edit your site' )
					.isVisible( { timeout: 2000 } )
					.catch( () => false );

				if ( editSiteModalVisible ) {
					const getStartedButton = page.locator(
						'button:has-text("Get started")'
					);
					const isGetStartedVisible = await getStartedButton
						.isVisible( { timeout: 1000 } )
						.catch( () => false );
					if ( isGetStartedVisible ) {
						await getStartedButton.click();
						await page.waitForTimeout( 500 );
					}
				}

				// Close welcome guide if it appears
				const welcomeGuideVisible = await page
					.locator(
						'.edit-site-welcome-guide, .edit-post-welcome-guide'
					)
					.isVisible( { timeout: 2000 } )
					.catch( () => false );

				if ( welcomeGuideVisible ) {
					const closeButton = page.locator(
						'button[aria-label="Close"]'
					);
					const isCloseButtonVisible = await closeButton
						.isVisible( { timeout: 1000 } )
						.catch( () => false );
					if ( isCloseButtonVisible ) {
						await closeButton.click();
						await page.waitForTimeout( 500 );
					}
				}

				// Give the editor time to initialize
				await page.waitForTimeout( 1000 );
			},

			/**
			 * Open the settings sidebar and wait for it to be ready.
			 */
			async openSettingsSidebar() {
				await editor.openDocumentSettingsSidebar();
				await page.waitForTimeout( 1000 );
			},

			/**
			 * Expand a settings panel if it's not already open.
			 * @param {string} panelTitle - The title text of the panel to expand.
			 */
			async expandPanel( panelTitle ) {
				const panel = page.locator(
					`.components-panel__body-title:has-text("${ panelTitle }")`
				);
				const isExpanded = await panel
					.locator( 'button' )
					.getAttribute( 'aria-expanded' );
				if ( isExpanded !== 'true' ) {
					await panel.locator( 'button' ).click();
					await page.waitForTimeout( 300 );
				}
			},

			/**
			 * Get the Posts per page input control.
			 * @return {Locator} The input element locator.
			 */
			getPostsPerPageInput() {
				return page
					.locator( 'label:has-text("Posts per page (Override)")' )
					.locator( '..' )
					.locator( 'input[type="number"]' );
			},

			/**
			 * Publish post and visit it.
			 */
			async publishAndVisit() {
				// Publish and view the page
				await page
					.getByRole( 'button', { name: 'Publish', exact: true } )
					.click();
				await page
					.getByLabel( 'Editor publish' )
					.getByRole( 'button', { name: 'Publish', exact: true } )
					.click();
				const newURL = await page
					.getByLabel( 'Editor publish' )
					.getByRole( 'link', { name: /^View (Post|Page)/ } )
					.getAttribute( 'href' );
				await page.goto( newURL, { waitUntil: 'domcontentloaded' } );
			},

			/**
			 * Get the editor canvas from the site editor.
			 */
			get canvas() {
				return editor.canvas;
			},

			selectBlock: {
				/**
				 * Select a block by its name.
				 * @param {string} blockName - The block name (e.g., 'core/post-template').
				 * @param {number} index     - The index of the block to select (default: 0).
				 */
				async byName( blockName, index = 0 ) {
					await page.evaluate(
						( { name, idx } ) => {
							const blocks = window.wp.data
								.select( 'core/block-editor' )
								.getBlocksByName( name );
							if ( blocks.length > idx ) {
								window.wp.data
									.dispatch( 'core/block-editor' )
									.selectBlock( blocks[ idx ] );
							}
						},
						{ name: blockName, idx: index }
					);
					await page.waitForTimeout( 500 );
				},

				/**
				 * Select a block by its client ID.
				 * @param {string} clientId - The block's client ID.
				 */
				async byId( clientId ) {
					await page.evaluate( ( id ) => {
						window.wp.data
							.dispatch( 'core/block-editor' )
							.selectBlock( id );
					}, clientId );
					await page.waitForTimeout( 500 );
				},
			},
			queryBlock: {
				async setAsCustom() {
					const customRadio = page.getByRole( 'radio', {
						name: 'Custom',
					} );
					if (
						await customRadio
							.isVisible( { timeout: 1000 } )
							.catch( () => false )
					) {
						await customRadio.click();
					}
				},
				async openSettingsPanel() {
					const extraSettingsPanel = page.locator(
						'.components-panel__body-title:has-text("Extra Query Loop Settings")'
					);
					if (
						await extraSettingsPanel
							.isVisible( { timeout: 2000 } )
							.catch( () => false )
					) {
						const isExpanded = await extraSettingsPanel
							.locator( 'button' )
							.getAttribute( 'aria-expanded' );
						if ( isExpanded !== 'true' ) {
							await extraSettingsPanel
								.locator( 'button' )
								.click();
							await page.waitForTimeout( 300 );
						}
					}
				},
				async openCuratedPanel() {
					const curatedPanel = page.locator(
						'.components-panel__body-title:has-text("Curated Posts")'
					);
					if (
						await curatedPanel
							.isVisible( { timeout: 2000 } )
							.catch( () => false )
					) {
						const isExpanded = await curatedPanel
							.locator( 'button' )
							.getAttribute( 'aria-expanded' );
						if ( isExpanded !== 'true' ) {
							await curatedPanel.locator( 'button' ).click();
							await page.waitForTimeout( 300 );
						}
					}
				},
				async excludeDisplayed() {
					const excludeDisplayedToggle = page
						.locator(
							'label:has-text("Exclude already displayed Posts")'
						)
						.locator( '..' )
						.locator( 'input[type="checkbox"]' );
					if (
						await excludeDisplayedToggle
							.isVisible( { timeout: 2000 } )
							.catch( () => false )
					) {
						const isChecked =
							await excludeDisplayedToggle.isChecked();
						if ( ! isChecked ) {
							await excludeDisplayedToggle.click();
							await page.waitForTimeout( 500 );
						}
					}
				},
			},
		};

		await use( blockEditorUtils );
	},
} );

export { expect };

/**
 * Helper to run WP-CLI commands.
 * @param command
 */
export function wpCli( command ) {
	try {
		const result = execSync(
			`npm run wp-env run tests-cli -- ${ command }`,
			{
				encoding: 'utf-8',
				stdio: 'pipe',
			}
		);
		return String( result.split( '\n' ).slice( -1 ) );
	} catch ( error ) {
		console.error( `WP-CLI command failed: ${ command }` );
		console.error( error.stdout || error.message );
		throw error;
	}
}

export function resetDatabase() {
	console.log( `Importing database fixture` );
	wpCli(
		`wp db import /var/www/html/wp-content/plugins/hm-query-loop/tests/e2e/database.sql`
	);
	wpCli( `wp cache flush` );
}

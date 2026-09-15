/* eslint-disable no-console, jsdoc/require-param-type */
const {
	test: base,
	expect,
} = require( '@wordpress/e2e-test-utils-playwright' );
const { Locator } = require( '@playwright/test' );
const { execSync } = require( 'child_process' );

/**
 * Build the site editor URLs that can open a template, newest scheme first.
 *
 * WordPress 7.0 moved the site editor onto path routes: the template editor
 * used to be `?postType=wp_template&postId=theme//slug`, and is now
 * `?p=/wp_template/theme//slug`. The old form does not error on 7.x — it
 * quietly resolves to the dashboard route, which renders no editor header, so
 * every test that reached for the settings sidebar timed out looking for a
 * button that had never been drawn.
 *
 * @param {string} templateId Template id, `theme//slug`.
 * @return {string[]} Admin paths to try in order.
 */
function siteEditorRoutes( templateId ) {
	return [
		`site-editor.php?p=${ encodeURIComponent(
			`/wp_template/${ templateId }`
		) }&canvas=edit`,
		`site-editor.php?postId=${ encodeURIComponent(
			templateId
		) }&postType=wp_template&canvas=edit`,
	];
}

/**
 * The route scheme this WordPress accepts, remembered after the first visit.
 *
 * Probing costs a timeout on whichever scheme is wrong, and the answer cannot
 * change within a run. The module is loaded once per worker, so this is a
 * per-worker cache.
 *
 * @type {number|null}
 */
let resolvedSiteEditorRoute = null;

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
		/**
		 * Click a control if it turns up within the grace period.
		 *
		 * `locator.isVisible()` answers immediately — the timeout it accepts is
		 * ignored — so probing with it races anything the editor renders a beat
		 * after the page settles. Waiting is the difference between dismissing a
		 * modal and running the rest of the test underneath it.
		 *
		 * @param {Locator} locator Control to click.
		 * @param {number}  timeout How long to wait for it.
		 * @return {Promise<boolean>} Whether it was there and got clicked.
		 */
		async function clickIfPresent( locator, timeout = 3000 ) {
			try {
				await locator.first().waitFor( { state: 'visible', timeout } );
			} catch ( error ) {
				return false;
			}

			await locator.first().click();
			await page.waitForTimeout( 500 );
			return true;
		}

		/**
		 * Dismiss the modals the site editor can open on a cold profile.
		 *
		 * Driven off the buttons rather than off the surrounding copy: the
		 * "Edit your site" wording this used to look for is not what WordPress
		 * 7.x shows, so the modal went unnoticed and every later step ran
		 * against a page whose only button was "Get started".
		 *
		 * Dismissing one can reveal another, so keep going until nothing more
		 * appears.
		 */
		async function dismissSiteEditorModals() {
			for ( let attempt = 0; attempt < 3; attempt++ ) {
				const dismissed =
					( await clickIfPresent(
						page.getByRole( 'button', { name: 'Get started' } )
					) ) ||
					( await clickIfPresent(
						page
							.locator(
								'.edit-site-welcome-guide, .edit-post-welcome-guide'
							)
							.getByRole( 'button', { name: 'Close' } )
					) );

				if ( ! dismissed ) {
					return;
				}
			}
		}

		/**
		 * Whether the editor has the given template open for editing.
		 *
		 * Asking the editor store which entity it is on distinguishes the edit
		 * canvas from every other thing the site editor can render, and does it
		 * without depending on any markup.
		 *
		 * @param {string} templateId Template id, `theme//slug`.
		 * @param {number} timeout    How long to allow the editor to boot.
		 * @return {Promise<boolean>} True when the template is open.
		 */
		async function isEditingTemplate( templateId, timeout ) {
			return page
				.waitForFunction(
					( id ) =>
						window.wp?.data
							?.select( 'core/editor' )
							?.getCurrentPostId() === id,
					templateId,
					{ timeout }
				)
				.then( () => true )
				.catch( () => false );
		}

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
				const allRoutes = siteEditorRoutes( templateId );
				const routes =
					resolvedSiteEditorRoute === null
						? allRoutes
						: [ allRoutes[ resolvedSiteEditorRoute ] ];

				for ( const route of routes ) {
					await admin.visitAdminPage( route );

					// Wait for site editor to load
					await page.waitForSelector(
						'.edit-site-layout, iframe[name="editor-canvas"]',
						{ timeout: 15000 }
					);

					if ( await isEditingTemplate( templateId, 15000 ) ) {
						resolvedSiteEditorRoute = allRoutes.indexOf( route );

						// After the editor has booted, not before: the modals
						// are part of what it renders, so looking for them any
						// earlier finds nothing.
						await dismissSiteEditorModals();

						// Give the editor time to initialize
						await page.waitForTimeout( 1000 );
						return;
					}
				}

				throw new Error(
					`The site editor did not open ${ templateId } for editing. Tried: ${ routes.join(
						', '
					) }`
				);
			},

			/**
			 * Open the settings sidebar and wait for it to be ready.
			 *
			 * Done through the interface store rather than by clicking a header
			 * button. editor.openDocumentSettingsSidebar() wants a button named
			 * exactly "Settings" inside the "Editor top bar" region, and where
			 * that button lives — or whether it is drawn at all — has moved
			 * between WordPress versions. The `core/interface` store and the two
			 * sidebar ids have not moved since 6.6.
			 *
			 * Asking for the block sidebar directly also settles which tab
			 * opens: on the Document tab none of the panels this plugin adds to
			 * core/query are rendered, so they all look missing.
			 */
			async openSettingsSidebar() {
				const settingsRegion = page.getByRole( 'region', {
					name: 'Editor settings',
				} );

				await page
					.evaluate( () => {
						const { select, dispatch } = window.wp.data;
						const hasSelection =
							!! select(
								'core/block-editor'
							).getBlockSelectionStart();

						dispatch( 'core/interface' ).enableComplementaryArea(
							'core',
							hasSelection
								? 'edit-post/block'
								: 'edit-post/document'
						);
					} )
					// Leave a missing store to the fallback below rather than
					// failing here, so the diagnostic still gets a chance to run.
					.catch( () => {} );

				try {
					await settingsRegion.waitFor( { timeout: 10000 } );
				} catch ( error ) {
					// Fall back to the core helper, then report what was on the
					// page — a failure here is only ever read in CI output.
					try {
						await editor.openDocumentSettingsSidebar();
						await settingsRegion.waitFor( { timeout: 10000 } );
					} catch ( fallbackError ) {
						const buttons = await page
							.getByRole( 'button' )
							.evaluateAll( ( nodes ) =>
								nodes
									.map(
										( node ) =>
											node.getAttribute( 'aria-label' ) ||
											node.textContent.trim()
									)
									.filter( Boolean )
							);

						throw new Error(
							`Could not open the settings sidebar. Buttons on the page: ${ buttons.join(
								' | '
							) }`
						);
					}
				}

				// Then make sure the Block tab is the one showing. Asking the
				// interface store for the block sidebar is meant to settle this
				// on its own, but the tab can still come up on Document — the
				// sidebar mounts after the dispatch and picks its own default.
				// Clicking is the part that sticks, so wait for the tab rather
				// than probing for it, and wait again for it to take.
				if (
					await clickIfPresent(
						page.getByRole( 'tab', { name: 'Block' } ),
						10000
					)
				) {
					await page
						.getByRole( 'tab', { name: 'Block', selected: true } )
						.waitFor( { state: 'visible', timeout: 10000 } )
						.catch( () => {} );
				}

				await page.waitForTimeout( 1000 );
			},

			/**
			 * Expand a settings panel, waiting for it to be rendered first.
			 *
			 * The inspector is still filling in when the sidebar first reports
			 * itself open. A panel left collapsed keeps its controls out of the
			 * DOM, so skipping it here surfaces as a missing control later, in
			 * whichever test happened to ask for one.
			 *
			 * @param {string} panelTitle - The title text of the panel to expand.
			 */
			async expandPanel( panelTitle ) {
				const toggle = page
					.locator(
						`.components-panel__body-title:has-text("${ panelTitle }")`
					)
					.locator( 'button' )
					.first();

				try {
					await toggle.waitFor( {
						state: 'visible',
						timeout: 15000,
					} );
				} catch ( error ) {
					const panels = await page
						.locator( '.components-panel__body-title' )
						.allTextContents();

					throw new Error(
						`No "${ panelTitle }" panel in the inspector. Panels present: ${
							panels.join( ' | ' ) || '(none)'
						}`
					);
				}

				if (
					( await toggle.getAttribute( 'aria-expanded' ) ) !== 'true'
				) {
					await toggle.click();
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
				 *
				 * Waits for the block to exist and then for the selection to take.
				 * Dispatching once was a coin toss in the site editor, where the
				 * template's blocks are parsed a beat after the editor reports the
				 * entity open: the dispatch found an empty list and did nothing, and
				 * the test went on to read whichever inspector happened to be showing.
				 *
				 * @param {string} blockName - The block name (e.g., 'core/post-template').
				 * @param {number} index     - The index of the block to select (default: 0).
				 */
				async byName( blockName, index = 0 ) {
					const target = { name: blockName, idx: index };

					await page.waitForFunction(
						( { name, idx } ) =>
							window.wp.data
								.select( 'core/block-editor' )
								.getBlocksByName( name ).length > idx,
						target,
						{ timeout: 15000 }
					);

					await page.evaluate( ( { name, idx } ) => {
						const blocks = window.wp.data
							.select( 'core/block-editor' )
							.getBlocksByName( name );
						window.wp.data
							.dispatch( 'core/block-editor' )
							.selectBlock( blocks[ idx ] );
					}, target );

					await page.waitForFunction( ( { name, idx } ) => {
						const store =
							window.wp.data.select( 'core/block-editor' );
						return (
							store.getBlockSelectionStart() ===
							store.getBlocksByName( name )[ idx ]
						);
					}, target );

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
					await blockEditorUtils.expandPanel(
						'Extra Query Loop Settings'
					);
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
	// database.sql is a dump taken on one WordPress version, so it pins
	// `db_version` to whatever that was. On any other version core treats the
	// database as out of date and redirects every admin request to
	// wp-admin/upgrade.php, which makes the login in global-setup.js time out
	// before a single test runs. Upgrading keeps the fixture version-agnostic,
	// and is a no-op when the versions already match.
	wpCli( `wp core update-db` );
	wpCli( `wp cache flush` );
}

/* eslint-disable no-console */
/**
 * Test the Posts Per Page override functionality.
 */
const { test, expect } = require( './fixtures' );

test.describe( 'Posts Per Page Override', () => {
	test( 'should be able to access WordPress admin', async ( {
		admin,
		page,
	} ) => {
		// Basic smoke test - can we reach WordPress?
		await admin.visitAdminPage( 'index.php' );
		await expect( page.locator( '#wpadminbar' ) ).toBeVisible( {
			timeout: 10000,
		} );
	} );

	test( 'should be able to open the index template in site editor', async ( {
		page,
		blockEditor,
	} ) => {
		// Open the index template
		await blockEditor.visitSiteEditor( 'index', 'twentytwentyfive' );

		// Check that the site editor loaded
		const siteEditorLoaded = await page
			.locator( '.edit-site-layout' )
			.isVisible( { timeout: 15000 } );
		expect( siteEditorLoaded ).toBe( true );

		// Check that the canvas iframe is present
		const canvas = blockEditor.canvas;
		expect( canvas ).toBeTruthy();
	} );

	test( 'should show posts per page control when query inherits', async ( {
		page,
		blockEditor,
	} ) => {
		// Open the index template
		await blockEditor.visitSiteEditor( 'index', 'twentytwentyfive' );

		// Select the query loop block
		await blockEditor.selectBlock.byName( 'core/query' );

		// Open the settings sidebar
		await blockEditor.openSettingsSidebar();

		// Debug: Log all panel body titles to see what's available
		const panelBodies = await page
			.locator( '.components-panel__body-title button' )
			.allTextContents();
		console.log( 'Available panels:', panelBodies );

		// Find the sidebar panel
		const extraSettingsPanel = page.locator(
			'.components-panel__body-title:has-text("Extra Query Loop Settings")'
		);
		await expect( extraSettingsPanel ).toBeVisible( { timeout: 5000 } );

		// Expand the panel
		await blockEditor.expandPanel( 'Extra Query Loop Settings' );

		// Check for the Posts per page override control
		const perPageControl = page.locator(
			'label:has-text("Posts per page (Override)")'
		);
		await expect( perPageControl ).toBeVisible( { timeout: 5000 } );
	} );

	test( 'should reflect posts per page override in editor', async ( {
		page,
		blockEditor,
	} ) => {
		// Open the index template
		await blockEditor.visitSiteEditor( 'index', 'twentytwentyfive' );

		// Get the canvas
		const canvas = blockEditor.canvas;

		// Wait for post template block (contains the list of posts)
		await expect( canvas.locator( '.wp-block-post-template' ) ).toBeVisible(
			{ timeout: 10000 }
		);

		// Count initial posts shown (should be 10 by default)
		const initialPostCount = await canvas
			.locator( '.wp-block-post-template > li' )
			.count();
		console.log( `Initial post count: ${ initialPostCount }` );

		// Select the query loop block
		await blockEditor.selectBlock.byName( 'core/query' );

		// Open settings sidebar
		await blockEditor.openSettingsSidebar();

		// Expand Extra Query Loop Settings
		await blockEditor.expandPanel( 'Extra Query Loop Settings' );

		// Find and fill the Posts per page override control
		const perPageInput = blockEditor.getPostsPerPageInput();
		await perPageInput.fill( '3' );
		await page.waitForTimeout( 1000 ); // Wait for the effect to apply

		// Count posts again - should now show only 3
		const newPostCount = await canvas
			.locator( '.wp-block-post-template > li:visible' )
			.count();
		console.log( `New post count after override: ${ newPostCount }` );

		// Verify that only 3 posts are visible
		expect( newPostCount ).toBe( 3 );
	} );

	test( 'should enforce max value from posts_per_page setting', async ( {
		page,
		blockEditor,
	} ) => {
		// Open the index template
		await blockEditor.visitSiteEditor( 'index', 'twentytwentyfive' );

		// Get the canvas
		const canvas = blockEditor.canvas;

		// Wait for query loop block to be visible
		await expect( canvas.locator( '.wp-block-query' ) ).toBeVisible( {
			timeout: 10000,
		} );

		// Select the query loop block
		await blockEditor.selectBlock.byName( 'core/query' );

		// Open settings sidebar
		await blockEditor.openSettingsSidebar();

		// Expand Extra Query Loop Settings
		await blockEditor.expandPanel( 'Extra Query Loop Settings' );

		// Find the Posts per page override input
		const perPageInput = blockEditor.getPostsPerPageInput();

		// Check that it has a max attribute set to 10 (default posts_per_page)
		const maxValue = await perPageInput.getAttribute( 'max' );
		expect( maxValue ).toBe( '10' );

		// Try to enter a value higher than the max
		await perPageInput.fill( '15' );
		await page.waitForTimeout( 500 );

		// The browser should prevent values higher than max, but let's verify the effect
		// Count visible posts - should not exceed 10
		const postCount = await canvas
			.locator( '.wp-block-post-template > li:visible' )
			.count();
		console.log( `Post count with value exceeding max: ${ postCount }` );

		// Should be limited to 10 or less
		expect( postCount ).toBeLessThanOrEqual( 10 );
	} );
} );

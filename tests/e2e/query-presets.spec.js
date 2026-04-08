/* eslint-disable no-console */
/**
 * Test the Query Presets functionality.
 */
const { test, expect } = require( './fixtures' );

test.describe( 'Query Presets', () => {
	test( 'should show query preset dropdown when presets are registered', async ( {
		page,
		blockEditor,
	} ) => {
		// Open the index template
		await blockEditor.visitSiteEditor( 'index', 'twentytwentyfive' );

		// Select the query loop block
		await blockEditor.selectBlock.byName( 'core/query' );

		// Open the settings sidebar
		await blockEditor.openSettingsSidebar();

		// Expand Extra Query Loop Settings
		await blockEditor.queryBlock.openSettingsPanel();

		// Check for the Query Preset dropdown
		const presetLabel = page.locator( 'label:has-text("Query Preset")' );
		await expect( presetLabel ).toBeVisible( { timeout: 5000 } );

		// Open the dropdown and verify options
		const selectElement = page.getByRole( 'combobox', {
			name: 'Query Preset',
		} );
		await expect( selectElement ).toBeVisible( { timeout: 5000 } );

		const options = await selectElement
			.locator( 'option' )
			.allTextContents();
		console.log( 'Available preset options:', options );

		// Verify our test presets are present
		expect( options ).toContain( '— None —' );
		expect( options ).toContain( 'Alphabetical by Title' );
		expect( options ).toContain( 'Alphabetical by Title (Z-A)' );
	} );

	test( 'should change post order when selecting alphabetical preset in editor', async ( {
		page,
		blockEditor,
	} ) => {
		// Open the index template
		await blockEditor.visitSiteEditor( 'index', 'twentytwentyfive' );

		// Get the canvas
		const canvas = blockEditor.canvas;

		// Wait for post template block
		await expect( canvas.locator( '.wp-block-post-template' ) ).toBeVisible(
			{
				timeout: 10000,
			}
		);

		// Get the initial post titles order
		const getPostTitles = async () => {
			return await canvas
				.locator( '.wp-block-post-template .wp-block-post-title' )
				.allTextContents();
		};

		const initialTitles = await getPostTitles();
		console.log( 'Initial post titles:', initialTitles );

		// Select the query loop block
		await blockEditor.selectBlock.byName( 'core/query' );

		// Open settings sidebar
		await blockEditor.openSettingsSidebar();

		// Expand Extra Query Loop Settings
		await blockEditor.queryBlock.openSettingsPanel();

		// Select the "Alphabetical by Title" preset
		const selectElement = page.getByRole( 'combobox', {
			name: 'Query Preset',
		} );

		await selectElement.selectOption( 'alphabetical_title' );

		// Wait for the query to update
		await page.waitForTimeout( 2000 );

		// Get the new post titles order
		const newTitles = await getPostTitles();
		console.log( 'Post titles after preset:', newTitles );

		// Verify the posts are now sorted alphabetically (A-Z)
		const sortedTitles = [ ...newTitles ].sort( ( a, b ) =>
			a.localeCompare( b )
		);
		expect( newTitles ).toEqual( sortedTitles );
	} );

	test( 'should change post order when selecting Z-A preset in editor', async ( {
		page,
		blockEditor,
	} ) => {
		// Open the index template
		await blockEditor.visitSiteEditor( 'index', 'twentytwentyfive' );

		// Get the canvas
		const canvas = blockEditor.canvas;

		// Wait for post template block
		await expect( canvas.locator( '.wp-block-post-template' ) ).toBeVisible(
			{
				timeout: 10000,
			}
		);

		// Get post titles helper
		const getPostTitles = async () => {
			return await canvas
				.locator( '.wp-block-post-template .wp-block-post-title' )
				.allTextContents();
		};

		// Select the query loop block
		await blockEditor.selectBlock.byName( 'core/query' );

		// Open settings sidebar
		await blockEditor.openSettingsSidebar();

		// Expand Extra Query Loop Settings
		await blockEditor.queryBlock.openSettingsPanel();

		// Select the "Alphabetical by Title (Z-A)" preset
		const selectElement = page.getByRole( 'combobox', {
			name: 'Query Preset',
		} );

		await selectElement.selectOption( 'alphabetical_title_desc' );

		// Wait for the query to update
		await page.waitForTimeout( 2000 );

		// Get the new post titles order
		const newTitles = await getPostTitles();
		console.log( 'Post titles after Z-A preset:', newTitles );

		// Verify the posts are now sorted alphabetically in reverse (Z-A)
		const sortedTitlesDesc = [ ...newTitles ].sort( ( a, b ) =>
			b.localeCompare( a )
		);
		expect( newTitles ).toEqual( sortedTitlesDesc );
	} );

	test( 'should apply query preset on frontend', async ( {
		page,
		admin,
		editor,
		blockEditor,
	} ) => {
		// Create a page with a Query Loop block that uses a preset
		await admin.createNewPost( {
			postType: 'page',
			title: 'Preset Test Page',
		} );

		// Insert a Query Loop block with inner blocks to bypass the pattern chooser
		await editor.insertBlock( {
			name: 'core/query',
			attributes: { query: { inherit: false, perPage: 5 } },
			innerBlocks: [
				{
					name: 'core/post-template',
					innerBlocks: [ { name: 'core/post-title' } ],
				},
			],
		} );
		await page.waitForTimeout( 500 );

		// Select the query loop block
		await blockEditor.selectBlock.byName( 'core/query' );

		// Open settings sidebar
		await blockEditor.openSettingsSidebar();

		// Expand Extra Query Loop Settings
		await blockEditor.queryBlock.openSettingsPanel();

		// Select the alphabetical preset
		const selectElement = page.getByRole( 'combobox', {
			name: 'Query Preset',
		} );
		await expect( selectElement ).toBeVisible( { timeout: 5000 } );
		await selectElement.selectOption( 'alphabetical_title' );
		await page.waitForTimeout( 1000 );

		// Publish and visit the page
		await blockEditor.publishAndVisit();

		// Get the post titles on the frontend
		const frontendTitles = await page
			.locator( '.wp-block-post-template .wp-block-post-title' )
			.allTextContents();
		console.log( 'Frontend post titles:', frontendTitles );

		// Verify they are sorted alphabetically
		expect( frontendTitles.length ).toBeGreaterThan( 1 );
		const sortedTitles = [ ...frontendTitles ].sort( ( a, b ) =>
			a.localeCompare( b )
		);
		expect( frontendTitles ).toEqual( sortedTitles );
	} );
} );

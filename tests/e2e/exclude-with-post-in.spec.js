/* eslint-disable no-console */
/**
 * Test that exclude displayed posts works correctly when post__in is set.
 *
 * When a query loop uses post__in (e.g., via Advanced Query Loop plugin),
 * WordPress ignores post__not_in. This test verifies that we correctly
 * filter the post__in array to exclude already displayed posts.
 */
const { test, expect } = require( './fixtures' );

test.describe( 'Exclude Displayed Posts with post__in', () => {
	test( 'should exclude displayed posts even when post__in is set via Advanced Query Loop', async ( {
		page,
		admin,
		editor,
		blockEditor,
	} ) => {
		// Create a new page
		await admin.createNewPost( { postType: 'page' } );
		await page.waitForTimeout( 1500 );

		// Dismiss any modals
		const closeButton = page.getByRole( 'button', { name: 'Close' } );
		if (
			await closeButton
				.isVisible( { timeout: 1000 } )
				.catch( () => false )
		) {
			await closeButton.click();
		}

		// Add a title
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'textbox', { name: 'Add title' } )
			.click();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'textbox', { name: 'Add title' } )
			.fill( 'Test post__in exclusion' );

		// Open sidebar settings
		await editor.openDocumentSettingsSidebar();
		await page.waitForTimeout( 500 );

		// First, we need to get some post IDs to use for post__in
		// Insert the first Query Loop block using Advanced Query Loop
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'button', { name: 'Add default block' } )
			.click();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'document', { name: 'Empty block; start writing or' } )
			.fill( '/advanced' );
		await page
			.getByRole( 'option', { name: 'Advanced Query Loop' } )
			.click();

		// Wait for block to be inserted
		await page.waitForTimeout( 1000 );

		// The Advanced Query Loop block should be visible
		await expect(
			page
				.locator( 'iframe[name="editor-canvas"]' )
				.contentFrame()
				.locator( '.wp-block-query' )
		).toBeVisible( { timeout: 5000 } );

		// Select a default pattern
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByLabel( 'Block: Advanced Query Loop' )
			.getByRole( 'button', { name: 'Start blank' } )
			.click();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'button', { name: 'Title & Date' } )
			.click();

		// Check if we need to set this to a custom loop, WP 6.9 does not default to custom.
		await blockEditor.queryBlock.setAsCustom();

		// Set the posts to include
		await page
			.getByRole( 'combobox', { name: 'Posts', exact: true } )
			.click();
		await page.getByRole( 'option', { name: 'Post 23' } ).click();
		await page.getByRole( 'option', { name: 'Post 21' } ).click();

		// Get post titles from first query
		const canvas = page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame();
		await page.waitForTimeout( 1000 );

		// Select the first query loop block
		await blockEditor.selectBlock.byName( 'core/query', 0 );

		// Add a second Query Loop block after the first
		await page
			.getByRole( 'toolbar', { name: 'Block tools' } )
			.getByLabel( 'Options' )
			.click();
		await page.getByRole( 'menuitem', { name: 'Add after ⌥⌘Y' } ).click();

		// Insert second query loop (regular one, not AQL)
		await canvas
			.getByRole( 'document', { name: 'Empty block; start writing or' } )
			.last()
			.fill( '/query' );
		await page
			.getByRole( 'option', { name: 'Query Loop' } )
			.first()
			.click();
		await page.waitForTimeout( 1000 );

		// Start with a blank layout
		const startBlankButton = canvas.getByRole( 'button', {
			name: 'Start blank',
		} );
		if (
			await startBlankButton
				.isVisible( { timeout: 2000 } )
				.catch( () => false )
		) {
			await startBlankButton.click();
			await page.waitForTimeout( 500 );
		}

		// Choose a pattern
		const patternButton = canvas.getByRole( 'button', {
			name: 'Title & Date',
		} );
		if (
			await patternButton
				.isVisible( { timeout: 2000 } )
				.catch( () => false )
		) {
			await patternButton.click();
			await page.waitForTimeout( 500 );
		}

		await blockEditor.queryBlock.setAsCustom();

		// Select the second query loop block
		await blockEditor.selectBlock.byName( 'core/query', 1 );

		// Open settings for the second query loop
		await editor.openDocumentSettingsSidebar();
		await page.waitForTimeout( 500 );

		// Expand Extra Query Loop Settings panel
		await blockEditor.queryBlock.openSettingsPanel();

		// Enable "Exclude Displayed Posts"
		await blockEditor.queryBlock.excludeDisplayed();

		// Publish the page
		await blockEditor.publishAndVisit();

		// Get all post titles from both query loops
		console.log( await page.content() );
		const allPostTitles = await page
			.locator( '.wp-block-post-template .wp-block-post-title' )
			.allTextContents();
		console.log( 'All post titles on page:', allPostTitles );
		expect( allPostTitles.length ).toBe( 12 );

		// Verify no duplicates exist
		const uniqueTitles = [ ...new Set( allPostTitles ) ];
		console.log(
			`Total posts: ${ allPostTitles.length }, Unique: ${ uniqueTitles.length }`
		);

		// The key assertion: there should be no duplicate posts
		expect( allPostTitles.length ).toBe( uniqueTitles.length );
	} );

	test( 'should properly filter post__in array when multiple post templates used', async ( {
		page,
		admin,
		editor,
		blockEditor,
	} ) => {
		// This test verifies the fix works for the excludeDisplayedForCurrentLoop feature
		// when post__in is set via Advanced Query Loop

		// Create a new page
		await admin.createNewPost( { postType: 'page' } );
		await page.waitForTimeout( 1500 );

		// Dismiss any modals
		const closeButton = page.getByRole( 'button', { name: 'Close' } );
		if (
			await closeButton
				.isVisible( { timeout: 1000 } )
				.catch( () => false )
		) {
			await closeButton.click();
		}

		// Add a title
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'textbox', { name: 'Add title' } )
			.click();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'textbox', { name: 'Add title' } )
			.fill( 'Test post__in with multiple templates' );

		// Insert an Advanced Query Loop block
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'button', { name: 'Add default block' } )
			.click();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'document', { name: 'Empty block; start writing or' } )
			.fill( '/query' );

		await page
			.getByRole( 'option', { name: 'Advanced Query Loop' } )
			.click();

		const canvas = page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame();

		// Start with a blank layout
		const startBlankButton = canvas.getByRole( 'button', {
			name: 'Start blank',
		} );
		if (
			await startBlankButton
				.isVisible( { timeout: 2000 } )
				.catch( () => false )
		) {
			await startBlankButton.click();
			await page.waitForTimeout( 500 );
		}

		// Choose a pattern with multiple post template blocks
		const patternButton = canvas.getByRole( 'button', {
			name: 'Image, Date, & Title',
		} );
		if (
			await patternButton
				.isVisible( { timeout: 2000 } )
				.catch( () => false )
		) {
			await patternButton.click();
			await page.waitForTimeout( 500 );
		}

		await editor.openDocumentSettingsSidebar();
		await blockEditor.queryBlock.setAsCustom();

		// Set the posts to include
		await page
			.getByRole( 'combobox', { name: 'Posts', exact: true } )
			.click();
		await page.getByRole( 'option', { name: 'Post 23' } ).click();
		await page.getByRole( 'option', { name: 'Post 21' } ).click();
		await page.getByRole( 'option', { name: 'Post 19' } ).click();
		await page.getByRole( 'option', { name: 'Post 18' } ).click();
		await page.getByRole( 'option', { name: 'Post 16' } ).click();
		await page.getByRole( 'option', { name: 'Post 24' } ).click();

		// Select the first post template and configure it
		await blockEditor.selectBlock.byName( 'core/post-template' );
		await page
			.getByRole( 'button', { name: 'Post Template Settings' } )
			.click();
		await page
			.getByRole( 'spinbutton', { name: 'Posts per template' } )
			.click();
		await page
			.getByRole( 'spinbutton', { name: 'Posts per template' } )
			.fill( '2' );

		// Duplicate to create second post template
		await page
			.getByRole( 'toolbar', { name: 'Block tools' } )
			.getByLabel( 'Options' )
			.click();
		await page.getByRole( 'menuitem', { name: /^Duplicate / } ).click();
		await page.waitForTimeout( 500 );

		// Configure second post template with different settings
		await page.getByRole( 'button', { name: 'Grid view' } ).click();
		await page
			.getByRole( 'button', { name: 'Post Template Settings' } )
			.click();
		await page
			.getByRole( 'spinbutton', { name: 'Posts per template' } )
			.click();
		await page
			.getByRole( 'spinbutton', { name: 'Posts per template' } )
			.press( 'Shift+ArrowLeft' );
		await page
			.getByRole( 'spinbutton', { name: 'Posts per template' } )
			.fill( '3' );

		// Publish the page
		await blockEditor.publishAndVisit();

		// Get all post titles
		const allPostTitles = await page
			.locator( '.wp-block-post-template .wp-block-post-title' )
			.allTextContents();
		console.log( 'Post titles:', allPostTitles );
		console.log( 'Total posts:', allPostTitles.length );

		// Should have 5 total posts (2 + 3)
		expect( allPostTitles.length ).toBe( 5 );

		// Verify no duplicates
		const uniqueTitles = [ ...new Set( allPostTitles ) ];
		expect( uniqueTitles.length ).toBe( 5 );
	} );
} );

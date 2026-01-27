/* eslint-disable no-console */
/**
 * Test multiple post-template blocks within a single query loop.
 */
const { test, expect } = require( './fixtures' );

test.describe( 'Multiple Post Templates', () => {
	test( 'should show posts per template control when query does not inherit', async ( {
		page,
		admin,
		editor,
		blockEditor,
	} ) => {
		// Create a new page
		await admin.createNewPost( { postType: 'page' } );

		// Insert a Query Loop block
		await editor.insertBlock( { name: 'core/query' } );

		// Handle the pattern chooser modal if it appears
		await page.waitForTimeout( 1000 );

		// Wait for the query block to be inserted
		await expect( editor.canvas.locator( '.wp-block-query' ) ).toBeVisible(
			{ timeout: 5000 }
		);

		// Make sure the query is NOT set to inherit by checking/unchecking inherit toggle
		await blockEditor.selectBlock.byName( 'core/query', 0 );
		await editor.openDocumentSettingsSidebar();
		await page.waitForTimeout( 500 );

		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'button', { name: 'Start blank' } )
			.click();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'button', { name: 'Title & Date' } )
			.click();
		await blockEditor.queryBlock.setAsCustom();

		await blockEditor.selectBlock.byName( 'core/post-template' );
		await page
			.getByRole( 'button', { name: 'Post Template Settings' } )
			.click();

		// Debug: Log all available panels
		const allPanels = await page
			.locator( '.components-panel__body-title' )
			.allTextContents();
		console.log( 'Available panels:', allPanels );

		// Check for the Post Template Settings panel
		const postTemplatePanel = page.locator(
			'.components-panel__body-title:has-text("Post Template Settings")'
		);

		// The panel should be visible since this is a non-inherited query
		await expect( postTemplatePanel ).toBeVisible( { timeout: 5000 } );
	} );

	test( 'should support multiple post-template blocks with different post limits', async ( {
		page,
		admin,
		editor,
		blockEditor,
	} ) => {
		// Create a new page
		await admin.createNewPost( { postType: 'page' } );
		await page.waitForTimeout( 1500 );
		await page.getByRole( 'button', { name: 'Close' } ).click();
		await editor.openDocumentSettingsSidebar();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'textbox', { name: 'Add title' } )
			.click();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'textbox', { name: 'Add title' } )
			.fill( 'test' );
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
		await page.getByRole( 'option', { name: /^Query Loop/ } ).click();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'button', { name: 'Start blank' } )
			.click();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'button', { name: 'Image, Date, & Title' } )
			.click();
		await blockEditor.queryBlock.setAsCustom();

		await blockEditor.selectBlock.byName( 'core/post-template' );
		await page
			.getByRole( 'button', { name: 'Post Template Settings' } )
			.click();
		await page
			.getByRole( 'spinbutton', { name: 'Posts per template' } )
			.click();
		await page
			.getByRole( 'spinbutton', { name: 'Posts per template' } )
			.fill( '1' );
		await page
			.getByRole( 'toolbar', { name: 'Block tools' } )
			.getByLabel( 'Options' )
			.click();
		await page.getByRole( 'menuitem', { name: /^Duplicate / } ).click();
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
			.fill( '2' );
		await page.getByRole( 'spinbutton', { name: 'Columns' } ).click();
		await page
			.getByRole( 'spinbutton', { name: 'Columns' } )
			.press( 'Shift+ArrowLeft' );
		await page.getByRole( 'spinbutton', { name: 'Columns' } ).fill( '2' );
		await page
			.getByRole( 'toolbar', { name: 'Block tools' } )
			.getByLabel( 'Options' )
			.click();
		await page.getByRole( 'menuitem', { name: /^Duplicate / } ).click();
		await page.getByRole( 'spinbutton', { name: 'Columns' } ).click();
		await page
			.getByRole( 'spinbutton', { name: 'Columns' } )
			.press( 'Shift+ArrowLeft' );
		await page.getByRole( 'spinbutton', { name: 'Columns' } ).fill( '3' );
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

		await blockEditor.publishAndVisit();

		// Get all the post titles on the page
		const postTitles = await page
			.locator( '.wp-block-post-template .wp-block-post-title' )
			.allTextContents();
		console.log( 'Post titles found:', postTitles );
		console.log( 'Total posts:', postTitles.length );

		// Should have exactly 6 posts total (1 + 2 + 3)
		expect( postTitles.length ).toBe( 6 );

		// Verify no duplicate posts
		const uniqueTitles = [ ...new Set( postTitles ) ];
		console.log( 'Unique posts:', uniqueTitles.length );
		expect( uniqueTitles.length ).toBe( 6 );
	} );

	test( 'should automatically limit third post template to remaining posts', async ( {
		page,
		admin,
		editor,
		blockEditor,
	} ) => {
		// Create a new page
		await admin.createNewPost( { postType: 'page' } );
		await page.waitForTimeout( 1500 );
		await page.getByRole( 'button', { name: 'Close' } ).click();
		await editor.openDocumentSettingsSidebar();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'textbox', { name: 'Add title' } )
			.click();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'textbox', { name: 'Add title' } )
			.fill( 'test automatic limit' );
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
		await page.getByRole( 'option', { name: /^Query Loop/ } ).click();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'button', { name: 'Start blank' } )
			.click();
		await page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame()
			.getByRole( 'button', { name: 'Image, Date, & Title' } )
			.click();
		await blockEditor.queryBlock.setAsCustom();

		// Configure first post template: 1 post
		await blockEditor.selectBlock.byName( 'core/post-template' );
		await page
			.getByRole( 'button', { name: 'Post Template Settings' } )
			.click();
		await page
			.getByRole( 'spinbutton', { name: 'Posts per template' } )
			.click();
		await page
			.getByRole( 'spinbutton', { name: 'Posts per template' } )
			.fill( '1' );

		// Duplicate to create second post template
		await page
			.getByRole( 'toolbar', { name: 'Block tools' } )
			.getByLabel( 'Options' )
			.click();
		await page.getByRole( 'menuitem', { name: /^Duplicate / } ).click();

		// Configure second post template: 2 posts
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
			.fill( '2' );
		await page.getByRole( 'spinbutton', { name: 'Columns' } ).click();
		await page
			.getByRole( 'spinbutton', { name: 'Columns' } )
			.press( 'Shift+ArrowLeft' );
		await page.getByRole( 'spinbutton', { name: 'Columns' } ).fill( '2' );

		// Duplicate to create third post template
		await page
			.getByRole( 'toolbar', { name: 'Block tools' } )
			.getByLabel( 'Options' )
			.click();
		await page.getByRole( 'menuitem', { name: /^Duplicate / } ).click();

		// Configure third post template: leave Posts per template EMPTY (should auto-calculate to 7)
		await page.getByRole( 'spinbutton', { name: 'Columns' } ).click();
		await page
			.getByRole( 'spinbutton', { name: 'Columns' } )
			.press( 'Shift+ArrowLeft' );
		await page.getByRole( 'spinbutton', { name: 'Columns' } ).fill( '3' );
		await page
			.getByRole( 'button', { name: 'Post Template Settings' } )
			.click();

		// Clear the Posts per template field if it has a value
		const postsPerTemplateInput = page.getByRole( 'spinbutton', {
			name: 'Posts per template',
		} );
		const currentValue = await postsPerTemplateInput.inputValue();
		if ( currentValue ) {
			await postsPerTemplateInput.click();
			await postsPerTemplateInput.press( 'Shift+ArrowLeft' );
			await postsPerTemplateInput.press( 'Backspace' );
		}

		// Publish and view the page
		await blockEditor.publishAndVisit();

		// Get all the post titles on the page
		const postTitles = await page
			.locator( '.wp-block-post-template .wp-block-post-title' )
			.allTextContents();
		console.log( 'Post titles found:', postTitles );
		console.log( 'Total posts:', postTitles.length );

		// Should have exactly 10 posts total (1 + 2 + 7 auto-calculated from default 10 posts per page)
		expect( postTitles.length ).toBe( 10 );

		// Verify no duplicate posts
		const uniqueTitles = [ ...new Set( postTitles ) ];
		console.log( 'Unique posts:', uniqueTitles.length );
		expect( uniqueTitles.length ).toBe( 10 );
	} );
} );

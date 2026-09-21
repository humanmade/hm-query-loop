/* eslint-disable no-console */
/**
 * Test that a query loop can leave out the post being viewed.
 *
 * The post created here is the newest post, so a loop of the latest posts
 * would list it first unless the "Exclude current post" setting removes it.
 */
const { test, expect, wpCli } = require( './fixtures' );

test.describe( 'Exclude current post', () => {
	test( 'should leave the post being viewed out of its own query loop, and still fill the loop', async ( {
		page,
		admin,
		editor,
		blockEditor,
	} ) => {
		const postTitle = 'Test exclude current post';
		const postsPerPage = parseInt(
			wpCli( 'wp option get posts_per_page' ),
			10
		);

		await admin.createNewPost( { postType: 'post' } );
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

		const canvas = page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame();

		await canvas.getByRole( 'textbox', { name: 'Add title' } ).click();
		await canvas
			.getByRole( 'textbox', { name: 'Add title' } )
			.fill( postTitle );

		await editor.openDocumentSettingsSidebar();
		await page.waitForTimeout( 500 );

		// Insert a Query Loop block
		await canvas
			.getByRole( 'button', { name: 'Add default block' } )
			.click();
		await canvas
			.getByRole( 'document', { name: 'Empty block; start writing or' } )
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

		await blockEditor.selectBlock.byName( 'core/query', 0 );
		await blockEditor.queryBlock.setAsCustom();
		await blockEditor.queryBlock.openSettingsPanel();

		await page
			.getByRole( 'checkbox', { name: 'Exclude current post' } )
			.check();

		await blockEditor.publishAndVisit();

		// The theme's template has query loops of its own, so only read the
		// loop inside the post content.
		const loopTitles = await page
			.locator(
				'.wp-block-post-content .wp-block-post-template .wp-block-post-title'
			)
			.allTextContents();
		console.log( 'Query loop titles:', loopTitles );

		expect( loopTitles.map( ( title ) => title.trim() ) ).not.toContain(
			postTitle
		);
		expect( loopTitles.length ).toBe( postsPerPage );
	} );
} );

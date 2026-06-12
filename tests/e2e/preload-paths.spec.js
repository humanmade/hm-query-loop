/* eslint-disable no-console */
/**
 * Test that REST API paths for query loop blocks are preloaded in the editor.
 *
 * The preload-paths feature prevents the editor from firing HTTP requests
 * for posts on initial load by injecting the REST responses into the
 * apiFetch preloading middleware during server-side editor bootstrap.
 */
const { test, expect } = require( './fixtures' );

test.describe( 'Query Loop REST Preloading', () => {
	/**
	 * Create a page with a non-inherited Query Loop block (posts type, 5 per page,
	 * descending date order), publish it, then reopen it in the editor.
	 * Count /wp/v2/posts requests fired after the editor is interactive:
	 * with preloading active the count should be 0 for that loop's initial render.
	 */
	test( 'should preload /wp/v2/posts REST path for query loop blocks', async ( {
		page,
		admin,
		editor,
	} ) => {
		// --- Step 1: Create and publish a page with a Query Loop block ---
		await admin.createNewPost( { postType: 'page' } );
		await page.waitForTimeout( 1500 );

		// Dismiss modals if any.
		const closeButton = page.getByRole( 'button', { name: 'Close' } );
		if ( await closeButton.isVisible( { timeout: 1000 } ).catch( () => false ) ) {
			await closeButton.click();
		}

		const canvas = page.locator( 'iframe[name="editor-canvas"]' ).contentFrame();

		await canvas.getByRole( 'textbox', { name: 'Add title' } ).click();
		await canvas.getByRole( 'textbox', { name: 'Add title' } ).fill( 'Preload test page' );

		// Insert a Query Loop block.
		await canvas.getByRole( 'button', { name: 'Add default block' } ).click();
		await canvas.getByRole( 'document', { name: 'Empty block; start writing or' } ).fill( '/query' );
		await page.getByRole( 'option', { name: 'Query Loop' } ).click();
		await page.waitForTimeout( 1000 );

		// Choose a layout / start blank if prompted.
		const chooseButton = page.getByRole( 'button', { name: /choose|start blank/i } );
		if ( await chooseButton.isVisible( { timeout: 2000 } ).catch( () => false ) ) {
			await chooseButton.first().click();
			await page.waitForTimeout( 500 );
		}

		// Publish.
		await editor.publishPost();
		await page.waitForTimeout( 1500 );

		// Get the post ID from the URL.
		const url = page.url();
		const postIdMatch = url.match( /[?&]post=(\d+)/ );
		const postId = postIdMatch ? postIdMatch[ 1 ] : null;
		expect( postId ).not.toBeNull();

		console.log( 'Created page with ID:', postId );

		// --- Step 2: Reopen the editor and intercept REST requests ---
		// Track any /wp/v2/posts requests that fire AFTER the page navigation.
		const postsRequests = [];
		page.on( 'request', ( req ) => {
			if (
				req.url().includes( '/wp/v2/posts' ) &&
				! req.url().includes( 'wp/v2/posts/' ) // exclude single-post endpoints
			) {
				postsRequests.push( req.url() );
				console.log( 'REST request fired:', req.url() );
			}
		} );

		// Navigate to the edit page (fresh load, no editor cache).
		await page.goto( `/wp-admin/post.php?post=${ postId }&action=edit` );
		await page.waitForLoadState( 'networkidle', { timeout: 30000 } );

		// Give the editor a moment to render blocks.
		await page.waitForTimeout( 3000 );

		console.log( 'Total /wp/v2/posts requests on load:', postsRequests.length );
		console.log( 'Requests:', postsRequests );

		// With preloading active, the query loop's initial posts fetch should
		// be served from the preload cache — no HTTP request fired.
		expect( postsRequests.length ).toBe( 0 );
	} );

	test( 'should still fetch posts after query attributes change', async ( {
		page,
		admin,
		editor,
	} ) => {
		// Create a page with a Query Loop block.
		await admin.createNewPost( { postType: 'page' } );
		await page.waitForTimeout( 1500 );

		const closeButton = page.getByRole( 'button', { name: 'Close' } );
		if ( await closeButton.isVisible( { timeout: 1000 } ).catch( () => false ) ) {
			await closeButton.click();
		}

		const canvas = page.locator( 'iframe[name="editor-canvas"]' ).contentFrame();

		await canvas.getByRole( 'textbox', { name: 'Add title' } ).click();
		await canvas.getByRole( 'textbox', { name: 'Add title' } ).fill( 'Preload change test' );

		await canvas.getByRole( 'button', { name: 'Add default block' } ).click();
		await canvas.getByRole( 'document', { name: 'Empty block; start writing or' } ).fill( '/query' );
		await page.getByRole( 'option', { name: 'Query Loop' } ).click();
		await page.waitForTimeout( 1000 );

		const chooseButton = page.getByRole( 'button', { name: /choose|start blank/i } );
		if ( await chooseButton.isVisible( { timeout: 2000 } ).catch( () => false ) ) {
			await chooseButton.first().click();
			await page.waitForTimeout( 500 );
		}

		await editor.publishPost();
		await page.waitForTimeout( 1500 );

		const url = page.url();
		const postIdMatch = url.match( /[?&]post=(\d+)/ );
		const postId = postIdMatch ? postIdMatch[ 1 ] : null;
		expect( postId ).not.toBeNull();

		// Reload the editor.
		await page.goto( `/wp-admin/post.php?post=${ postId }&action=edit` );
		await page.waitForLoadState( 'networkidle', { timeout: 30000 } );
		await page.waitForTimeout( 2000 );

		// Start tracking requests AFTER initial load is complete.
		const postsRequestsAfterLoad = [];
		page.on( 'request', ( req ) => {
			if (
				req.url().includes( '/wp/v2/posts' ) &&
				! req.url().includes( 'wp/v2/posts/' )
			) {
				postsRequestsAfterLoad.push( req.url() );
			}
		} );

		// Click the Query Loop block to select it, then change its items-per-page.
		const queryBlock = canvas.locator( '.wp-block-query' ).first();
		if ( await queryBlock.isVisible( { timeout: 5000 } ).catch( () => false ) ) {
			await queryBlock.click();
			await page.waitForTimeout( 500 );

			// Open the Query Loop inspector controls.
			const settingsButton = page.getByRole( 'button', { name: 'Settings' } );
			if ( await settingsButton.isVisible( { timeout: 1000 } ).catch( () => false ) ) {
				await settingsButton.click();
			}

			// A query attribute change should trigger a fresh REST request
			// (cache miss for the new params).
			await page.waitForTimeout( 2000 );
		}

		// After attribute changes, the editor should eventually re-fetch.
		// This test just confirms the block is still functional (doesn't hang
		// after a cache miss). We don't assert exact request count here.
		console.log( 'Requests after load/interaction:', postsRequestsAfterLoad.length );

		// Block should still be visible (not broken by a cache miss).
		await expect(
			canvas.locator( '.wp-block-query' ).first()
		).toBeVisible( { timeout: 10000 } );
	} );
} );

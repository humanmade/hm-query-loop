/* eslint-disable no-console */
/**
 * Test that off-screen Query Loop blocks are replaced with a lightweight
 * placeholder in the editor until they scroll into view.
 *
 * Mounting the real Query Loop block fires a REST request to fetch its posts
 * for the preview. On a page with many query loops, rendering every one up
 * front dispatches all of those requests on editor load. This plugin defers
 * the off-screen blocks: they render a cheap placeholder (which issues no
 * request) until they intersect the viewport, at which point the real block
 * is mounted.
 */
const { test, expect } = require( './fixtures' );

const PLACEHOLDER_SELECTOR = '.hm-query-loop-viewport-placeholder';

// A single query loop followed by a tall spacer, repeated, so that the later
// query loops start well below the fold on a standard test viewport.
const queryLoopWithSpacer = (
	queryId
) => `<!-- wp:query {"queryId":${ queryId },"query":{"perPage":3,"postType":"post","inherit":false}} -->
<div class="wp-block-query"><!-- wp:post-template -->
<!-- wp:post-title /-->
<!-- /wp:post-template --></div>
<!-- /wp:query -->

<!-- wp:spacer {"height":"1500px"} -->
<div style="height:1500px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->`;

test.describe( 'Viewport placeholder for Query Loop blocks', () => {
	test( 'renders placeholders for off-screen query loops and loads them on scroll', async ( {
		page,
		admin,
		editor,
	} ) => {
		await admin.createNewPost( { postType: 'page' } );
		await page.waitForTimeout( 1500 );

		// Dismiss the welcome guide / any modal if present.
		const closeButton = page.getByRole( 'button', { name: 'Close' } );
		if (
			await closeButton
				.isVisible( { timeout: 1000 } )
				.catch( () => false )
		) {
			await closeButton.click();
		}

		// Three query loops separated by tall spacers. The first sits in the
		// viewport on load; the later two start below the fold.
		await editor.setContent(
			[
				queryLoopWithSpacer( 101 ),
				queryLoopWithSpacer( 102 ),
				queryLoopWithSpacer( 103 ),
			].join( '\n\n' )
		);

		const canvas = page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame();

		// All three query blocks should exist in the block tree.
		const queryBlockCount = await page.evaluate(
			() =>
				window.wp.data
					.select( 'core/block-editor' )
					.getBlocksByName( 'core/query' ).length
		);
		expect( queryBlockCount ).toBe( 3 );

		// Let the intersection observers settle for the initial viewport.
		await page.waitForTimeout( 1500 );

		// At least one of the below-the-fold query loops should be showing the
		// placeholder rather than the fully rendered block.
		const initialPlaceholders = await canvas
			.locator( PLACEHOLDER_SELECTOR )
			.count();
		expect( initialPlaceholders ).toBeGreaterThan( 0 );

		// The last query loop is the furthest down the page, so it should be a
		// placeholder before we scroll to it.
		const lastLoopPlaceholder = canvas
			.locator( PLACEHOLDER_SELECTOR )
			.last();
		await expect( lastLoopPlaceholder ).toBeVisible();

		// Scroll the placeholder into view; the observer should then swap in
		// the real block, so the placeholder count drops.
		await lastLoopPlaceholder.scrollIntoViewIfNeeded();
		await page.waitForTimeout( 1500 );

		const remainingPlaceholders = await canvas
			.locator( PLACEHOLDER_SELECTOR )
			.count();
		expect( remainingPlaceholders ).toBeLessThan( initialPlaceholders );
	} );

	test( 'renders a selected query loop immediately instead of a placeholder', async ( {
		page,
		admin,
		editor,
	} ) => {
		await admin.createNewPost( { postType: 'page' } );
		await page.waitForTimeout( 1500 );

		const closeButton = page.getByRole( 'button', { name: 'Close' } );
		if (
			await closeButton
				.isVisible( { timeout: 1000 } )
				.catch( () => false )
		) {
			await closeButton.click();
		}

		await editor.setContent(
			[
				queryLoopWithSpacer( 201 ),
				queryLoopWithSpacer( 202 ),
				queryLoopWithSpacer( 203 ),
			].join( '\n\n' )
		);

		await page.waitForTimeout( 1500 );

		// Select the last query loop via the data store (as the List View
		// would). A selected block must render immediately, even off-screen,
		// so its inspector controls and content are available for editing.
		await page.evaluate( () => {
			const blocks = window.wp.data
				.select( 'core/block-editor' )
				.getBlocksByName( 'core/query' );
			window.wp.data
				.dispatch( 'core/block-editor' )
				.selectBlock( blocks[ blocks.length - 1 ] );
		} );

		await page.waitForTimeout( 1000 );

		const canvas = page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame();

		// The selected (last) query loop should no longer be a placeholder.
		// With three loops and the last one selected, at most the middle one
		// can remain a placeholder.
		const placeholders = await canvas
			.locator( PLACEHOLDER_SELECTOR )
			.count();
		expect( placeholders ).toBeLessThan( 2 );
	} );
} );

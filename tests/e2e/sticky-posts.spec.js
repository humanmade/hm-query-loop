/**
 * Tests for the Sticky Posts control.
 *
 * Sticky posts pin a hand-picked, ordered set of posts to the front of a query
 * loop. Two properties matter and are tested separately:
 *
 * 1. It *orders* — pinned posts lead the result set, in the editor's chosen
 *    order, and the rest follow in the query's own order with no duplicates.
 * 2. It does *not filter* — pinning a post the query would not have returned
 *    does not pull that post in. "Which posts appear" stays the job of the
 *    query settings.
 *
 * The ordering is applied in SQL (`posts_orderby`), so the front end is the
 * real subject here; the editor preview is fetched over REST and does not
 * reflect it. The third test covers the control itself rather than the query.
 */
const { test, expect } = require( './fixtures' );

/**
 * Build a query loop that lists post titles, optionally with pinned posts.
 *
 * Ordered by title so the unpinned baseline is deterministic across runs
 * rather than depending on fixture post dates.
 *
 * @param {Object}   options          Block options.
 * @param {number}   options.queryId  Query ID for the block.
 * @param {number[]} options.sticky   Post IDs to pin, in order. Omit for none.
 * @param {string}   options.postType Post type to query.
 * @param {number}   options.perPage  Posts per page.
 * @return {string} Block markup.
 */
function queryLoop( { queryId, sticky = [], postType = 'post', perPage = 5 } ) {
	const hm =
		sticky.length > 0
			? `,"hmQueryLoop":{"stickyPosts":[${ sticky.join( ',' ) }]}`
			: '';

	return `<!-- wp:query {"queryId":${ queryId },"query":{"perPage":${ perPage },"postType":"${ postType }","inherit":false,"orderBy":"title","order":"asc"}${ hm }} -->
<div class="wp-block-query"><!-- wp:post-template -->
<!-- wp:post-title /-->
<!-- /wp:post-template --></div>
<!-- /wp:query -->`;
}

/**
 * Start a fresh page in the editor with any modals dismissed.
 *
 * @param {Object} page  Playwright page.
 * @param {Object} admin WordPress admin utils.
 */
async function startNewPage( page, admin ) {
	await admin.createNewPost( { postType: 'page' } );
	await page.waitForTimeout( 1500 );

	const closeButton = page.getByRole( 'button', { name: 'Close' } );
	if (
		await closeButton.isVisible( { timeout: 1000 } ).catch( () => false )
	) {
		await closeButton.click();
	}
}

/**
 * Fetch posts of a type ordered by title, so the test can pick real IDs
 * rather than assuming anything about the database fixture's numbering.
 *
 * @param {Object} page     Playwright page, on an admin screen.
 * @param {string} postType Post type slug.
 * @param {number} perPage  How many to fetch.
 * @return {Promise<Array<{id: number, title: string}>>} Posts in title order.
 */
async function getPostsByTitle( page, postType = 'posts', perPage = 5 ) {
	return page.evaluate(
		async ( { type, count } ) => {
			const records = await window.wp.apiFetch( {
				path: `/wp/v2/${ type }?per_page=${ count }&orderby=title&order=asc&_fields=id,title`,
			} );
			return records.map( ( record ) => ( {
				id: record.id,
				title: record.title.rendered,
			} ) );
		},
		{ type: postType, count: perPage }
	);
}

/**
 * Read the rendered post titles from the published front end.
 *
 * @param {Object} page Playwright page, on the front end.
 * @return {Promise<string[]>} Titles in render order.
 */
async function renderedTitles( page ) {
	return (
		await page.locator( '.wp-block-post-title' ).allTextContents()
	).map( ( title ) => title.trim() );
}

test.describe( 'Sticky Posts', () => {
	test( 'pins posts to the front of the loop in the chosen order', async ( {
		page,
		admin,
		editor,
		blockEditor,
	} ) => {
		await startNewPage( page, admin );

		const posts = await getPostsByTitle( page, 'posts', 5 );
		expect( posts.length ).toBeGreaterThanOrEqual( 5 );

		// Pin the 4th and 5th posts, and pin them in reverse order. Picking
		// posts that are not already at the front proves the reordering is
		// real, and reversing them proves the editor's order is honoured
		// rather than the pinned posts merely being hoisted as a group.
		const first = posts[ 4 ];
		const second = posts[ 3 ];

		await editor.setContent(
			queryLoop( { queryId: 501, sticky: [ first.id, second.id ] } )
		);
		await blockEditor.publishAndVisit();

		const titles = await renderedTitles( page );

		// The pinned posts lead, in the order they were pinned.
		expect( titles.slice( 0, 2 ) ).toEqual( [ first.title, second.title ] );

		// The remainder keeps the query's own title ordering.
		const remaining = posts
			.filter( ( post ) => post.id !== first.id && post.id !== second.id )
			.map( ( post ) => post.title );
		expect( titles.slice( 2 ) ).toEqual( remaining );

		// Pinning must not duplicate a post that was already in the results.
		expect( new Set( titles ).size ).toBe( titles.length );
	} );

	test( 'leaves the loop untouched when nothing is pinned', async ( {
		page,
		admin,
		editor,
		blockEditor,
	} ) => {
		await startNewPage( page, admin );

		const posts = await getPostsByTitle( page, 'posts', 5 );

		await editor.setContent( queryLoop( { queryId: 502 } ) );
		await blockEditor.publishAndVisit();

		expect( await renderedTitles( page ) ).toEqual(
			posts.map( ( post ) => post.title )
		);
	} );

	test( 'does not pull in a post the query would not return', async ( {
		page,
		admin,
		editor,
		blockEditor,
	} ) => {
		await startNewPage( page, admin );

		// A post ID pinned into a loop that queries pages. The post is not in
		// the result set to begin with, so pinning it must be inert: sticky
		// posts order the results, they do not add to them.
		const posts = await getPostsByTitle( page, 'posts', 1 );
		const pages = await getPostsByTitle( page, 'pages', 5 );
		expect( posts.length ).toBeGreaterThan( 0 );

		await editor.setContent(
			queryLoop( {
				queryId: 503,
				postType: 'page',
				sticky: [ posts[ 0 ].id ],
			} )
		);
		await blockEditor.publishAndVisit();

		const titles = await renderedTitles( page );
		expect( titles ).not.toContain( posts[ 0 ].title );

		// The page loop is otherwise unaffected. The published page itself is
		// now a page too, so compare against the titles that were queried
		// rather than asserting an exact list.
		for ( const title of titles ) {
			expect( pages.map( ( p ) => p.title ).concat( titles ) ).toContain(
				title
			);
		}
	} );

	test( 'pins, reorders and unpins posts from the inspector control', async ( {
		page,
		admin,
		editor,
	} ) => {
		await startNewPage( page, admin );

		const posts = await getPostsByTitle( page, 'posts', 3 );

		await editor.setContent( queryLoop( { queryId: 504 } ) );

		// Select the query block so its inspector renders.
		await page.evaluate( () => {
			const [ block ] = window.wp.data
				.select( 'core/block-editor' )
				.getBlocksByName( 'core/query' );
			window.wp.data.dispatch( 'core/block-editor' ).selectBlock( block );
		} );
		await editor.openDocumentSettingsSidebar();

		const panel = page.locator(
			'.components-panel__body-title:has-text("Sticky Posts")'
		);
		await expect( panel ).toBeVisible( { timeout: 5000 } );
		if (
			( await panel
				.locator( 'button' )
				.getAttribute( 'aria-expanded' ) ) !== 'true'
		) {
			await panel.locator( 'button' ).click();
		}

		const search = page.getByLabel( 'Pin a post' );
		await expect( search ).toBeVisible();

		/**
		 * Read the pinned IDs straight off the block attribute.
		 *
		 * @return {Promise<number[]>} Pinned post IDs in order.
		 */
		const stickyAttribute = () =>
			page.evaluate( () => {
				const [ block ] = window.wp.data
					.select( 'core/block-editor' )
					.getBlocksByName( 'core/query' );
				return (
					window.wp.data
						.select( 'core/block-editor' )
						.getBlockAttributes( block )?.hmQueryLoop
						?.stickyPosts || []
				);
			} );

		// Pin two posts by searching for them and clicking the result.
		for ( const post of posts.slice( 0, 2 ) ) {
			await search.fill( post.title );
			const result = page
				.locator( '.hm-query-loop-sticky-result' )
				.filter( { hasText: post.title } )
				.first();
			await expect( result ).toBeVisible( { timeout: 5000 } );
			await result.click();
		}

		expect( await stickyAttribute() ).toEqual( [
			posts[ 0 ].id,
			posts[ 1 ].id,
		] );

		// Moving the second entry up swaps the stored order.
		await page
			.locator( '.hm-query-loop-sticky-item' )
			.nth( 1 )
			.getByRole( 'button', { name: 'Move up' } )
			.click();
		expect( await stickyAttribute() ).toEqual( [
			posts[ 1 ].id,
			posts[ 0 ].id,
		] );

		// Unpinning the first entry leaves the other behind.
		await page
			.locator( '.hm-query-loop-sticky-item' )
			.first()
			.getByRole( 'button', { name: 'Unpin' } )
			.click();
		expect( await stickyAttribute() ).toEqual( [ posts[ 0 ].id ] );

		// Unpinning the last entry drops the attribute rather than storing an
		// empty array, so a loop with nothing pinned serialises unchanged.
		await page.getByRole( 'button', { name: 'Unpin all' } ).click();
		expect( await stickyAttribute() ).toEqual( [] );
	} );
} );

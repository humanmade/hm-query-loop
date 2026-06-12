/* eslint-disable no-console */
/**
 * Test the Curated Posts inspector control.
 *
 * Exercises the post search/picker that writes to core `query.include` and
 * verifies it overrides both the default query order and a registered
 * `hmPreset` at render time.
 */
const { test, expect } = require( './fixtures' );

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Insert a fresh core/query block (with a post template child) configured for
 * curated post selection, then select it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object}                          query Optional overrides for the
 *                                                `query` attribute.
 * @return {Promise<string>} The clientId of the inserted query block.
 */
async function insertCuratedQueryBlock( page, query = {} ) {
	return page.evaluate( ( queryAttrs ) => {
		const { dispatch } = window.wp.data;
		const { createBlock } = window.wp.blocks;
		const postTemplate = createBlock( 'core/post-template', {}, [
			createBlock( 'core/post-title', { isLink: false } ),
		] );
		const queryBlock = createBlock(
			'core/query',
			{
				queryId: 1,
				query: {
					perPage: 10,
					postType: 'post',
					inherit: false,
					...queryAttrs,
				},
				namespace: 'hm/curated-test',
			},
			[ postTemplate ]
		);
		dispatch( 'core/block-editor' ).insertBlock( queryBlock );
		dispatch( 'core/block-editor' ).selectBlock( queryBlock.clientId );
		return queryBlock.clientId;
	}, query );
}

/**
 * Read the live `query` attribute from a Query Loop block.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          clientId Query block clientId.
 * @return {Promise<Object>} The current `query` attribute.
 */
async function readQuery( page, clientId ) {
	return page.evaluate( ( id ) => {
		return window.wp.data.select( 'core/block-editor' ).getBlock( id )
			?.attributes?.query;
	}, clientId );
}

/**
 * Fetch a handful of seeded post IDs we can curate against.
 *
 * @param {import('@playwright/test').Page} page
 * @return {Promise<Array<{id: number, title: string}>>} Seeded posts in date order.
 */
async function getSeededPosts( page ) {
	return page.evaluate( async () => {
		const data = await window.wp.apiFetch( {
			path: '/wp/v2/posts?per_page=5&_fields=id,title&orderby=date&order=asc',
		} );
		return data.map( ( p ) => ( { id: p.id, title: p.title.rendered } ) );
	} );
}

test.describe( 'Curated Posts', () => {
	test.beforeEach( async ( { admin } ) => {
		await admin.createNewPost( { title: 'Curated posts spec' } );
	} );

	test( 'panel is registered on the Query Loop block', async ( {
		page,
		blockEditor,
	} ) => {
		await insertCuratedQueryBlock( page );
		await blockEditor.openSettingsSidebar();

		const panel = page.locator(
			'.components-panel__body-title:has-text("Curated Posts")'
		);
		await expect( panel ).toBeVisible( { timeout: 5000 } );

		await blockEditor.queryBlock.openCuratedPanel();
		await expect( page.locator( '.hm-query-loop-curated' ) ).toBeVisible();
		await expect(
			page.locator( 'label:has-text("Add a post")' )
		).toBeVisible();
	} );

	test( 'pre-filled include resolves IDs to titles', async ( {
		page,
		blockEditor,
	} ) => {
		const posts = await getSeededPosts( page );
		expect( posts.length ).toBeGreaterThanOrEqual( 3 );
		const picks = posts.slice( 0, 3 );

		await insertCuratedQueryBlock( page, {
			include: picks.map( ( p ) => p.id ),
			orderBy: 'include',
		} );

		await blockEditor.openSettingsSidebar();
		await blockEditor.queryBlock.openCuratedPanel();

		for ( const post of picks ) {
			await expect(
				page
					.locator( '.hm-query-loop-curated-item__title' )
					.filter( { hasText: post.title } )
			).toBeVisible( { timeout: 5000 } );
		}
	} );

	test( 'search adds a post and updates query.include + orderBy', async ( {
		page,
		blockEditor,
	} ) => {
		const posts = await getSeededPosts( page );
		const target = posts[ 0 ];

		const clientId = await insertCuratedQueryBlock( page );
		await blockEditor.openSettingsSidebar();
		await blockEditor.queryBlock.openCuratedPanel();

		// Search by first word of the seeded title.
		const term = target.title.split( ' ' )[ 0 ];
		await page
			.locator( '.hm-query-loop-curated input[type="text"]' )
			.fill( term );

		const result = page
			.locator( '.hm-query-loop-curated-result' )
			.filter( { hasText: target.title } );
		await expect( result ).toBeVisible( {
			timeout: SEARCH_DEBOUNCE_MS + 2000,
		} );
		await result.click();

		await expect(
			page
				.locator( '.hm-query-loop-curated-item__title' )
				.filter( { hasText: target.title } )
		).toBeVisible();

		const queryAttr = await readQuery( page, clientId );
		expect( queryAttr.include ).toEqual( [ target.id ] );
		expect( queryAttr.orderBy ).toBe( 'include' );
	} );

	test( 'reorder buttons update the include array order', async ( {
		page,
		blockEditor,
	} ) => {
		const posts = await getSeededPosts( page );
		const picks = posts.slice( 0, 3 );

		const clientId = await insertCuratedQueryBlock( page, {
			include: picks.map( ( p ) => p.id ),
			orderBy: 'include',
		} );

		await blockEditor.openSettingsSidebar();
		await blockEditor.queryBlock.openCuratedPanel();

		// Move the last item up one position.
		const items = page.locator( '.hm-query-loop-curated-item' );
		await expect( items ).toHaveCount( 3 );
		await items.nth( 2 ).getByRole( 'button', { name: 'Move up' } ).click();

		const queryAttr = await readQuery( page, clientId );
		expect( queryAttr.include ).toEqual( [
			picks[ 0 ].id,
			picks[ 2 ].id,
			picks[ 1 ].id,
		] );
	} );

	test( 'clear curated list removes include and orderBy', async ( {
		page,
		blockEditor,
	} ) => {
		const posts = await getSeededPosts( page );
		const picks = posts.slice( 0, 2 );

		const clientId = await insertCuratedQueryBlock( page, {
			include: picks.map( ( p ) => p.id ),
			orderBy: 'include',
		} );

		await blockEditor.openSettingsSidebar();
		await blockEditor.queryBlock.openCuratedPanel();

		await page.locator( '.hm-query-loop-curated-clear' ).click();

		const queryAttr = await readQuery( page, clientId );
		expect( queryAttr ).not.toHaveProperty( 'include' );
		expect( queryAttr ).not.toHaveProperty( 'orderBy' );
	} );

	test( 'front-end renders posts in curated order', async ( {
		page,
		blockEditor,
	} ) => {
		const posts = await getSeededPosts( page );
		// Pick three posts and arrange them in a non-default order.
		const ordered = [ posts[ 2 ], posts[ 0 ], posts[ 1 ] ];

		await insertCuratedQueryBlock( page, {
			perPage: 3,
			include: ordered.map( ( p ) => p.id ),
			orderBy: 'include',
		} );

		await blockEditor.publishAndVisit();

		const renderedTitles = await page
			.locator( '.wp-block-post-template .wp-block-post-title' )
			.allTextContents();

		// Compare without HTML entities — post titles round-trip cleanly here.
		const trimmed = renderedTitles.map( ( t ) => t.trim() );
		expect( trimmed.slice( 0, 3 ) ).toEqual(
			ordered.map( ( p ) => p.title )
		);
	} );

	test( 'curated list overrides a selected preset', async ( {
		page,
		blockEditor,
	} ) => {
		const posts = await getSeededPosts( page );
		// Pick three posts in a sequence that disagrees with alphabetical
		// order — that way, if the preset wins, the assertion fails.
		const sorted = [ ...posts ].sort( ( a, b ) =>
			a.title.localeCompare( b.title )
		);
		const alphabetical = sorted.slice( 0, 3 );
		const curated = [
			alphabetical[ 2 ],
			alphabetical[ 0 ],
			alphabetical[ 1 ],
		];

		// Sanity: the two orderings really do differ.
		expect( curated.map( ( p ) => p.id ) ).not.toEqual(
			alphabetical.map( ( p ) => p.id )
		);

		await insertCuratedQueryBlock( page, {
			perPage: 3,
			hmPreset: 'alphabetical_title',
			include: curated.map( ( p ) => p.id ),
			orderBy: 'include',
		} );

		await blockEditor.publishAndVisit();

		const renderedTitles = await page
			.locator( '.wp-block-post-template .wp-block-post-title' )
			.allTextContents();

		const trimmed = renderedTitles.map( ( t ) => t.trim() ).slice( 0, 3 );

		expect( trimmed ).toEqual( curated.map( ( p ) => p.title ) );
		expect( trimmed ).not.toEqual( alphabetical.map( ( p ) => p.title ) );
	} );
} );

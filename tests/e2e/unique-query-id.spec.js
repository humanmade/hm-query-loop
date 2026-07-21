/* eslint-disable no-console */
/**
 * Test that duplicated Query Loop blocks receive unique queryId attributes.
 *
 * WordPress core does not deduplicate queryId when blocks are duplicated.
 * This test verifies that our plugin ensures each query loop has a unique
 * queryId in both the editor and on the front end.
 */
const { test, expect } = require( './fixtures' );

test.describe( 'Unique Query IDs', () => {
	test( 'should assign unique queryId to duplicated query loop blocks in the editor', async ( {
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

		const canvas = page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame();

		// Add a title
		await canvas.getByRole( 'textbox', { name: 'Add title' } ).click();
		await canvas
			.getByRole( 'textbox', { name: 'Add title' } )
			.fill( 'Test unique query IDs' );

		// Insert a Query Loop block
		await canvas
			.getByRole( 'button', { name: 'Add default block' } )
			.click();
		await canvas
			.getByRole( 'document', {
				name: 'Empty block; start writing or',
			} )
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

		// Ensure settings sidebar is open before setting custom query
		await editor.openDocumentSettingsSidebar();
		await page.waitForTimeout( 500 );
		await blockEditor.queryBlock.setAsCustom();
		await page.waitForTimeout( 500 );

		// Select the query loop block
		await blockEditor.selectBlock.byName( 'core/query', 0 );

		// Duplicate the query loop block via the block toolbar Options menu
		await page
			.getByRole( 'toolbar', { name: 'Block tools' } )
			.getByLabel( 'Options' )
			.click();
		await page.getByRole( 'menuitem', { name: /^Duplicate / } ).click();
		await page.waitForTimeout( 1000 );

		// Duplicate again to have 3 total query loops
		await page
			.getByRole( 'toolbar', { name: 'Block tools' } )
			.getByLabel( 'Options' )
			.click();
		await page.getByRole( 'menuitem', { name: /^Duplicate / } ).click();
		await page.waitForTimeout( 1000 );

		// Get all queryId values from all query loop blocks in the editor
		const queryIds = await page.evaluate( () => {
			const blocks = window.wp.data
				.select( 'core/block-editor' )
				.getBlocksByName( 'core/query' );
			return blocks.map( ( clientId ) => {
				const block = window.wp.data
					.select( 'core/block-editor' )
					.getBlock( clientId );
				return block.attributes.queryId;
			} );
		} );

		// Verify we have 3 query loops
		expect( queryIds ).toHaveLength( 3 );

		// Verify all queryIds are defined
		for ( const id of queryIds ) {
			expect( id ).toBeDefined();
			expect( typeof id ).toBe( 'number' );
		}

		// Verify all queryIds are unique
		const uniqueIds = [ ...new Set( queryIds ) ];
		expect( uniqueIds ).toHaveLength( 3 );
	} );

	test( 'should not mark post as dirty when editor reloads with already-unique queryIds', async ( {
		page,
		admin,
	} ) => {
		// Create a new page with a Query Loop block
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

		const canvas = page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame();

		await canvas.getByRole( 'textbox', { name: 'Add title' } ).click();
		await canvas
			.getByRole( 'textbox', { name: 'Add title' } )
			.fill( 'Test no dirty on load' );

		await canvas
			.getByRole( 'button', { name: 'Add default block' } )
			.click();
		await canvas
			.getByRole( 'document', {
				name: 'Empty block; start writing or',
			} )
			.fill( '/query' );
		await page
			.getByRole( 'option', { name: 'Query Loop' } )
			.first()
			.click();
		await page.waitForTimeout( 1000 );

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

		// Give the HOC time to assign a queryId
		await page.waitForTimeout( 1000 );

		const initialQueryId = await page.evaluate( () => {
			const blocks = window.wp.data
				.select( 'core/block-editor' )
				.getBlocksByName( 'core/query' );
			const block = window.wp.data
				.select( 'core/block-editor' )
				.getBlock( blocks[ 0 ] );
			return block.attributes.queryId;
		} );

		expect( typeof initialQueryId ).toBe( 'number' );

		// Publish the page
		await page
			.getByRole( 'button', { name: 'Publish', exact: true } )
			.click();
		await page
			.getByLabel( 'Editor publish' )
			.getByRole( 'button', { name: 'Publish', exact: true } )
			.click();
		await page.waitForTimeout( 1500 );

		const postId = await page.evaluate( () => {
			return window.wp.data.select( 'core/editor' ).getCurrentPostId();
		} );

		// Reopen the editor — this is the scenario where the false dirty
		// warning appeared before the fix: the HOC was rewriting the
		// queryId on every load, marking the post as changed immediately.
		await admin.visitAdminPage( `post.php?post=${ postId }&action=edit` );
		await page.waitForSelector( 'iframe[name="editor-canvas"]', {
			timeout: 15000,
		} );
		// Wait for Gutenberg to fully initialise and for all useEffect
		// callbacks (including our withUniqueQueryId HOC) to run.
		await page.waitForTimeout( 2000 );

		const reloadedQueryId = await page.evaluate( () => {
			const blocks = window.wp.data
				.select( 'core/block-editor' )
				.getBlocksByName( 'core/query' );
			const block = window.wp.data
				.select( 'core/block-editor' )
				.getBlock( blocks[ 0 ] );
			return block.attributes.queryId;
		} );

		// The queryId must not have changed — stable ids prevent rewriting.
		expect( reloadedQueryId ).toBe( initialQueryId );

		// The editor must not be dirty; any attribute rewrite on load would
		// have triggered the "unsaved changes / Leave site?" warning.
		const isDirty = await page.evaluate( () => {
			return window.wp.data.select( 'core/editor' ).isEditedPostDirty();
		} );

		expect( isDirty ).toBe( false );
	} );

	test( 'should have unique queryId in saved content and exclude posts correctly on front end', async ( {
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

		const canvas = page
			.locator( 'iframe[name="editor-canvas"]' )
			.contentFrame();

		// Add a title
		await canvas.getByRole( 'textbox', { name: 'Add title' } ).click();
		await canvas
			.getByRole( 'textbox', { name: 'Add title' } )
			.fill( 'Test unique query IDs frontend' );

		// Insert a Query Loop block
		await canvas
			.getByRole( 'button', { name: 'Add default block' } )
			.click();
		await canvas
			.getByRole( 'document', {
				name: 'Empty block; start writing or',
			} )
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

		// Ensure settings sidebar is open before setting custom query
		await editor.openDocumentSettingsSidebar();
		await page.waitForTimeout( 500 );
		await blockEditor.queryBlock.setAsCustom();

		// Select the query loop block and enable exclude displayed
		await blockEditor.selectBlock.byName( 'core/query', 0 );
		await page.waitForTimeout( 500 );
		await blockEditor.queryBlock.openSettingsPanel();
		await blockEditor.queryBlock.excludeDisplayed();

		// Duplicate the query loop block
		await page
			.getByRole( 'toolbar', { name: 'Block tools' } )
			.getByLabel( 'Options' )
			.click();
		await page.getByRole( 'menuitem', { name: /^Duplicate / } ).click();
		await page.waitForTimeout( 1000 );

		// Verify the queryIds are unique in the serialized content before publishing
		const queryIds = await page.evaluate( () => {
			const blocks = window.wp.data
				.select( 'core/block-editor' )
				.getBlocksByName( 'core/query' );
			return blocks.map( ( clientId ) => {
				const block = window.wp.data
					.select( 'core/block-editor' )
					.getBlock( clientId );
				return block.attributes.queryId;
			} );
		} );

		expect( queryIds ).toHaveLength( 2 );
		const uniqueIds = [ ...new Set( queryIds ) ];
		expect( uniqueIds ).toHaveLength( 2 );

		// Publish and visit
		await blockEditor.publishAndVisit();

		// Get post titles from each query block on the front end
		const allPostTitles = await page
			.locator( '.wp-block-post-template .wp-block-post-title' )
			.allTextContents();

		// Both query loops should have posts (each shows 10 by default)
		expect( allPostTitles.length ).toBe( 20 );

		// With exclude displayed enabled on both and unique queryIds,
		// the second loop should exclude posts from the first.
		// All 20 titles should be unique.
		const uniqueTitles = [ ...new Set( allPostTitles ) ];
		expect( uniqueTitles ).toHaveLength( 20 );
	} );

	test( 'should assign finite, unique queryIds in the site editor', async ( {
		page,
		editor,
		blockEditor,
	} ) => {
		// The site editor's "post ID" is the template's string id
		// (`theme//slug`), not a number. Generating ids from it without
		// coercing to a number yields NaN, and because `NaN !== NaN` and
		// `[ NaN ].includes( NaN )` is true, that previously rewrote the
		// attribute on every render and hung the editor in the dedupe loop.
		await blockEditor.visitSiteEditor( 'index' );

		const templateId = await page.evaluate( () =>
			window.wp.data.select( 'core/editor' ).getCurrentPostId()
		);

		// Guard the premise of this test: if core ever starts handing the site
		// editor a numeric id, this test would silently stop covering the bug.
		expect( typeof templateId ).toBe( 'string' );

		// Two query blocks sharing a queryId. The first keeps its id; the
		// second is a duplicate, so it takes the id-generation path.
		await editor.setContent(
			`<!-- wp:query {"queryId":10,"query":{"perPage":3,"postType":"post","inherit":false}} -->
<div class="wp-block-query"><!-- wp:post-template -->
<!-- wp:post-title /-->
<!-- /wp:post-template --></div>
<!-- /wp:query -->

<!-- wp:query {"queryId":10,"query":{"perPage":3,"postType":"post","inherit":false}} -->
<div class="wp-block-query"><!-- wp:post-template -->
<!-- wp:post-title /-->
<!-- /wp:post-template --></div>
<!-- /wp:query -->`
		);

		// Let the HOC settle. A regression hangs the editor here, so the
		// evaluate below times out rather than returning a wrong value.
		await page.waitForTimeout( 2000 );

		const queryIds = await page.evaluate( () => {
			const { select } = window.wp.data;
			return select( 'core/block-editor' )
				.getBlocksByName( 'core/query' )
				.map(
					( clientId ) =>
						select( 'core/block-editor' ).getBlockAttributes(
							clientId
						).queryId
				);
		} );

		expect( queryIds ).toHaveLength( 2 );

		// The regression assertion: NaN is a number but not a finite one, so
		// `typeof` alone would not have caught it.
		for ( const queryId of queryIds ) {
			expect( Number.isFinite( queryId ) ).toBe( true );
		}

		expect( [ ...new Set( queryIds ) ] ).toHaveLength( 2 );

		// Ids must also be stable once assigned — an id that keeps changing
		// marks the template dirty on every render.
		await page.waitForTimeout( 1000 );

		const settledQueryIds = await page.evaluate( () => {
			const { select } = window.wp.data;
			return select( 'core/block-editor' )
				.getBlocksByName( 'core/query' )
				.map(
					( clientId ) =>
						select( 'core/block-editor' ).getBlockAttributes(
							clientId
						).queryId
				);
		} );

		expect( settledQueryIds ).toEqual( queryIds );
	} );
} );

/**
 * Test the ElasticPress integration toggle.
 *
 * The test environment forces hm_query_loop_elasticpress_available to true
 * via a mu-plugin, so no real ElasticPress install is required.
 */
const { test, expect } = require( './fixtures' );

test.describe( 'ElasticPress Toggle', () => {
	test( 'should show the Use ElasticSearch toggle in the panel', async ( {
		admin,
		page,
		blockEditor,
	} ) => {
		await blockEditor.visitSiteEditor( 'index', 'twentytwentyfive' );
		await blockEditor.selectBlock.byName( 'core/query' );
		await blockEditor.openSettingsSidebar();
		await blockEditor.expandPanel( 'Extra Query Loop Settings' );

		const toggle = page.locator( 'label:has-text("Use ElasticSearch")' );
		await expect( toggle ).toBeVisible( { timeout: 5000 } );
	} );

	test( 'should toggle the Use ElasticSearch setting on and off', async ( {
		admin,
		page,
		blockEditor,
	} ) => {
		await blockEditor.visitSiteEditor( 'index', 'twentytwentyfive' );
		await blockEditor.selectBlock.byName( 'core/query' );
		await blockEditor.openSettingsSidebar();
		await blockEditor.expandPanel( 'Extra Query Loop Settings' );

		const checkbox = page
			.locator( 'label:has-text("Use ElasticSearch")' )
			.locator( '..' )
			.locator( 'input[type="checkbox"]' );

		await expect( checkbox ).not.toBeChecked();
		await checkbox.click();
		await expect( checkbox ).toBeChecked();
		await checkbox.click();
		await expect( checkbox ).not.toBeChecked();
	} );
} );

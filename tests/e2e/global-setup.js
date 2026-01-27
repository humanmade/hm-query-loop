/* eslint-disable no-console */
const { chromium } = require( '@playwright/test' );
const { resetDatabase } = require( './fixtures' );

/**
 * Global setup to log in to WordPress and save the authentication state.
 */
module.exports = async () => {
	resetDatabase();

	const baseURL = process.env.WP_BASE_URL || 'http://localhost:8889';
	const username = process.env.WP_USERNAME || 'admin';
	const password = process.env.WP_PASSWORD || 'password';

	console.log( `Logging in to WordPress at ${ baseURL }...` );

	const browser = await chromium.launch();
	const page = await browser.newPage( { baseURL } );

	// Go to WordPress login page
	await page.goto( `${ baseURL }/wp-login.php` );

	// Fill in login form
	await page.fill( '#user_login', username );
	await page.fill( '#user_pass', password );
	await page.click( '#wp-submit' );

	// Wait for either admin dashboard or admin bar (more flexible)
	try {
		await Promise.race( [
			page.waitForURL( '**/wp-admin/', { timeout: 15000 } ),
			page.waitForSelector( '#wpadminbar', { timeout: 15000 } ),
		] );
	} catch ( error ) {
		console.error( 'Failed to log in to WordPress' );
		await browser.close();
		throw error;
	}

	// Set user preferences for the editor to avoid unwanted modals.
	await page.evaluate( () =>
		localStorage.setItem(
			'WP_PREFERENCES_USER_1',
			'{"core":{"isComplementaryAreaVisible":true,"enableChoosePatternModal":false},"core/edit-post":{"welcomeGuide":false,"fullscreenMode":false}}'
		)
	);

	// Save the authentication state
	await page.context().storageState( { path: '.auth/wordpress.json' } );

	await browser.close();

	console.log( 'WordPress authentication state saved successfully.' );
};

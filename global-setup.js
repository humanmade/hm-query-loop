/* eslint-disable no-console */
const { runCLI } = require( '@wp-playground/cli' );
const { chromium } = require( '@playwright/test' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const crypto = require( 'node:crypto' );

/**
 * Deterministic port from cwd hash so each git worktree gets its own
 * Playground instance. Override with WP_PLAYGROUND_PORT (e.g., in CI).
 * Range: 9400–9499.
 */
function resolvePort() {
	if ( process.env.WP_PLAYGROUND_PORT ) {
		return Number( process.env.WP_PLAYGROUND_PORT );
	}
	const hash = crypto
		.createHash( 'sha1' )
		.update( process.cwd() )
		.digest();
	return 9400 + ( hash.readUInt16BE( 0 ) % 100 );
}

module.exports = async () => {
	if ( process.env.WP_BASE_URL ) return;

	const blueprintPath = process.env.WP_BLUEPRINT_PATH
		? path.resolve( process.env.WP_BLUEPRINT_PATH )
		: path.resolve( process.cwd(), 'blueprint.json' );
	const blueprint = JSON.parse( fs.readFileSync( blueprintPath, 'utf8' ) );
	const port = resolvePort();

	console.log( `Starting WordPress Playground on port ${ port }...` );

	const cli = await runCLI( {
		command: 'server',
		port,
		php: process.env.WP_PLAYGROUND_PHP || undefined,
		wp: process.env.WP_PLAYGROUND_WP || undefined,
		mount: [
			{
				hostPath: process.cwd(),
				vfsPath: '/wordpress/wp-content/plugins/hm-query-loop',
			},
		],
		blueprint,
	} );

	// runCLI returns { playground, server } — derive URL from the server socket.
	const addr = cli.server.address();
	const serverUrl = `http://127.0.0.1:${ addr.port }`;

	process.env.WP_BASE_URL = serverUrl;
	globalThis.__wpPlayground = cli;

	console.log( `Playground running at ${ serverUrl }` );

	// Log in and save authentication state for all tests.
	const browser = await chromium.launch();
	const page = await browser.newPage( {
		baseURL: serverUrl,
		extraHTTPHeaders: { 'Accept-Encoding': 'identity' },
	} );

	await page.goto( `${ serverUrl }/wp-login.php` );
	await page.fill( '#user_login', 'admin' );
	await page.fill( '#user_pass', 'password' );
	await page.click( '#wp-submit' );

	try {
		await Promise.race( [
			page.waitForURL( '**/wp-admin/', { timeout: 15000 } ),
			page.waitForSelector( '#wpadminbar', { timeout: 15000 } ),
		] );
	} catch ( error ) {
		console.error( 'Failed to log in to WordPress Playground' );
		await browser.close();
		throw error;
	}

	// Disable editor modals globally.
	await page.evaluate( () =>
		// eslint-disable-next-line no-undef
		localStorage.setItem(
			'WP_PREFERENCES_USER_1',
			JSON.stringify( {
				core: {
					isComplementaryAreaVisible: true,
					enableChoosePatternModal: false,
				},
				'core/edit-post': {
					welcomeGuide: false,
					fullscreenMode: false,
				},
			} )
		)
	);

	fs.mkdirSync( '.auth', { recursive: true } );
	await page.context().storageState( { path: '.auth/wordpress.json' } );
	await browser.close();

	console.log( 'WordPress authentication state saved.' );
};

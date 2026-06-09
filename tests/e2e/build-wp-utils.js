#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Compiles @wordpress/e2e-test-utils-playwright TypeScript source to CommonJS.
 *
 * The package ships only TypeScript source. Node 22+ cannot load .ts files
 * from node_modules. This produces build/index.js so require() works.
 */

const path = require( 'path' );
const fs = require( 'fs' );
const { execSync } = require( 'child_process' );

const pkgJsonPath = require.resolve(
	'@wordpress/e2e-test-utils-playwright/package.json'
);
const pkgDir = path.dirname( pkgJsonPath );
const buildIndex = path.join( pkgDir, 'build', 'index.js' );

if ( fs.existsSync( buildIndex ) ) {
	process.exit( 0 );
}

const tsConfig = {
	compilerOptions: {
		target: 'ES2020',
		module: 'CommonJS',
		moduleResolution: 'node',
		outDir: './build',
		rootDir: './src',
		allowJs: true, // also copies plain .js files from src/ to build/
		skipLibCheck: true,
		esModuleInterop: true,
		allowSyntheticDefaultImports: true,
		noEmitOnError: false,
		strict: false,
		declaration: false,
	},
	include: [ 'src/**/*' ],
};

const tsconfigPath = path.join( pkgDir, 'tsconfig.build.json' );
fs.writeFileSync( tsconfigPath, JSON.stringify( tsConfig, null, 2 ) );

const tscBin = path.join( process.cwd(), 'node_modules', '.bin', 'tsc' );

try {
	execSync( `"${ tscBin }" --project "${ tsconfigPath }"`, {
		stdio: 'pipe',
	} );
} catch {
	// noEmitOnError: false — JS is still emitted despite type errors.
} finally {
	try {
		fs.unlinkSync( tsconfigPath );
	} catch {}
}

if ( ! fs.existsSync( buildIndex ) ) {
	console.error(
		'ERROR: Failed to build @wordpress/e2e-test-utils-playwright'
	);
	process.exit( 1 );
}

// Patch the package exports so require('@wordpress/e2e-test-utils-playwright')
// resolves to the compiled build rather than the TypeScript source.
const pkgJson = JSON.parse( fs.readFileSync( pkgJsonPath, 'utf-8' ) );
pkgJson.exports[ '.' ].default = './build/index.js';
fs.writeFileSync( pkgJsonPath, JSON.stringify( pkgJson, null, '\t' ) + '\n' );

console.log( 'Built @wordpress/e2e-test-utils-playwright' );

<?php
/**
 * Test Query Presets for E2E testing.
 *
 * Registers sample query presets for testing the Query Presets feature.
 *
 * @package HM\QueryLoop\Tests
 */

namespace HM\QueryLoop\Tests;

/**
 * Register test query presets.
 */
add_action( 'init', function() {
	// Only register if the function exists (plugin is active).
	if ( ! function_exists( '\HM\QueryLoop\QueryPresets\register_query_preset' ) ) {
		return;
	}

	// Register a preset that orders posts alphabetically by title.
	\HM\QueryLoop\QueryPresets\register_query_preset(
		'alphabetical_title',
		'Alphabetical by Title',
		function( $query_vars, $context ) {
			$query_vars['orderby'] = 'title';
			$query_vars['order'] = 'ASC';
			return $query_vars;
		}
	);

	// Register a preset that orders posts by title descending.
	\HM\QueryLoop\QueryPresets\register_query_preset(
		'alphabetical_title_desc',
		'Alphabetical by Title (Z-A)',
		function( $query_vars, $context ) {
			$query_vars['orderby'] = 'title';
			$query_vars['order'] = 'DESC';
			return $query_vars;
		}
	);
}, 20 ); // Priority 20 to run after the plugin initializes.

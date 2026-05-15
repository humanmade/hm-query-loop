<?php
/**
 * Preload REST data for query loop blocks in the block editor.
 *
 * On post-editor load, parse the post content for non-inherited core/query
 * blocks, derive the exact REST URL that core/post-template's
 * getEntityRecords() call will produce, and append it to the preload paths
 * so apiFetch's preloading middleware can serve the response from cache
 * without an HTTP round-trip.
 *
 * @package HM\QueryLoop
 */

namespace HM\QueryLoop\PreloadPaths;

/**
 * Register the preload paths hook.
 */
function register() {
	add_filter(
		'block_editor_rest_api_preload_paths',
		__NAMESPACE__ . '\\add_query_loop_paths',
		10,
		2
	);
}

/**
 * Add REST preload paths for each non-inherited query loop in the post.
 *
 * @param array                    $paths   Existing preload paths.
 * @param \WP_Block_Editor_Context $context Block editor context.
 * @return array Modified paths.
 */
function add_query_loop_paths( array $paths, $context ) {
	if ( ! isset( $context->post ) || ! ( $context->post instanceof \WP_Post ) ) {
		return $paths;
	}

	$blocks = parse_blocks( $context->post->post_content );
	$query_blocks = find_query_blocks( $blocks );

	// Cap at 10 to avoid bloating the preload payload (Gutenberg issue #27370).
	$query_blocks = array_slice( $query_blocks, 0, 10 );

	foreach ( $query_blocks as $block ) {
		$path = build_rest_path( $block );
		if ( $path ) {
			$paths[] = $path;
		}
	}

	return $paths;
}

/**
 * Recursively find all non-inherited core/query blocks in a block tree.
 *
 * @param array $blocks Parsed blocks.
 * @return array Flat array of core/query block arrays.
 */
function find_query_blocks( array $blocks ) {
	$result = [];
	foreach ( $blocks as $block ) {
		if ( 'core/query' === $block['blockName'] ) {
			$inherit = $block['attrs']['query']['inherit'] ?? false;
			if ( ! $inherit ) {
				$result[] = $block;
			}
		}
		if ( ! empty( $block['innerBlocks'] ) ) {
			$result = array_merge( $result, find_query_blocks( $block['innerBlocks'] ) );
		}
	}
	return $result;
}

/**
 * Build a REST API path for a query loop block.
 *
 * The resulting URL mirrors what core/post-template's getEntityRecords()
 * produces so the apiFetch preloading middleware matches it. See:
 * packages/block-library/src/post-template/edit.js in Gutenberg.
 *
 * Limitations (intentional for v1):
 * - Skips loops with taxQuery (taxonomy rest_base mapping is complex).
 * - Skips loops with excludeDisplayed (depends on runtime render order).
 * - Skips array params (exclude, parents, format) to avoid PHP/JS
 *   query-string serialisation mismatches.
 *
 * @param array $block Parsed block array.
 * @return string|null REST path string or null if the block should not be preloaded.
 */
function build_rest_path( array $block ) {
	$query   = $block['attrs']['query'] ?? [];
	$hm_loop = $block['attrs']['hmQueryLoop'] ?? [];

	// Skip excludeDisplayed — query depends on previous loops' render output.
	if ( ! empty( $hm_loop['excludeDisplayed'] ) ) {
		return null;
	}

	// Skip taxQuery — requires resolving taxonomy rest_base per registered taxonomy.
	if ( ! empty( $query['taxQuery'] ) ) {
		return null;
	}

	// Resolve post type and REST base.
	$post_type     = sanitize_key( $query['postType'] ?? 'post' );
	$post_type_obj = get_post_type_object( $post_type );
	if ( ! $post_type_obj || empty( $post_type_obj->rest_base ) ) {
		return null;
	}
	$rest_base = $post_type_obj->rest_base;

	// core/post-template always passes offset (defaults to 0).
	$offset = max( 0, (int) ( $query['offset'] ?? 0 ) );

	// hmQueryLoop.perPage overrides query.perPage (used for inherited queries).
	// Only include per_page when explicitly set — matches the JS condition `perPage > 0`.
	$per_page = null;
	if ( ! empty( $hm_loop['perPage'] ) && (int) $hm_loop['perPage'] > 0 ) {
		$per_page = (int) $hm_loop['perPage'];
	} elseif ( ! empty( $query['perPage'] ) && (int) $query['perPage'] > 0 ) {
		$per_page = (int) $query['perPage'];
	}

	// Build params in the same shape as post-template/edit.js.
	$params = [
		'offset'  => $offset,
		'order'   => in_array( $query['order'] ?? '', [ 'asc', 'desc' ], true )
			? $query['order']
			: 'desc',
		'orderby' => sanitize_key( $query['orderBy'] ?? 'date' ),
	];

	if ( null !== $per_page ) {
		$params['per_page'] = $per_page;
	}

	if ( ! empty( $query['author'] ) && is_numeric( $query['author'] ) ) {
		$params['author'] = (int) $query['author'];
	}

	if ( ! empty( $query['search'] ) ) {
		$params['search'] = sanitize_text_field( $query['search'] );
	}

	// Sticky post handling mirrors the JS logic exactly.
	$sticky = $query['sticky'] ?? '';
	if ( in_array( $sticky, [ 'exclude', 'only' ], true ) ) {
		$params['sticky'] = $sticky === 'only' ? 'true' : 'false';
	} elseif ( 'ignore' === $sticky ) {
		$params['ignore_sticky'] = 'true';
	}

	return '/wp/v2/' . $rest_base . '?' . http_build_query( $params );
}

<?php
/**
 * Plugin Name: HM Query Loop
 * Plugin URI: https://humanmade.com
 * Description: Extends the Query Loop block with advanced controls for multiple query loops on a single page
 * Version: __VERSION__
 * Author: Human Made
 * Author URI: https://humanmade.com
 * License: GPL-2.0+
 * Text Domain: hm-query-loop
 */

namespace HM\QueryLoop;

use WP_Block;
use WP_Query;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'HM_QUERY_LOOP_VERSION', '__VERSION__' );
define( 'HM_QUERY_LOOP_PATH', plugin_dir_path( __FILE__ ) );
define( 'HM_QUERY_LOOP_URL', plugin_dir_url( __FILE__ ) );

// Load query presets functionality.
require_once HM_QUERY_LOOP_PATH . 'inc/query-presets.php';

/**
 * Initialize the plugin.
 */
function init() {
	// Enqueue block editor assets.
	add_action( 'enqueue_block_editor_assets', __NAMESPACE__ . '\\enqueue_block_editor_assets', 9 );

	// Deduplicate query IDs for query loop blocks.
	add_filter( 'pre_render_block', __NAMESPACE__ . '\\deduplicate_query_ids', 10, 2 );

	// Register block filters.
	add_filter( 'pre_render_block', __NAMESPACE__ . '\\pre_render_block', 11, 3 );
	add_filter( 'render_block', __NAMESPACE__ . '\\render_block', 11, 2 );

	// Hook query_loop_block_query_vars to modify the query.
	add_filter( 'query_loop_block_query_vars',  __NAMESPACE__ . '\\filter_query_loop_block_query_vars', 11, 2 );

	// Hook into the_posts to track displayed posts and limit post-template posts.
	add_filter( 'the_posts', __NAMESPACE__ . '\\track_displayed_posts', 10, 2 );

	// Add contexts to query and post-template block.
	add_filter( 'block_type_metadata', __NAMESPACE__ . '\\filter_block_metadata' );

	// Initialize query presets functionality.
	QueryPresets\init();
}

add_action( 'init', __NAMESPACE__ . '\\init', 9 );

/**
 * Whether ElasticPress is available for use with query loops.
 *
 * Filterable so sites can force the integration on or off independently of
 * whether ElasticPress is installed and activated.
 *
 * @return bool
 */
function is_elasticpress_available(): bool {
	$available = class_exists( '\ElasticPress\Features' );
	return (bool) apply_filters( 'hm_query_loop_elasticpress_available', $available );
}

/**
 * Enqueue block editor assets.
 */
function enqueue_block_editor_assets() {
	$asset_file = include HM_QUERY_LOOP_PATH . 'build/index.asset.php';

	wp_enqueue_script(
		'hm-query-loop-editor',
		HM_QUERY_LOOP_URL . 'build/index.js',
		$asset_file['dependencies'],
		$asset_file['version'],
		[
			'in_footer' => false,
		]
	);

	// Pass settings to JavaScript.
	wp_localize_script(
		'hm-query-loop-editor',
		'hmQueryLoopSettings',
		[
			'postsPerPage'          => (int) get_option( 'posts_per_page', 10 ),
			'elasticPressAvailable' => is_elasticpress_available(),
		]
	);

	wp_enqueue_style(
		'hm-query-loop-editor',
		HM_QUERY_LOOP_URL . 'build/index.css',
		[],
		$asset_file['version']
	);
}

/**
 * Filter block metadata to add context.
 *
 * @param array $metadata Block metadata.
 * @return array Modified metadata.
 */
function filter_block_metadata( $metadata ) {
	if ( $metadata['name'] === 'core/query' ) {
		$metadata['providesContext'] = array_merge(
			$metadata['providesContext'] ?? [],
			[ 'hmQueryLoop' => 'hmQueryLoop' ]
		);
	}

	if ( $metadata['name'] === 'core/post-template' ) {
		$metadata['usesContext'] = array_merge(
			$metadata['usesContext'] ?? [],
			[ 'hmQueryLoop' ]
		);
	}

	return $metadata;
}

/**
 * Track displayed post IDs across query loops.
 *
 * @var array
 */
$displayed_post_ids = [];

/**
 * Track used post IDs within each query loop block.
 * Keyed by block ID to scope posts to each query loop.
 *
 * @var array
 */
$query_loop_used_posts = [];

/**
 * Track post template per page settings within each query loop.
 * Keyed by query ID, stores array of per page values in order.
 *
 * @var array
 */
$query_loop_post_template_per_pages = [];

/**
 * Get displayed post IDs.
 *
 * @return array
 */
function get_displayed_post_ids() {
	global $displayed_post_ids;
	return $displayed_post_ids ?? [];
}

/**
 * Add displayed post IDs.
 *
 * @param array $post_ids Post IDs to add.
 */
function add_displayed_post_ids( $post_ids ) {
	global $displayed_post_ids;
	if ( ! is_array( $displayed_post_ids ) ) {
		$displayed_post_ids = [];
	}
	$displayed_post_ids = array_unique( array_merge( $displayed_post_ids, $post_ids ) );
}

/**
 * Get used post IDs for a specific query loop.
 *
 * @param string $query_id Query loop block ID.
 * @return array
 */
function get_query_loop_used_posts( $query_id ) {
	global $query_loop_used_posts;
	return $query_loop_used_posts[ $query_id ] ?? [];
}

/**
 * Add used post IDs for a specific query loop.
 *
 * @param string $query_id Query loop block ID.
 * @param array  $post_ids Post IDs to add.
 */
function add_query_loop_used_posts( $query_id, $post_ids ) {
	global $query_loop_used_posts;
	if ( ! isset( $query_loop_used_posts[ $query_id ] ) ) {
		$query_loop_used_posts[ $query_id ] = [];
	}
	$query_loop_used_posts[ $query_id ] = array_unique( array_merge( $query_loop_used_posts[ $query_id ], $post_ids ) );
}

/**
 * Ensure each core/query block has a unique queryId during server-side rendering.
 *
 * Uses a static instance counter combined with the current post ID to generate
 * unique query IDs. Dynamically adds a render_block_context filter to set the
 * queryId for child core/post-template blocks, and removes it when the query
 * block finishes rendering.
 *
 * @param string|null $pre_render   The pre-rendered content. Default null.
 * @param array       $parsed_block The block being rendered.
 * @return string|null
 */
function deduplicate_query_ids( $pre_render, $parsed_block ) {
	static $instance_count = 0;
	static $used_query_ids = [];

	if ( 'core/query' !== $parsed_block['blockName'] ) {
		return $pre_render;
	}

	$original_query_id = $parsed_block['attrs']['queryId'] ?? null;

	// Only override the queryId if it has already been used by a previous
	// query block. This preserves the original value when possible,
	// improving interoperability with other plugins.
	if ( $original_query_id !== null && ! in_array( $original_query_id, $used_query_ids, true ) ) {
		$used_query_ids[] = $original_query_id;
		return $pre_render;
	}

	$instance_count++;
	$post_id = get_the_ID() ?: 0;
	$unique_query_id = $post_id * 1000 + $instance_count;

	// Ensure the generated ID doesn't collide with any already-used ID.
	while ( in_array( $unique_query_id, $used_query_ids, true ) ) {
		$instance_count++;
		$unique_query_id = $post_id * 1000 + $instance_count;
	}

	$used_query_ids[] = $unique_query_id;

	// Track nesting depth so the render_block cleanup only fires
	// for this specific query block, not nested ones.
	$depth = 0;

	// Dynamically add a render_block_context filter to override queryId
	// for any core/post-template blocks inside this query.
	$context_filter = function ( $context, $inner_parsed_block ) use ( $unique_query_id ) {
		if ( 'core/post-template' === $inner_parsed_block['blockName'] ) {
			$context['queryId'] = $unique_query_id;
		}
		return $context;
	};

	// Track nested core/query blocks to avoid premature cleanup.
	$pre_depth_filter = function ( $pre, $block ) use ( &$depth ) {
		if ( 'core/query' === $block['blockName'] ) {
			$depth++;
		}
		return $pre;
	};

	// Remove the context filter when this query block finishes rendering.
	$render_filter = function ( $block_content, $block ) use ( $context_filter, &$render_filter, &$pre_depth_filter, &$depth ) {
		if ( 'core/query' !== $block['blockName'] ) {
			return $block_content;
		}

		if ( $depth > 0 ) {
			$depth--;
			return $block_content;
		}

		remove_filter( 'render_block_context', $context_filter, 10 );
		remove_filter( 'render_block', $render_filter, 9 );
		remove_filter( 'pre_render_block', $pre_depth_filter, 9 );

		return $block_content;
	};

	add_filter( 'render_block_context', $context_filter, 10, 2 );
	add_filter( 'pre_render_block', $pre_depth_filter, 9, 2 );
	add_filter( 'render_block', $render_filter, 9, 2 );

	return $pre_render;
}

/**
 * Pre-render block callback.
 *
 * @param string|null $pre_render   The pre-rendered content. Default null.
 * @param array       $parsed_block The block being rendered.
 * @return string|null Null to allow normal rendering.
 */
function pre_render_block( $pre_render, $parsed_block ) {
	global $original_paged;

	// Only process core/query blocks.
	if ( 'core/query' !== $parsed_block['blockName'] ) {
		return $pre_render;
	}

	$attrs = $parsed_block['attrs'] ?? [];

	if ( ! $attrs['query']['inherit'] ?? false ) {
		return $pre_render;
	}

	// We need to restore this for loops that resume normal pagination.
	if ( empty( $original_paged ) ) {
		$original_paged = (int) get_query_var( 'paged', 1 );
	}

	// Run the main query again to trigger the pre_get_posts hook if we're inheriting.
	global $wp_query;

	// On the blog posts page, $wp_query->query contains page-related args
	// (e.g., ['pagename' => 'blog']) instead of posts query args.
	// WordPress Core converts this to a posts query, but that transformation
	// is lost when we re-run the query. Use explicit post query args instead.
	if ( is_home() && ! is_front_page() ) {
		$query_args = [
			'post_type' => 'post',
			'paged'     => $original_paged,
		];
	} else {
		$query_args = $wp_query->query;
	}

	$query_args = modify_query_from_block_attrs( $query_args, $attrs );

	$wp_query->query( $query_args );

	// ElasticPress and similar plugins use posts_pre_query to return cached results,
	// ignoring our posts_per_page setting. Manually slice the posts array to enforce the limit.
	$settings = $attrs['hmQueryLoop'] ?? [];
	if ( isset( $settings['perPage'] ) && is_numeric( $settings['perPage'] ) && $settings['perPage'] > 0 ) {
		$per_page = (int) $settings['perPage'];
		if ( count( $wp_query->posts ) > $per_page ) {
			$wp_query->posts      = array_slice( $wp_query->posts, 0, $per_page );
			$wp_query->post_count = count( $wp_query->posts );
		}
	}

	// The global query can happen again in some cases, so avoid double collecting,
	// especially with AQL or similar plugins to this one.
	$wp_query->set( 'hm_query_loop_collect_ids', false );

	return $pre_render;
}

/**
 * Render block callback.
 *
 * @param string $block_content Block content.
 * @param array  $block Block data.
 * @return string Block content.
 */
function render_block( $block_content, $block ) {
	if ( 'core/query' !== $block['blockName'] ) {
		return $block_content;
	}

	global $original_paged;

	// Check if block should be hidden on pagination.
	$settings = $block['attrs']['hmQueryLoop'] ?? [];
	$hide_on_paged = $settings['hideOnPaged'] ?? false;

	if ( $hide_on_paged && $original_paged > 1 ) {
		return '';
	}

	return $block_content;
}

/**
 * Filter queries for loops that do not inherit from the main query.
 *
 * @param array $query Query args for the query loop.
 * @param WP_Block $block Current block instance.
 * @return array The modified query vars.
 */
function filter_query_loop_block_query_vars( $query, WP_Block $block ) {
	if ( $block->name === 'core/post-template' ) {
		global $query_loop_post_template_per_pages;

		// Merge hmQueryLoop context with post template block attribute.
		$attrs = $block->parsed_block['attrs'];
		$attrs['hmQueryLoop'] = wp_parse_args(
			$block->parsed_block['attrs']['hmQueryLoop'] ?? [],
			$block->context['hmQueryLoop'] ?? [],
		);
		$query_id = $block->context['queryId'] ?? 0;

		// Initialize tracking array for this query loop if not exists
		if ( ! isset( $query_loop_post_template_per_pages[ $query_id ] ) ) {
			$query_loop_post_template_per_pages[ $query_id ] = [];
		}

		// Get the query loop's total posts per page
		$query_per_page = $query['posts_per_page'] ?? get_option( 'posts_per_page', 10 );

		// Calculate total posts used by preceding post templates
		$used_posts = array_sum( $query_loop_post_template_per_pages[ $query_id ] );

		// Get this post template's per page setting
		$post_template_per_page = $attrs['hmQueryLoop']['perPage'] ?? null;

		// If no explicit perPage is set, calculate remaining posts
		if ( empty( $post_template_per_page ) ) {
			$remaining_posts = max( 1, $query_per_page - $used_posts );
			$post_template_per_page = $remaining_posts;

			// Set it in attrs so it gets tracked
			$attrs['hmQueryLoop']['perPage'] = $remaining_posts;
		}

		// Track this post template's per page value
		$query_loop_post_template_per_pages[ $query_id ][] = $post_template_per_page;

		$attrs['hmQueryLoop']['excludeDisplayedForCurrentLoop'] = $query_id;
		return modify_query_from_block_attrs( $query, $attrs );
	}
	return modify_query_from_block_attrs( $query, $block->context );
}

/**
 * Exclude posts from a query by handling both post__not_in and post__in parameters.
 *
 * When post__in is set, WordPress ignores post__not_in. This function ensures
 * exclusions work correctly by filtering post__in directly when present.
 *
 * @param array $query        The query args array.
 * @param array $excluded_ids Post IDs to exclude.
 * @return array Modified query args.
 */
function exclude_posts_from_query( $query, $excluded_ids ) {
	if ( empty( $excluded_ids ) ) {
		return $query;
	}

	// If post__in is set, filter out excluded IDs from it.
	// This is necessary because post__in takes precedence over post__not_in in WordPress.
	if ( ! empty( $query['post__in'] ) && is_array( $query['post__in'] ) ) {
		$query['post__in'] = array_values( array_diff( $query['post__in'], $excluded_ids ) );
	}

	// Also set post__not_in for queries without post__in.
	$existing_exclusions = $query['post__not_in'] ?? [];
	if ( ! is_array( $existing_exclusions ) ) {
		$existing_exclusions = [];
	}
	$query['post__not_in'] = array_unique( array_merge( $existing_exclusions, $excluded_ids ) );

	return $query;
}

/**
 * Modify query using pre_get_posts based on block attributes.
 * This is hooked/unhooked dynamically around Query Loop block rendering.
 *
 * @param array $query The query args array.
 * @param array $attrs The block attributes/context.
 * @return array Modified query args.
 */
function modify_query_from_block_attrs( $query = [], $attrs = [] ) {
	global $original_paged;

	// Get the hmQueryLoop settings object.
	$settings = $attrs['hmQueryLoop'] ?? [];

	// Start collecting post IDs.
	$query['hm_query_loop_collect_ids'] = true;

	// If hiding on paginated URLs force the page to page 1.
	if ( isset( $settings['hideOnPaged'] ) && $settings['hideOnPaged'] ) {
		$query['paged'] = 1;
	} else {
		$query['paged'] = $original_paged;
	}

	// Apply custom posts per page if set and is a valid number.
	if ( isset( $settings['perPage'] ) && is_numeric( $settings['perPage'] ) && $settings['perPage'] > 0 ) {
		$query['posts_per_page'] = (int) $settings['perPage'];
	}

	// Route query through ElasticPress if enabled and available.
	if ( ! empty( $settings['useElasticPress'] ) && is_elasticpress_available() ) {
		$query['ep_integrate'] = true;
	}

	// Exclude already displayed posts if enabled.
	if ( isset( $settings['excludeDisplayed'] ) && $settings['excludeDisplayed'] ) {
		$displayed_ids = get_displayed_post_ids();
		if ( ! empty( $displayed_ids ) ) {
			$query = exclude_posts_from_query( $query, $displayed_ids );
		}
	}

	// Exclude already displayed posts for this loop if enabled.
	if ( isset( $settings['excludeDisplayedForCurrentLoop'] ) ) {
		$query['query_id'] = $settings['excludeDisplayedForCurrentLoop'];
		$displayed_ids = get_query_loop_used_posts( $settings['excludeDisplayedForCurrentLoop'] );
		if ( ! empty( $displayed_ids ) ) {
			$query = exclude_posts_from_query( $query, $displayed_ids );
		}
	}

	return $query;
}

/**
 * Track displayed posts using the_posts filter.
 *
 * @param array     $posts Array of post objects.
 * @param \WP_Query $query The WP_Query instance.
 * @return array Array of post objects.
 */
function track_displayed_posts( $posts, $query ) {
	if ( ! $query->get( 'hm_query_loop_collect_ids' ) ) {
		return $posts;
	}

	// Track posts from query loops (either approach) or the main query.
	if ( ! empty( $posts ) ) {
		$post_ids = wp_list_pluck( $posts, 'ID' );
		add_displayed_post_ids( $post_ids );
		add_query_loop_used_posts( $query->get( 'query_id', -1 ), $post_ids );
	}

	return $posts;
}

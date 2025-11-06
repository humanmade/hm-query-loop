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

/**
 * Initialize the plugin.
 */
function init() {
	// Enqueue block editor assets.
	add_action( 'enqueue_block_editor_assets', __NAMESPACE__ . '\\enqueue_block_editor_assets' );

	// Register block filters.
	add_filter( 'pre_render_block', __NAMESPACE__ . '\\pre_render_block', 10, 3 );
	add_filter( 'render_block', __NAMESPACE__ . '\\render_block', 10, 2 );

	// Hook pre_get_posts to modify the query.
	add_filter( 'query_loop_block_query_vars',  __NAMESPACE__ . '\\filter_query_loop_block_query_vars', 10, 2 );

	// Hook into the_posts to track displayed posts.
	add_filter( 'the_posts', __NAMESPACE__ . '\\track_displayed_posts', 10, 2 );

	// Add context to post-template block.
	add_filter( 'block_type_metadata', __NAMESPACE__ . '\\filter_post_template_metadata' );
}

add_action( 'init', __NAMESPACE__ . '\\init' );

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
		true
	);

	wp_enqueue_style(
		'hm-query-loop-editor',
		HM_QUERY_LOOP_URL . 'build/index.css',
		[],
		$asset_file['version']
	);
}

/**
 * Filter post-template block metadata to add usesContext.
 *
 * @param array $metadata Block metadata.
 * @return array Modified metadata.
 */
function filter_post_template_metadata( $metadata ) {
	if ( $metadata['name'] !== 'core/post-template' ) {
		return $metadata;
	}

	$metadata['usesContext'] = array_merge(
		$metadata['usesContext'] ?? [],
		[ 'hm-query-loop/settings' ]
	);

	return $metadata;
}

/**
 * Track displayed post IDs across query loops.
 *
 * @var array
 */
$displayed_post_ids = [];

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
	$query_args = modify_query_from_block_attrs( $wp_query->query, $attrs );
	$wp_query->query( $query_args );

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
	// Only process core/query blocks.
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
	return modify_query_from_block_attrs( $query, $block->context );
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

	// Exclude already displayed posts if enabled.
	if ( isset( $settings['excludeDisplayed'] ) && $settings['excludeDisplayed'] ) {
		$displayed_ids = get_displayed_post_ids();
		if ( ! empty( $displayed_ids ) ) {
			$existing_exclusions = $query['post__not_in'] ?? [];
			if ( ! is_array( $existing_exclusions ) ) {
				$existing_exclusions = [];
			}
			$query['post__not_in'] = array_unique( array_merge( $existing_exclusions, $displayed_ids ) );
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
	}

	return $posts;
}

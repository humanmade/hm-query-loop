<?php
/**
 * Query Presets functionality for the Query Loop block.
 *
 * Provides a PHP API for registering custom query configurations that can be
 * selected in the block editor and applied on both frontend and REST API requests.
 *
 * @package HM\QueryLoop\QueryPresets
 */

namespace HM\QueryLoop\QueryPresets;

/**
 * Registered query presets.
 *
 * @var array<string, array{label: string, callback: callable}>
 */
$registered_presets = [];

/**
 * Register a query preset.
 *
 * @param string   $name     Unique identifier for the preset (e.g., 'related_articles').
 * @param string   $label    Human-readable label for the preset (e.g., 'Related Articles').
 * @param callable $callback Function that receives query args and block context, returns modified query args.
 *                           Signature: function(array $query_vars, array $context): array
 *                           Context includes: 'post_id' (current post), 'block' (block attributes), 'is_rest' (bool).
 * @return bool True on success, false if preset already exists.
 */
function register_query_preset( string $name, string $label, callable $callback ): bool {
	global $registered_presets;

	if ( isset( $registered_presets[ $name ] ) ) {
		_doing_it_wrong(
			__FUNCTION__,
			sprintf(
				/* translators: %s: preset name */
				esc_html__( 'Query preset "%s" is already registered.', 'hm-query-loop' ),
				$name
			),
			'1.0.0'
		);
		return false;
	}

	$registered_presets[ $name ] = [
		'label'    => $label,
		'callback' => $callback,
	];

	return true;
}

/**
 * Unregister a query preset.
 *
 * @param string $name Preset identifier to unregister.
 * @return bool True if preset was unregistered, false if it didn't exist.
 */
function unregister_query_preset( string $name ): bool {
	global $registered_presets;

	if ( ! isset( $registered_presets[ $name ] ) ) {
		return false;
	}

	unset( $registered_presets[ $name ] );
	return true;
}

/**
 * Get all registered query presets.
 *
 * @return array<string, array{label: string, callback: callable}> Registered presets.
 */
function get_registered_presets(): array {
	global $registered_presets;
	return $registered_presets ?? [];
}

/**
 * Get a specific query preset by name.
 *
 * @param string $name Preset identifier.
 * @return array{label: string, callback: callable}|null Preset data or null if not found.
 */
function get_query_preset( string $name ): ?array {
	global $registered_presets;
	return $registered_presets[ $name ] ?? null;
}

/**
 * Apply a query preset to query arguments.
 *
 * @param string $name       Preset identifier.
 * @param array  $query_vars Current query arguments.
 * @param array  $context    Additional context (post_id, block, is_rest).
 * @return array Modified query arguments.
 */
function apply_query_preset( string $name, array $query_vars, array $context = [] ): array {
	$preset = get_query_preset( $name );

	if ( ! $preset || ! is_callable( $preset['callback'] ) ) {
		return $query_vars;
	}

	return call_user_func( $preset['callback'], $query_vars, $context );
}

/**
 * Initialize query presets functionality.
 *
 * @return void
 */
function init(): void {
	// Hook into REST API initialization to add filters for all post types.
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_rest_hooks' );

	// Frontend query filtering for the Query Loop block.
	add_filter( 'query_loop_block_query_vars', __NAMESPACE__ . '\\filter_query_loop_block_query_vars', 15, 3 );

	// Pass registered presets to JavaScript.
	add_action( 'enqueue_block_editor_assets', __NAMESPACE__ . '\\enqueue_presets_data' );
}

/**
 * Register REST API hooks for all public post types.
 *
 * This dynamically adds filters to all REST post controllers, avoiding the need
 * to manually add hooks for each post type.
 *
 * @return void
 */
function register_rest_hooks(): void {
	$post_types = get_post_types( [ 'show_in_rest' => true ], 'objects' );

	foreach ( $post_types as $post_type ) {
		// Allow the hmPreset parameter on collection endpoints.
		add_filter(
			"rest_{$post_type->name}_collection_params",
			__NAMESPACE__ . '\\add_preset_collection_param'
		);

		// Modify queries based on the preset parameter.
		add_filter(
			"rest_{$post_type->name}_query",
			__NAMESPACE__ . '\\modify_rest_query_for_preset',
			10,
			2
		);
	}
}

/**
 * Add the hmPreset parameter to REST collection endpoints.
 *
 * @param array $params Existing collection parameters.
 * @return array Modified parameters.
 */
function add_preset_collection_param( array $params ): array {
	$params['hmPreset'] = [
		'description'       => __( 'HM Query Loop preset identifier.', 'hm-query-loop' ),
		'type'              => 'string',
		'sanitize_callback' => 'sanitize_key',
	];

	return $params;
}

/**
 * Modify REST queries based on the preset parameter.
 *
 * @param array            $args    Query arguments.
 * @param \WP_REST_Request $request REST request object.
 * @return array Modified query arguments.
 */
function modify_rest_query_for_preset( array $args, \WP_REST_Request $request ): array {
	$preset_name = $request->get_param( 'hmPreset' );

	if ( empty( $preset_name ) ) {
		return $args;
	}

	$context = [
		'post_id' => $request->get_param( 'post_id' ) ?? get_the_ID() ?? 0,
		'is_rest' => true,
		'block'   => [
			'perPage' => $request->get_param( 'per_page' ),
		],
	];

	return apply_query_preset( $preset_name, $args, $context );
}

/**
 * Filter query vars for the Query Loop block on the frontend.
 *
 * @param array     $query_vars Existing query variables.
 * @param \WP_Block $block      Block instance.
 * @param int       $page       Current page number.
 * @return array Modified query variables.
 */
function filter_query_loop_block_query_vars( array $query_vars, \WP_Block $block, int $page ): array {
	$context = $block->context ?? [];
	$query_attr = $context['query'] ?? [];
	$preset_name = $query_attr['hmPreset'] ?? '';

	if ( empty( $preset_name ) ) {
		return $query_vars;
	}

	$context = [
		'post_id' => get_the_ID() ?? 0,
		'is_rest' => false,
		'block'   => [
			'perPage' => $query_vars['posts_per_page'] ?? get_option( 'posts_per_page', 10 ),
			'page'    => $page,
		],
	];

	return apply_query_preset( $preset_name, $query_vars, $context );
}

/**
 * Enqueue presets data for the block editor.
 *
 * @return void
 */
function enqueue_presets_data(): void {
	$presets = get_registered_presets();

	// Format presets for JavaScript (only send name and label, not callbacks).
	$presets_for_js = [];
	foreach ( $presets as $name => $preset ) {
		$presets_for_js[] = [
			'name'  => $name,
			'label' => $preset['label'],
		];
	}

	wp_localize_script(
		'hm-query-loop-editor',
		'hmQueryLoopPresets',
		[
			'presets' => $presets_for_js,
		]
	);
}

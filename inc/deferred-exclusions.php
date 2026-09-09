<?php
/**
 * Deferred (PHP-side) post exclusions for Query Loop blocks.
 *
 * Excluding posts with `post__not_in` bakes the excluded IDs into the generated
 * SQL, and `WP_Query` derives its `post-queries` object cache key from that SQL.
 * A loop that excludes the post currently being viewed therefore produces a
 * different cache key on every URL it renders on, even though every one of those
 * queries is asking the same question ("the latest N posts").
 *
 * This module asks that question once. It requests a few more posts than the
 * loop needs and leaves the rest of the query untouched, so the SQL — and the
 * cache key — is identical everywhere, then drops the unwanted posts from the
 * result set in PHP. Core writes the query result to the object cache before the
 * `the_posts` filter runs, so what lands in the cache is the shareable superset,
 * not the per-URL slice.
 *
 * The same mechanism carries the loop's identity. Anything this plugin puts in
 * the query vars ends up in the cache key, so the plugin's own bookkeeping is
 * passed in a single query var that is removed again on `pre_get_posts`, before
 * the key is generated, and bound to the `WP_Query` instance instead.
 *
 * @package HM\QueryLoop
 */

namespace HM\QueryLoop\DeferredExclusions;

use WP_Block;
use WP_Query;

/**
 * Query var used to hand this plugin's per-loop state to a WP_Query.
 *
 * Stripped again on `pre_get_posts`, so it never reaches the cache key.
 */
const QUERY_VAR = 'hm_query_loop_context';

/**
 * Per-loop state bound to a live WP_Query, keyed by `spl_object_id()`.
 *
 * @var array<int, array>
 */
$bound_contexts = [];

/**
 * Register hooks.
 *
 * @return void
 */
function init(): void {
	// Run after every other `query_loop_block_query_vars` filter — this plugin's
	// own (priority 11) and query presets (15) — so the fetch size is planned
	// against the final query vars.
	add_filter( 'query_loop_block_query_vars', __NAMESPACE__ . '\\plan_query', 999, 3 );

	// Move the state off the query vars before the cache key is generated.
	add_action( 'pre_get_posts', __NAMESPACE__ . '\\bind_context', 0 );

	// Apply the plan before HM\QueryLoop\track_displayed_posts() (priority 10)
	// records the IDs, so only posts that are really rendered get tracked.
	add_filter( 'the_posts', __NAMESPACE__ . '\\filter_posts', 9, 2 );
}

/**
 * Whether exclusions should be deferred to PHP rather than pushed into SQL.
 *
 * @return bool
 */
function is_enabled(): bool {
	/**
	 * Filters whether Query Loop exclusions are applied in PHP after querying.
	 *
	 * Disabling this restores `post__not_in` based exclusion, at the cost of a
	 * separate object cache entry per set of excluded IDs.
	 *
	 * @param bool $enabled Whether to defer exclusions to PHP. Default true.
	 */
	return (bool) apply_filters( 'hm_query_loop_defer_exclusions', true );
}

/**
 * The largest number of posts a loop may fetch in order to defer an exclusion.
 *
 * Deferring trades a slightly wider result set for a reusable cache entry. Past
 * some size that trade stops paying off, and the query falls back to excluding
 * in SQL.
 *
 * @return int
 */
function get_max_fetch(): int {
	/**
	 * Filters the maximum number of posts fetched to satisfy a deferred exclusion.
	 *
	 * @param int $max_fetch Maximum posts to fetch. Default 100.
	 */
	return max( 1, (int) apply_filters( 'hm_query_loop_max_deferred_fetch', 100 ) );
}

/**
 * Record post IDs for a Query Loop to exclude in PHP after querying.
 *
 * Use this from a `query_loop_block_query_vars` filter or a query preset instead
 * of adding to `post__not_in`, whenever the IDs vary from one URL to the next.
 *
 * @param array $query       Query vars for the loop.
 * @param array $exclude_ids Post IDs to exclude.
 * @return array Modified query vars.
 */
function add_exclusions( array $query, array $exclude_ids ): array {
	$exclude_ids = array_filter( array_map( 'intval', $exclude_ids ) );

	if ( empty( $exclude_ids ) ) {
		return $query;
	}

	$existing = $query[ QUERY_VAR ]['exclude'] ?? [];

	$query[ QUERY_VAR ]['exclude'] = array_values( array_unique( array_merge( $existing, $exclude_ids ) ) );

	return $query;
}

/**
 * Mark a set of query vars as belonging to a query loop, for post tracking.
 *
 * The loop's ID is kept out of the query vars proper because it is derived from
 * the post being viewed, so passing it to `WP_Query` would give every loop a
 * cache key of its own on every URL it renders on.
 *
 * @param array      $query    Query vars for the loop.
 * @param string|int $query_id The loop's `queryId`.
 * @return array Modified query vars.
 */
function track_loop( array $query, $query_id = -1 ): array {
	$query[ QUERY_VAR ]['query_id'] = $query_id;

	return $query;
}

/**
 * Render only part of a loop's result set, without narrowing the query.
 *
 * Used by the multiple post templates feature: each template reads the same
 * result set and takes a different window out of it, so they all issue the same
 * query and share one cache entry.
 *
 * @param array $query Query vars for the loop.
 * @param int   $start Posts to skip, relative to the loop's own page of results.
 * @param int   $size  Posts to render.
 * @return array Modified query vars.
 */
function set_window( array $query, int $start, int $size ): array {
	$query[ QUERY_VAR ]['window_start'] = max( 0, $start );
	$query[ QUERY_VAR ]['window_size']  = $size;

	return $query;
}

/**
 * Turn the recorded exclusions into a fetch plan, or fall back to SQL exclusion.
 *
 * @param array    $query Query vars for the loop.
 * @param WP_Block $block The `core/post-template` block being rendered.
 * @param int      $page  Current page of the loop.
 * @return array Modified query vars.
 */
function plan_query( $query, $block, $page = 1 ) {
	if ( ! is_array( $query ) ) {
		return $query;
	}

	$context = $query[ QUERY_VAR ] ?? [];
	$exclude = $context['exclude'] ?? [];
	unset( $context['exclude'] );

	// The block's own "exclude current post" setting. Core (after 6.9) applies
	// it by adding the post ID to `post__not_in`, which is a per-URL cache key
	// by construction; taking it over here keeps the query stable. On 6.9 and
	// earlier core ignores the attribute entirely, so this is what makes the
	// setting work at all.
	if ( $block instanceof WP_Block && ! empty( $block->context['query']['excludeCurrent'] ) ) {
		$current_post_id = get_the_ID();
		if ( $current_post_id ) {
			$exclude[] = (int) $current_post_id;
		}
	}

	/**
	 * Filters the post IDs a Query Loop should exclude in PHP after querying.
	 *
	 * @param int[]         $exclude Post IDs to exclude.
	 * @param array         $query   Query vars for the loop.
	 * @param WP_Block|null $block   The post template block being rendered.
	 * @param int           $page    Current page of the loop.
	 */
	$exclude = apply_filters(
		'hm_query_loop_deferred_exclusions',
		$exclude,
		$query,
		$block instanceof WP_Block ? $block : null,
		(int) $page
	);

	$exclude = array_values( array_unique( array_filter( array_map( 'intval', (array) $exclude ) ) ) );

	$plan = build_plan( $query, $exclude, max( 1, (int) $page ), $context );

	// Whatever the plan could not take on has to narrow the query after all.
	$in_sql = array_values( array_diff( $exclude, $plan['exclude'] ) );

	if ( ! empty( $in_sql ) ) {
		$query = \HM\QueryLoop\exclude_posts_from_query( $query, $in_sql );
	}

	if ( ! empty( $plan['exclude'] ) && ! empty( $query['post__not_in'] ) && is_array( $query['post__not_in'] ) ) {
		// These are handled after the query runs, so they must not narrow it.
		$query['post__not_in'] = array_values( array_diff( $query['post__not_in'], $plan['exclude'] ) );
	}

	if ( $plan['needed'] ) {
		$query['posts_per_page'] = $plan['fetch'];

		// Only introduce an `offset` where the query already had one, or where it
		// is actually needed: `offset` overrides `paged` in the LIMIT clause.
		if ( isset( $query['offset'] ) || $plan['fetch_offset'] > 0 ) {
			$query['offset'] = $plan['fetch_offset'];
		}

		$context['plan'] = $plan;
	} elseif ( $plan['window_size'] !== $plan['loop_per_page'] || $plan['window_start'] > 0 ) {
		// The window cannot be applied in PHP — see build_plan() — so narrow the
		// query to it instead, giving each post template a query of its own.
		$query['posts_per_page'] = $plan['window_size'];
		$query['offset']         = $plan['fetch_offset'] + $plan['window_start'];
	}

	unset( $context['window_start'], $context['window_size'] );

	if ( empty( $context ) ) {
		unset( $query[ QUERY_VAR ] );
	} else {
		$query[ QUERY_VAR ] = $context;
	}

	return $query;
}

/**
 * Whether the results of this query will still pass through `the_posts`.
 *
 * `WP_Query::get_posts()` returns early — before `posts_results` and
 * `the_posts` — when only post IDs were asked for, and skips those filters
 * entirely when filters are suppressed. Nothing can be done in PHP afterwards
 * for such a query.
 *
 * @param array $query Query vars for the loop.
 * @return bool
 */
function can_filter_results( array $query ): bool {
	if ( ! empty( $query['suppress_filters'] ) ) {
		return false;
	}

	return ! in_array( $query['fields'] ?? '', [ 'ids', 'id=>parent' ], true );
}

/**
 * Work out what to fetch so the loop can be assembled in PHP afterwards.
 *
 * Over-fetching by `count( $exclude )` guarantees a full page after filtering:
 * at most one fetched post can be dropped per excluded ID, so at least as many
 * survive as the loop asked for.
 *
 * @param array $query   Query vars for the loop.
 * @param int[] $exclude Post IDs to exclude.
 * @param int   $page    Current page of the loop.
 * @param array $context Recorded per-loop state.
 * @return array The plan.
 */
function build_plan( array $query, array $exclude, int $page, array $context ): array {
	$loop_per_page = isset( $query['posts_per_page'] )
		? (int) $query['posts_per_page']
		: (int) get_option( 'posts_per_page', 10 );

	$window_start = (int) ( $context['window_start'] ?? 0 );
	$window_size  = (int) ( $context['window_size'] ?? $loop_per_page );

	$plan = [
		'exclude'       => [],
		'loop_per_page' => $loop_per_page,
		'window_start'  => $window_start,
		'window_size'   => $window_size,
		'window_offset' => $window_start,
		'fetch_offset'  => (int) ( $query['offset'] ?? 0 ),
		'fetch'         => $loop_per_page,
		'needed'        => false,
	];

	// Without an explicit `posts_per_page` the loop pages through `paged` rather
	// than the `offset` core normally computes, and the arithmetic below no
	// longer describes what the query will return.
	if ( ! can_filter_results( $query ) || ! isset( $query['posts_per_page'] ) ) {
		return $plan;
	}

	// An unbounded loop already reads every matching post, so there is nothing
	// to over-fetch — filtering and windowing the result set is enough.
	if ( $loop_per_page < 1 ) {
		$plan['exclude'] = $exclude;
		$plan['needed']  = ! empty( $exclude ) || $window_start > 0 || $window_size !== $loop_per_page;

		return $plan;
	}

	if ( ! empty( $exclude ) && is_enabled() ) {
		// Core sets `offset` to the paging offset plus any offset configured on
		// the block. Recover the configured part, so that paging — which the
		// exclusions shift — can be redone in PHP.
		$base_offset = $plan['fetch_offset'] - ( $loop_per_page * ( $page - 1 ) );
		$fetch       = ( $loop_per_page * $page ) + count( $exclude );

		// A negative base offset means the offset was not built by core's
		// formula, and re-slicing would silently move the window. Past
		// get_max_fetch() the over-fetch costs more than the shared cache entry
		// is worth. Either way, leave these exclusions to SQL.
		if ( $base_offset >= 0 && $fetch <= get_max_fetch() ) {
			$plan['exclude']       = $exclude;
			$plan['fetch']         = $fetch;
			$plan['fetch_offset']  = $base_offset;
			$plan['window_offset'] = ( $loop_per_page * ( $page - 1 ) ) + $window_start;
			$plan['needed']        = true;

			return $plan;
		}
	}

	// No deferred exclusions: fetch the loop's own page, and window it. Post
	// templates that overrun the loop's page size need the extra posts.
	$plan['fetch']  = max( $loop_per_page, $window_start + $window_size );
	$plan['needed'] = $window_start > 0 || $window_size !== $plan['fetch'];

	return $plan;
}

/**
 * Move the per-loop state off the query vars and onto the WP_Query instance.
 *
 * `WP_Query::generate_cache_key()` hashes the query vars, so leaving the state
 * there would defeat the point of the exercise. `pre_get_posts` fires before the
 * key is generated.
 *
 * @param WP_Query $query The query being prepared.
 * @return void
 */
function bind_context( $query ): void {
	if ( ! $query instanceof WP_Query ) {
		return;
	}

	$context = $query->get( QUERY_VAR );

	if ( empty( $context ) || ! is_array( $context ) ) {
		return;
	}

	global $bound_contexts;

	$bound_contexts[ spl_object_id( $query ) ] = $context;

	unset( $query->query_vars[ QUERY_VAR ] );

	if ( is_array( $query->query ) ) {
		unset( $query->query[ QUERY_VAR ] );
	}
}

/**
 * Get the per-loop state bound to a query, if any.
 *
 * @param WP_Query $query The query instance.
 * @return array|null
 */
function get_context( WP_Query $query ): ?array {
	global $bound_contexts;

	return $bound_contexts[ spl_object_id( $query ) ] ?? null;
}

/**
 * Forget the state bound to a query once its results have been dealt with.
 *
 * @param WP_Query $query The query instance.
 * @return void
 */
function release_context( WP_Query $query ): void {
	global $bound_contexts;

	unset( $bound_contexts[ spl_object_id( $query ) ] );
}

/**
 * Drop excluded posts and re-apply paging in PHP.
 *
 * @param array    $posts Posts returned by the query.
 * @param WP_Query $query The query instance.
 * @return array Filtered posts.
 */
function filter_posts( $posts, $query ) {
	if ( ! $query instanceof WP_Query || ! is_array( $posts ) ) {
		return $posts;
	}

	$context = get_context( $query );
	$plan    = $context['plan'] ?? null;

	if ( null === $plan ) {
		return $posts;
	}

	$result = apply_plan( $posts, $plan );

	// `found_posts` and `max_num_pages` were derived from the unfiltered count.
	// Bring them down by however many posts the filtering removed, so pagination
	// does not offer a page with nothing left on it. Only the fetched window is
	// visible here, so this is a lower bound on the real overcount.
	//
	// This has to happen on every request rather than through the `found_posts`
	// filter: that filter only runs on a cache miss, and its result is stored in
	// the shared cache entry, which must stay unadjusted.
	if ( $query->found_posts > 0 && $result['removed'] > 0 ) {
		$query->found_posts = max( 0, (int) $query->found_posts - $result['removed'] );

		if ( $plan['loop_per_page'] > 0 ) {
			$query->max_num_pages = (int) ceil( $query->found_posts / $plan['loop_per_page'] );
		}
	}

	// Report the number of posts the loop asked for rather than the number
	// fetched to satisfy the plan; core/query-total reads this back.
	if ( $plan['loop_per_page'] > 0 ) {
		$query->query_vars['posts_per_page'] = $plan['loop_per_page'];
	}

	$query->post_count = count( $result['posts'] );

	return $result['posts'];
}

/**
 * Apply an exclusion plan to a list of posts.
 *
 * Kept free of WordPress state so the slicing rules can be reasoned about — and
 * tested — on their own.
 *
 * @param array $posts Posts (or post IDs) returned by the query.
 * @param array $plan  Plan as built by build_plan().
 * @return array{posts: array, removed: int} The posts to render, and how many were dropped.
 */
function apply_plan( array $posts, array $plan ): array {
	$lookup = array_flip( $plan['exclude'] );

	$kept = [];
	foreach ( $posts as $post ) {
		$id = is_object( $post ) ? (int) $post->ID : (int) $post;
		if ( ! isset( $lookup[ $id ] ) ) {
			$kept[] = $post;
		}
	}

	$removed = count( $posts ) - count( $kept );

	return [
		'posts'   => array_slice(
			$kept,
			$plan['window_offset'],
			$plan['window_size'] > 0 ? $plan['window_size'] : null
		),
		'removed' => $removed,
	];
}

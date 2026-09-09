<?php
/**
 * Sticky posts for the Query Loop block.
 *
 * Lets an editor pin a hand-picked, ordered set of posts to the front of a
 * query loop while the rest of the loop keeps its own ordering.
 *
 * This is deliberately an *ordering* feature, not a filter. Pinned posts are
 * moved to the front of the result set the query already produces; a post that
 * the query would not have returned — wrong post type, excluded by a taxonomy
 * filter, not published — is not pulled in by pinning it. That keeps the
 * block's own settings authoritative about *which* posts appear, and leaves
 * this concerned only with *what order* they appear in.
 *
 * The ordering is applied in SQL rather than by re-sorting results after the
 * fact, so it composes correctly with `posts_per_page` and pagination: pinned
 * posts lead the whole result set, not merely the page that happens to be
 * rendering.
 *
 * @package HM\QueryLoop\StickyPosts
 */

namespace HM\QueryLoop\StickyPosts;

use WP_Query;

/**
 * Query var carrying the pinned post IDs for a single WP_Query.
 *
 * Set from the block's `hmQueryLoop.stickyPosts` attribute in
 * `HM\QueryLoop\modify_query_from_block_attrs()`, and read back off the
 * WP_Query instance when its ORDER BY clause is assembled.
 */
const QUERY_VAR = 'hm_query_loop_sticky_posts';

/**
 * Connect namespace functions to hooks.
 */
function bootstrap(): void {
	add_filter( 'posts_orderby', __NAMESPACE__ . '\\apply_sticky_order', 10, 2 );
}

/**
 * Normalise a stored sticky list into usable post IDs.
 *
 * The value arrives from block attributes, so it is whatever was serialised
 * into the post content: expected to be an array of integers, but not
 * guaranteed to be. Everything that is not a positive integer is dropped, and
 * duplicates are collapsed, because both would produce a malformed or
 * ambiguous `FIELD()` list.
 *
 * @param mixed $value Raw `stickyPosts` value from block attributes.
 * @return int[] Post IDs, in the editor's chosen order.
 */
function normalize_ids( $value ): array {
	if ( ! is_array( $value ) ) {
		return [];
	}

	$ids = array_map( 'absint', $value );
	$ids = array_filter( $ids );

	return array_values( array_unique( $ids ) );
}

/**
 * Move pinned posts to the front of a query's ORDER BY clause.
 *
 * Two terms are prepended to whatever ordering the query already had:
 *
 *     FIELD( wp_posts.ID, 12,45 ) = 0 ASC   -- pinned posts before the rest
 *     FIELD( wp_posts.ID, 12,45 )     ASC   -- pinned posts in the chosen order
 *
 * `FIELD()` returns the 1-based position of the ID in the list, or `0` when it
 * is absent. The first term therefore sorts "not pinned" (1) after "pinned"
 * (0); the second orders the pinned group among itself. Unpinned posts all
 * score `0` on the second term, so their relative order is decided entirely by
 * the original clause, which is appended unchanged.
 *
 * Note that `FIELD()` is MySQL/MariaDB syntax.
 *
 * @param string   $orderby The ORDER BY clause, without the `ORDER BY` keyword.
 * @param WP_Query $query   The query being prepared.
 * @return string Filtered ORDER BY clause.
 */
function apply_sticky_order( $orderby, $query ) {
	if ( ! $query instanceof WP_Query ) {
		return $orderby;
	}

	$ids = normalize_ids( $query->get( QUERY_VAR ) );

	if ( empty( $ids ) ) {
		return $orderby;
	}

	global $wpdb;

	// Safe to interpolate: every value has been through absint() and the
	// list is built here rather than taken from the request.
	$field = sprintf(
		'FIELD( %s.ID, %s )',
		$wpdb->posts,
		implode( ',', $ids )
	);

	$sticky = sprintf( '%1$s = 0 ASC, %1$s ASC', $field );

	$orderby = is_string( $orderby ) ? trim( $orderby ) : '';

	return $orderby === '' ? $sticky : $sticky . ', ' . $orderby;
}

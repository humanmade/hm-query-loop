<?php
/**
 * Tests for the deferred exclusion planner.
 *
 * The planner decides what a Query Loop asks the database for, and what it does
 * with the answer. It touches no WordPress state beyond a couple of lookups, so
 * it can be exercised directly: this file stubs those out and runs the planner
 * against a fake result set.
 *
 * Usage: npm run test:php
 *
 * @package HM\QueryLoop
 */

namespace {

	/**
	 * The post ID get_the_ID() should report.
	 *
	 * @var int
	 */
	$current_post_id = 0;

	/**
	 * Minimal stand-ins for the WordPress pieces the planner touches.
	 */
	class WP_Block {
		public $name;
		public $context      = [];
		public $parsed_block = [ 'attrs' => [] ];

		public function __construct( $name, $context = [] ) {
			$this->name    = $name;
			$this->context = $context;
		}
	}

	class WP_Query {
		public $query_vars    = [];
		public $query         = [];
		public $post_count    = 0;
		public $found_posts   = 0;
		public $max_num_pages = 0;

		public function __construct( $args = [] ) {
			$this->query      = $args;
			$this->query_vars = $args;
		}

		public function get( $key, $default = '' ) {
			return $this->query_vars[ $key ] ?? $default;
		}
	}

	function apply_filters( $tag, $value, ...$args ) {
		return $value;
	}

	function add_filter( ...$args ) {}

	function add_action( ...$args ) {}

	function get_option( $name, $default = false ) {
		return $default;
	}

	function get_the_ID() {
		return $GLOBALS['current_post_id'];
	}
}

namespace HM\QueryLoop {

	/**
	 * Copy of the real function; it lives in the main plugin file, which cannot
	 * be loaded without WordPress.
	 *
	 * @param array $query        Query args.
	 * @param array $excluded_ids Post IDs to exclude.
	 * @return array
	 */
	function exclude_posts_from_query( $query, $excluded_ids ) {
		if ( ! empty( $query['post__in'] ) && is_array( $query['post__in'] ) ) {
			$query['post__in'] = array_values( array_diff( $query['post__in'], $excluded_ids ) );
		}

		$query['post__not_in'] = array_values(
			array_unique( array_merge( $query['post__not_in'] ?? [], $excluded_ids ) )
		);

		return $query;
	}
}

namespace HM\QueryLoop\Tests {

	use WP_Block;
	use WP_Query;

	use function HM\QueryLoop\DeferredExclusions\add_exclusions;
	use function HM\QueryLoop\DeferredExclusions\bind_context;
	use function HM\QueryLoop\DeferredExclusions\filter_posts;
	use function HM\QueryLoop\DeferredExclusions\get_context;
	use function HM\QueryLoop\DeferredExclusions\plan_query;
	use function HM\QueryLoop\DeferredExclusions\set_window;
	use function HM\QueryLoop\DeferredExclusions\track_loop;

	use const HM\QueryLoop\DeferredExclusions\QUERY_VAR;

	require_once dirname( __DIR__, 2 ) . '/inc/deferred-exclusions.php';

	$failures = 0;
	$checks   = 0;

	/**
	 * Assert that two values match.
	 *
	 * @param string $label    What is being checked.
	 * @param mixed  $actual   The value produced.
	 * @param mixed  $expected The value wanted.
	 * @return void
	 */
	function check( string $label, $actual, $expected ): void {
		global $failures, $checks;

		$checks++;

		if ( $actual === $expected ) {
			printf( "ok   %s\n", $label );
			return;
		}

		$failures++;
		printf(
			"FAIL %s\n       expected: %s\n       actual:   %s\n",
			$label,
			wp_json_encode_fallback( $expected ),
			wp_json_encode_fallback( $actual )
		);
	}

	/**
	 * Render a value for failure output.
	 *
	 * @param mixed $value Value to render.
	 * @return string
	 */
	function wp_json_encode_fallback( $value ): string {
		return (string) json_encode( $value );
	}

	/**
	 * Plan a loop's query, run it against a fake database, and apply the plan.
	 *
	 * @param array    $query    Query vars as core would have built them.
	 * @param WP_Block $block    The block being rendered.
	 * @param int      $page     Page of the loop.
	 * @param int[]    $universe Every post ID matching the query, in order.
	 * @return array{posts: int[], sql: array, query: WP_Query}
	 */
	function run_loop( array $query, WP_Block $block, int $page, array $universe ): array {
		$planned = plan_query( $query, $block, $page );

		$wp_query = new WP_Query( $planned );
		bind_context( $wp_query );

		// Stand in for the SQL: apply the exclusions, then the LIMIT clause.
		$rows = $universe;
		if ( ! empty( $planned['post__not_in'] ) ) {
			$rows = array_values( array_diff( $rows, $planned['post__not_in'] ) );
		}

		$offset   = (int) ( $planned['offset'] ?? 0 );
		$per_page = (int) ( $planned['posts_per_page'] ?? 10 );
		$results  = $per_page < 0
			? array_slice( $rows, $offset )
			: array_slice( $rows, $offset, $per_page );

		$wp_query->found_posts   = count( $rows );
		$wp_query->max_num_pages = $per_page > 0 ? (int) ceil( count( $rows ) / $per_page ) : 1;

		return [
			'posts' => filter_posts( $results, $wp_query ),
			'sql'   => [
				'posts_per_page' => $planned['posts_per_page'] ?? null,
				'offset'         => $planned['offset'] ?? null,
				'post__not_in'   => $planned['post__not_in'] ?? [],
			],
			'query' => $wp_query,
		];
	}

	$universe = range( 101, 130 );
	$template = new WP_Block( 'core/post-template' );

	// The headline case: the latest 5 posts, minus the post being viewed.
	$excludes_current          = new WP_Block( 'core/post-template', [ 'query' => [ 'excludeCurrent' => true ] ] );
	$GLOBALS['current_post_id'] = 103;

	$on_103 = run_loop(
		[
			'posts_per_page' => 5,
			'offset'         => 0,
			'post__not_in'   => [ 103 ],
		],
		$excludes_current,
		1,
		$universe
	);

	check( 'excludeCurrent: nothing excluded in SQL', $on_103['sql']['post__not_in'], [] );
	check( 'excludeCurrent: over-fetches by one', $on_103['sql']['posts_per_page'], 6 );
	check( 'excludeCurrent: renders 5, without the current post', $on_103['posts'], [ 101, 102, 104, 105, 106 ] );

	$GLOBALS['current_post_id'] = 107;

	$on_107 = run_loop(
		[
			'posts_per_page' => 5,
			'offset'         => 0,
			'post__not_in'   => [ 107 ],
		],
		$excludes_current,
		1,
		$universe
	);

	// This is the point of the exercise: one cached result set serves every URL.
	check( 'excludeCurrent: same query on a different URL', $on_107['sql'], $on_103['sql'] );
	check( 'excludeCurrent: different URL renders differently', $on_107['posts'], [ 101, 102, 103, 104, 105 ] );

	$GLOBALS['current_post_id'] = 0;

	// Excluding posts an earlier loop on the page already showed.
	$second_loop = run_loop(
		add_exclusions(
			[
				'posts_per_page' => 5,
				'offset'         => 0,
				'post__not_in'   => [],
			],
			[ 101, 102, 103 ]
		),
		$template,
		1,
		$universe
	);

	check( 'excludeDisplayed: fetches 5 + 3', $second_loop['sql']['posts_per_page'], 8 );
	check( 'excludeDisplayed: nothing excluded in SQL', $second_loop['sql']['post__not_in'], [] );
	check( 'excludeDisplayed: still a full page', $second_loop['posts'], [ 104, 105, 106, 107, 108 ] );
	check( 'excludeDisplayed: found_posts adjusted', $second_loop['query']->found_posts, 27 );

	// The same, on the loop's second page.
	$page_two = run_loop(
		add_exclusions(
			[
				'posts_per_page' => 5,
				'offset'         => 5,
				'post__not_in'   => [],
			],
			[ 101, 102, 103 ]
		),
		$template,
		2,
		$universe
	);

	check( 'page 2: reads from the start of the result set', $page_two['sql']['offset'], 0 );
	check( 'page 2: fetches 5 * 2 + 3', $page_two['sql']['posts_per_page'], 13 );
	check( 'page 2: carries on where page 1 stopped', $page_two['posts'], [ 109, 110, 111, 112, 113 ] );

	// Two post templates dividing one loop between them.
	$windows = [];
	foreach ( [ [ 0, 2 ], [ 2, 4 ] ] as $window ) {
		$windows[] = run_loop(
			set_window(
				[
					'posts_per_page' => 6,
					'offset'         => 0,
					'post__not_in'   => [],
				],
				$window[0],
				$window[1]
			),
			$template,
			1,
			$universe
		);
	}

	check( 'post templates: first window', $windows[0]['posts'], [ 101, 102 ] );
	check( 'post templates: second window', $windows[1]['posts'], [ 103, 104, 105, 106 ] );
	check( 'post templates: both issue one query', $windows[0]['sql'], $windows[1]['sql'] );
	check( 'post templates: which is the loop\'s own', $windows[0]['sql']['posts_per_page'], 6 );

	// Windows and exclusions together.
	$combined = [];
	foreach ( [ [ 0, 2 ], [ 2, 4 ] ] as $window ) {
		$query = add_exclusions(
			[
				'posts_per_page' => 6,
				'offset'         => 0,
				'post__not_in'   => [],
			],
			[ 102, 105 ]
		);

		$combined[] = run_loop( set_window( $query, $window[0], $window[1] ), $template, 1, $universe );
	}

	check( 'windows + exclusions: first window', $combined[0]['posts'], [ 101, 103 ] );
	check( 'windows + exclusions: second window', $combined[1]['posts'], [ 104, 106, 107, 108 ] );
	check( 'windows + exclusions: still one query', $combined[0]['sql'], $combined[1]['sql'] );

	// Past the over-fetch cap the trade stops paying off.
	$too_wide = run_loop(
		add_exclusions(
			[
				'posts_per_page' => 60,
				'offset'         => 0,
				'post__not_in'   => [],
			],
			range( 101, 150 )
		),
		$template,
		1,
		$universe
	);

	check( 'over the cap: excludes in SQL instead', $too_wide['sql']['post__not_in'], range( 101, 150 ) );
	check( 'over the cap: leaves posts_per_page alone', $too_wide['sql']['posts_per_page'], 60 );

	// An ID-only query never reaches `the_posts`, so nothing can be done in PHP.
	$ids_only = plan_query(
		add_exclusions(
			[
				'posts_per_page' => 5,
				'offset'         => 0,
				'fields'         => 'ids',
				'post__not_in'   => [],
			],
			[ 101 ]
		),
		$template,
		1
	);

	check( 'fields=ids: excludes in SQL', $ids_only['post__not_in'], [ 101 ] );
	check( 'fields=ids: does not over-fetch', $ids_only['posts_per_page'], 5 );

	// A loop with nothing to exclude and one template is left exactly as it was.
	$untouched = plan_query(
		track_loop(
			[
				'posts_per_page' => 5,
				'offset'         => 0,
				'post__not_in'   => [],
			],
			42
		),
		$template,
		1
	);
	unset( $untouched[ QUERY_VAR ] );

	check(
		'plain loop: query vars untouched',
		$untouched,
		[
			'posts_per_page' => 5,
			'offset'         => 0,
			'post__not_in'   => [],
		]
	);

	// Nothing this plugin tracks may reach the vars WP_Query hashes into its key.
	$tracked  = track_loop( [ 'posts_per_page' => 5, 'offset' => 0 ], 9001 );
	$tracked  = plan_query( add_exclusions( $tracked, [ 110 ] ), $template, 1 );
	$wp_query = new WP_Query( $tracked );
	bind_context( $wp_query );

	check( 'cache key: no plugin state in query_vars', array_keys( $wp_query->query_vars ), [ 'posts_per_page', 'offset' ] );
	check( 'cache key: no plugin state in query', array_keys( $wp_query->query ), [ 'posts_per_page', 'offset' ] );
	check( 'loop identity bound to the query instead', get_context( $wp_query )['query_id'], 9001 );

	printf( "\n%d checks, %d failures\n", $checks, $failures );

	exit( $failures > 0 ? 1 : 0 );
}

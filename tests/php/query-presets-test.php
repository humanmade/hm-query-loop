<?php
/**
 * Tests for the query preset callback contract.
 *
 * The preset API is pure PHP: registration is an array, application is a
 * `call_user_func`. Nothing in it needs WordPress beyond a handful of lookups,
 * so this file stubs those out and drives the real `inc/query-presets.php`.
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
	 * Minimal stand-ins for the WordPress pieces the preset API touches.
	 */
	class WP_Block {
		public $name;
		public $context = [];

		public function __construct( $name, $context = [] ) {
			$this->name    = $name;
			$this->context = $context;
		}
	}

	class WP_REST_Request {
		private $params = [];

		public function __construct( $params = [] ) {
			$this->params = $params;
		}

		public function get_param( $key ) {
			return $this->params[ $key ] ?? null;
		}
	}

	function add_filter( ...$args ) {}

	function add_action( ...$args ) {}

	function get_option( $name, $default = false ) {
		return $default;
	}

	function get_the_ID() {
		return $GLOBALS['current_post_id'];
	}

	function _doing_it_wrong( ...$args ) {}

	function __( $text, $domain = null ) {
		return $text;
	}

	function esc_html__( $text, $domain = null ) {
		return $text;
	}

	function esc_attr( $text ) {
		return $text;
	}
}

namespace HM\QueryLoop\Tests\Presets {

	use WP_Block;
	use WP_REST_Request;

	use function HM\QueryLoop\QueryPresets\apply_query_preset;
	use function HM\QueryLoop\QueryPresets\filter_query_loop_block_query_vars;
	use function HM\QueryLoop\QueryPresets\modify_rest_query_for_preset;
	use function HM\QueryLoop\QueryPresets\register_query_preset;

	require_once dirname( __DIR__, 2 ) . '/inc/query-presets.php';

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
			var_export( $expected, true ),
			var_export( $actual, true )
		);
	}

	/**
	 * The context each preset invocation was handed, keyed by preset name.
	 *
	 * @var array<string, array>
	 */
	$seen_context = [];

	// Records the whole context, so the tests can inspect any key of it.
	register_query_preset(
		'records_context',
		'Records Context',
		function ( array $query_vars, array $context ): array {
			$GLOBALS['seen_context']['records_context'] = $context;
			return $query_vars;
		}
	);

	// Reads block context the way a preset inside a Term Template would.
	register_query_preset(
		'reads_term',
		'Reads Term',
		function ( array $query_vars, array $context ): array {
			$query_vars['term_id'] = $context['block_instance']?->context['termId'] ?? 0;
			return $query_vars;
		}
	);

	$block = new WP_Block(
		'core/post-template',
		[
			'query'    => [ 'hmPreset' => 'records_context' ],
			'termId'   => 77,
			'taxonomy' => 'category',
		]
	);

	// The filter holds the block already; it must put it in the context it builds.
	filter_query_loop_block_query_vars( [ 'posts_per_page' => 5 ], $block, 2 );
	$frontend = $seen_context['records_context'];

	check( 'frontend: context carries the block instance', $frontend['block_instance'], $block );
	check( 'frontend: is_rest false', $frontend['is_rest'], false );

	// 'block' is misnamed but load-bearing: renaming it would break existing presets.
	check( 'frontend: block stays pagination metadata', $frontend['block'], [ 'perPage' => 5, 'page' => 2 ] );

	// REST renders no block, and says so with the key present rather than absent.
	modify_rest_query_for_preset( [], new WP_REST_Request( [ 'hmPreset' => 'records_context' ] ) );
	$rest = $seen_context['records_context'];

	check( 'REST: block_instance key exists', array_key_exists( 'block_instance', $rest ), true );
	check( 'REST: block_instance is null', $rest['block_instance'], null );

	// Reaching core's block context is the whole point of carrying the instance.
	$term_block = new WP_Block(
		'core/post-template',
		[
			'query'  => [ 'hmPreset' => 'reads_term' ],
			'termId' => 77,
		]
	);
	$term_vars = filter_query_loop_block_query_vars( [ 'posts_per_page' => 5 ], $term_block, 1 );
	check( 'preset reads termId through block_instance', $term_vars['term_id'], 77 );

	// Applied directly, the context passes through untouched.
	apply_query_preset( 'records_context', [], [ 'post_id' => 5, 'block_instance' => null ] );
	check( 'apply_query_preset: context passed through', $seen_context['records_context'], [ 'post_id' => 5, 'block_instance' => null ] );

	// An unregistered preset is still a no-op.
	check( 'unknown preset: query vars untouched', apply_query_preset( 'nope', [ 'orderby' => 'date' ], [] ), [ 'orderby' => 'date' ] );

	printf( "\n%d checks, %d failures\n", $checks, $failures );

	exit( $failures > 0 ? 1 : 0 );
}

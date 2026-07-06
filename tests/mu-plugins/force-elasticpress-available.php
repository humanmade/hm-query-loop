<?php
/**
 * Forces ElasticPress to appear available in E2E tests.
 *
 * Uses the hm_query_loop_elasticpress_available filter so the toggle
 * is rendered without requiring a real ElasticPress install.
 *
 * @package HM\QueryLoop\Tests
 */

add_filter( 'hm_query_loop_elasticpress_available', '__return_true' );

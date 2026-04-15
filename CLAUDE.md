# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

HM Query Loop is a WordPress plugin that extends the core Query Loop block with advanced controls for managing multiple query loops on a single page. Core features: posts per page override for inherited queries, hide on paginated pages, exclude already displayed posts, multiple post templates per query loop, query ID deduplication, and query presets.

## Development Commands

### Build and Development
- `npm run start` - Start development build with watch mode
- `npm run build` - Create production build (required before testing)
- `npm run lint:js` - Lint JavaScript files
- `npm run lint:css` - Lint CSS/SCSS files
- `npm run format` - Format all files

### Testing
- `npm run wp-env start` - Start WordPress test environment (ports 8888 dev, 8889 tests)
- `npm run test:e2e` - Run Playwright end-to-end tests
- `npm run test:e2e:debug` - Run tests in debug mode
- `npm run test:e2e:watch` - Run tests in watch mode (reruns on changes)
- `npm run wp-env stop` - Stop WordPress environment

**Important**: Always run `npm run build` before running tests, as tests run against built assets.

## Architecture

### Block Extension Approach
The plugin uses WordPress block filters to extend the `core/query` block without creating a custom block variant. This allows it to work with any Query Loop block while preserving core functionality.

### Context System
The plugin exposes an `hmQueryLoop` context object from `core/query` to `core/post-template`:
```js
// context key: 'hmQueryLoop'
{
  perPage: number | undefined,      // Custom posts per page value
  hideOnPaged: boolean,             // Whether to hide on paginated pages
  excludeDisplayed: boolean         // Whether to exclude displayed posts
}
```

Context is registered in both JavaScript (via `blocks.registerBlockType` filters in src/index.js) and PHP (via `filter_block_metadata` in hm-query-loop.php).

### Dual Query Modification Strategy

The plugin handles two different query scenarios:

**For Inherited Queries** (uses main WP_Query):
- `pre_render_block` - Captures block attributes, checks pagination visibility, re-runs main query with modified args
- Main query is modified before rendering to apply settings
- `render_block` - Returns empty string if block should be hidden on paginated pages

**For Non-Inherited Queries** (custom WP_Query):
- `query_loop_block_query_vars` filter - Passes block attributes into WP_Query vars
- This filter only fires for non-inherited queries, which is why the dual approach is necessary

### Post Tracking
- `the_posts` filter tracks displayed post IDs across all query loops on a page
- Global `$displayed_post_ids` array accumulates IDs from rendered query loops
- Subsequent query loops with `excludeDisplayed` enabled filter out tracked IDs via `post__not_in`

### Editor Preview Synchronization
`withPostTemplateStyles` HOC injects an inline `<style>` tag that hides posts outside each post template's slice in the editor preview using `nth-of-type` selectors. It accounts for both query-level `perPage` (inherited queries) and post-template-level `perPage` (multiple post templates), plus an offset for preceding templates.

### Multiple Post Templates
A non-inherited Query Loop can contain multiple `core/post-template` blocks, each showing a different slice of the results:
- `withPostTemplateInspectorControls` HOC adds "Posts per template" to each `core/post-template`'s inspector, clamped to remaining available posts.
- `withQueryLoopContextProvider` HOC wraps `core/query` with a `UsedPostsContext.Provider` so sibling post-template blocks share their `perPage` values.
- Server-side: `filter_query_loop_block_query_vars` computes `posts_per_page` and offset per template using `$query_loop_post_template_per_pages` (keyed by `queryId`).

### Query ID Deduplication
WordPress does not deduplicate `queryId` when blocks are copy-pasted, breaking post exclusion and pagination:
- Server-side: `deduplicate_query_ids` (`pre_render_block`, priority 10) generates unique IDs using a static instance counter + post ID and propagates them to child `core/post-template` via a dynamic `render_block_context` filter.
- Editor-side: `withUniqueQueryId` HOC computes the expected ID from post ID + block index and syncs it via `setAttributes`.

### Query Presets System

The plugin provides a PHP API for registering custom query presets that can be selected in the block editor:

**Registration API** (`inc/query-presets.php`):
```php
// Register a custom query preset
\HM\QueryLoop\QueryPresets\register_query_preset(
    'related_articles',           // Unique identifier
    'Related Articles',           // Human-readable label
    function( $query_vars, $context ) {
        // $context includes: post_id, is_rest, block (perPage, page)
        // Modify and return $query_vars
        return $query_vars;
    }
);
```

**How it works**:
1. Presets are registered via PHP callbacks that receive query args and context
2. The preset selector appears in the block editor when presets are registered
3. REST API hooks are automatically added for all public post types via `rest_{$post_type}_collection_params` and `rest_{$post_type}_query`
4. Frontend queries are modified via `query_loop_block_query_vars` filter
5. The selected preset is stored in `query.hmPreset` block attribute

## Key Files

- `hm-query-loop.php` - Main plugin file with all PHP hooks and query modification logic
- `inc/query-presets.php` - Query presets registration API and hooks
- `src/index.js` - Block filters for adding inspector controls and editor preview behavior
- `tests/e2e/fixtures.js` - Playwright test fixtures for WordPress admin
- `tests/e2e/posts-per-page.spec.js` - E2E tests for posts per page functionality
- `tests/e2e/query-presets.spec.js` - E2E tests for query presets
- `tests/e2e/multiple-post-templates.spec.js` - E2E tests for multiple post templates
- `tests/e2e/unique-query-id.spec.js` - E2E tests for query ID deduplication
- `tests/e2e/exclude-with-post-in.spec.js` - E2E tests for exclusion with post__in queries

## Testing Environment

Tests use `@wordpress/env` with WordPress 6.9, configured in `.wp-env.json`. The environment includes TwentyTwentyFour and TwentyTwentyFive themes, and the Advanced Query Loop plugin. Tests run on port 8889 and use Playwright with `@wordpress/e2e-test-utils-playwright`.

## Important Implementation Notes

- The plugin modifies queries without creating database entries or custom post types
- All settings are stored as block attributes in post content
- The `$original_paged` global preserves the original pagination state when blocks override it
- Hidden blocks (via `hideOnPaged`) still track their post IDs for exclusion purposes
- The plugin works with both FSE templates and classic posts/pages

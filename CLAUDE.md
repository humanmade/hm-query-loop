# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

HM Query Loop is a WordPress plugin that extends the core Query Loop block with advanced controls for managing multiple query loops on a single page. It provides three main features: posts per page override for inherited queries, hide on paginated pages, and exclude already displayed posts.

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
The plugin exposes a `hm-query-loop/settings` context object from `core/query` to `core/post-template`:
```js
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
In src/index.js, a `useEffect` hook syncs the `hmQueryLoop.perPage` attribute to `query.perPage` to reflect the override in the editor preview. The `withPostTemplateStyles` filter adds inline CSS to hide excess posts in the editor beyond the `perPage` limit.

## Key Files

- `hm-query-loop.php` - Main plugin file with all PHP hooks and query modification logic
- `src/index.js` - Block filters for adding inspector controls and editor preview behavior
- `tests/e2e/posts-per-page.spec.js` - E2E tests for posts per page functionality
- `tests/e2e/fixtures.js` - Playwright test fixtures for WordPress admin

## Testing Environment

Tests use `@wordpress/env` with WordPress 6.7.1, configured in `.wp-env.json`. The environment includes TwentyTwentyFour and TwentyTwentyFive themes. Tests run on port 8889 and use Playwright with `@wordpress/e2e-test-utils-playwright`.

## Important Implementation Notes

- The plugin modifies queries without creating database entries or custom post types
- All settings are stored as block attributes in post content
- The `$original_paged` global preserves the original pagination state when blocks override it
- Hidden blocks (via `hideOnPaged`) still track their post IDs for exclusion purposes
- The plugin works with both FSE templates and classic posts/pages

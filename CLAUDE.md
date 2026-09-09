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
  excludeDisplayed: boolean,        // Whether to exclude displayed posts
  useElasticPress: boolean,         // Whether to route query through ElasticPress (only shown when EP is active)
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

### Editor Viewport Placeholder (Lazy Rendering)
`withViewportPlaceholder` HOC (registered last, so it wraps the plugin's other `core/query` enhancements) replaces off-screen Query Loop blocks with a cheap `<Placeholder>` that fires no REST request. Mounting the real block triggers the core preview fetch, so on a page with many query loops this defers those requests until each block scrolls near the viewport. An `IntersectionObserver` — constructed from the target node's own `ownerDocument.defaultView` so it works whether or not the canvas is iframed — swaps in the real block on intersection (with a 300px `rootMargin` preload). Selecting a block (e.g. right after insertion or via List View) renders it immediately, and once rendered a block stays rendered (latched via state) so scrolling away neither discards edits nor refetches.

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
- `tests/e2e/viewport-placeholder.spec.js` - E2E tests for lazy viewport placeholder rendering

## Testing Environment

Tests use `@wordpress/env`, configured in `.wp-env.json`. The environment includes TwentyTwentyFour and TwentyTwentyFive themes, and the Advanced Query Loop plugin. Tests run on port 8889 and use Playwright with `@wordpress/e2e-test-utils-playwright`.

**Upstream versions are pinned deliberately.** Pins are exact tags/releases, never branches: floating refs let an upstream release break CI with no change in this repo, and make re-running an old green commit depend on the day it runs. When bumping a pin, expect to update any test that drives third-party UI.

`.wp-env.json` holds the local development default (current stable core, plus the pinned Advanced Query Loop release). CI overrides only the core axis per matrix lane via the `WP_ENV_CORE` environment variable, which takes precedence over `.wp-env.json` for both the dev and tests environments.

### CI matrix

`.github/workflows/playwright-tests.yml` runs the suite across WordPress versions. Lanes are defined as JSON in the `lanes` job, so a caller can narrow them without duplicating anything:

| Lane | Core | Job | Blocking |
| --- | --- | --- | --- |
| `6.9` | `WordPress/WordPress#6.9.7` | `e2e` | yes |
| `7.0` | `WordPress/WordPress#7.0.4` | `e2e-experimental` | no |
| `7.1` | `WordPress/WordPress#7.1` | `e2e-experimental` | no |
| `nightly` | `WordPress/WordPress#master` | `e2e-experimental` | no |

A failure in a non-blocking lane surfaces as a `::warning::` annotation and a job summary. For `nightly` that is early warning of an upstream change; for `7.0`/`7.1` it is a known compatibility gap.

**7.0 and 7.1 are non-blocking only until the WordPress 7.x gaps are closed.** They run on every PR and report, but the suite genuinely fails on 7.x — the plugin's `core/query` inspector panels are not found in the 7.x site editor, and 7.1 additionally fails `multiple-post-templates` and a *frontend* preset assertion that cannot be a selector problem. Move them back into `DEFAULT_BLOCKING` in the `lanes` job once that is fixed. Lanes carry a `comment` flag so `nightly` stays out of the PR thread while the released versions report into it.

Three structural points, each of which fixes a bug that actually happened:

- **Experimental lanes are a separate job, deliberately excluded from the aggregate's `needs`.** When trunk shared the blocking matrix, *any* failure in it — including an infrastructure blip in `wp-env start` — dragged the matrix result down and blocked the PR. Exempting only the test step is not enough; the lane has to be out of the gate entirely.
- **The aggregate job id is `test`.** That is the name branch protection resolves; the per-version lanes publish names (`WP 7.1`) it does not know about. Renaming or removing that job silently strands any required status check.
- **Steps live in a composite action** (`.github/actions/e2e-suite`) shared by both jobs, so the blocking and experimental paths cannot drift. `continue-on-error` is unavailable to composite steps, so the suite records its own `outcome` output and each caller decides whether that is fatal. Artifact names and report tags are per lane, because `upload-artifact@v4` rejects duplicate names.

### Scheduled canary

The scheduled `E2E (latest AQL)` workflow (`.github/workflows/e2e-latest.yml`) reuses the same Playwright job with a single pinned-core lane and Advanced Query Loop un-pinned, so a breaking AQL release shows up on a schedule instead of mid-PR (which is exactly how AQL 5.0.0 broke the suite). Core trunk is not covered there because the `nightly` matrix lane already does it on every push. It never runs on pull requests, so it cannot block a merge; on failure it opens or comments on a single rolling issue.

## Important Implementation Notes

- The plugin modifies queries without creating database entries or custom post types
- All settings are stored as block attributes in post content
- The `$original_paged` global preserves the original pagination state when blocks override it
- Hidden blocks (via `hideOnPaged`) still track their post IDs for exclusion purposes
- The plugin works with both FSE templates and classic posts/pages

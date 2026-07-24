# HM Query Loop

A WordPress plugin that extends the core Query Loop block with advanced controls for managing multiple query loops on a single page.

## Features

### 1. Posts Per Page Override for Inherited Queries

When a Query Loop block is set to "Inherit query from template", you can now override the number of posts to display. This is useful when you want to show a different number of posts than the main query. Leave the field empty to use the default number of posts.

**Editor Preview**: The posts per page override is reflected in the editor preview, making it easier to see how your content will appear without needing to preview or publish the page.

### 2. Hide on Paginated Pages

Toggle whether the query loop should be hidden when viewing page 2 or higher (when the `paged` query var is greater than 1). This is useful for creating layouts where different query loops appear on the first page vs subsequent pages.

### 3. Exclude Already Displayed Posts

Enable this option to automatically exclude posts that have been displayed by previous query loops on the same page. This ensures no duplicate posts appear when you have multiple query loops with different layouts.

**Important:** The exclusion applies to all query loops rendered before the current one, regardless of whether they were visible (e.g., hidden due to pagination settings).

### 4. Multiple Post Templates

A single Query Loop block (non-inherited) can contain multiple `core/post-template` blocks, each showing a different slice of the query results. Each Post Template block gets a "Posts per template" setting in its inspector controls to control how many posts it shows.

### 5. Query ID Deduplication

The plugin automatically assigns unique query IDs when blocks are copy-pasted or when a page renders the same template multiple times, preventing broken post exclusion and pagination.

### 6. Query Presets

Register custom query configurations in PHP that can be selected from a dropdown in the block editor. This allows developers to create reusable, dynamic queries (like "Related Articles" or "Trending Posts") that content editors can easily apply to any Query Loop block.

**Key Benefits:**
- Define complex query logic in PHP while keeping the editor interface simple
- Queries work in both the editor preview and on the frontend
- Automatically hooks into all public post types via the REST API

## Installation

1. Upload the plugin to your `/wp-content/plugins/` directory
2. Run `npm install` in the plugin directory
3. Run `npm run build` to compile the assets
4. Activate the plugin through the 'Plugins' menu in WordPress

## Development

### Build Commands

- `npm run start` - Start the development build with watch mode
- `npm run build` - Create a production build
- `npm run lint:js` - Lint JavaScript files
- `npm run lint:css` - Lint CSS/SCSS files
- `npm run format` - Format all files

### Testing

The plugin includes end-to-end tests using Playwright and `@wordpress/scripts`.

#### Running Tests

1. Start the WordPress test environment:
   ```bash
   npm run wp-env start
   ```

2. Run the tests:
   ```bash
   npm run test:e2e
   ```

#### Additional Test Commands

- `npm run test:e2e:debug` - Run tests in debug mode
- `npm run test:e2e:watch` - Run tests in watch mode (reruns on changes)
- `npm run wp-env stop` - Stop the WordPress environment
- `npm run wp-env` - Access wp-env commands directly

See [tests/e2e/README.md](tests/e2e/README.md) for more details on the test setup and writing tests.

## Usage

1. Add a Query Loop block to your page or template
2. In the block settings sidebar, find the "Extra Query Loop Settings" panel
3. Configure the options as needed:
   - **Query Preset**: Select a predefined query configuration (only visible when presets are registered)
   - **Posts per page (Override)**: Only visible when inheriting query - enter a number to override posts per page, or leave empty to use default
   - **Hide on paginated pages**: Toggle to hide this block on page 2+
   - **Exclude already displayed posts**: Toggle to avoid showing duplicate posts
4. For non-inherited queries with multiple Post Template blocks, select each `core/post-template` and set **Posts per template** to control how many posts each template shows

## Block Context

The plugin exposes an `hmQueryLoop` context object from `core/query` to `core/post-template`:

```js
// context key: 'hmQueryLoop'
{
	perPage: number | undefined,      // Custom posts per page value
	hideOnPaged: boolean,             // Whether to hide on paginated pages
	excludeDisplayed: boolean         // Whether to exclude displayed posts
}
```

This context is automatically registered for the `core/post-template` block both in JavaScript and PHP.

## Query Presets API

Register custom query presets that appear in the block editor and modify queries on both frontend and REST API requests.

```php
// In your theme's functions.php or a plugin
add_action( 'init', function() {
    \HM\QueryLoop\QueryPresets\register_query_preset(
        'related_articles',           // Unique identifier
        'Related Articles',           // Label shown in dropdown
        function( $query_vars, $context ) {
            // $context includes:
            // - post_id: Current post ID (useful for related content)
            // - is_rest: Boolean, true when called from REST API (editor)
            // - block: Array with perPage and page values

            $related_ids = get_post_meta( $context['post_id'], 'related_posts', true );

            if ( ! empty( $related_ids ) ) {
                $query_vars['post__in'] = $related_ids;
                $query_vars['orderby'] = 'post__in';
            }

            return $query_vars;
        }
    );
});
```

**Available Functions:**

- `\HM\QueryLoop\QueryPresets\register_query_preset( $name, $label, $callback )` - Register a preset
- `\HM\QueryLoop\QueryPresets\unregister_query_preset( $name )` - Remove a preset
- `\HM\QueryLoop\QueryPresets\get_registered_presets()` - Get all registered presets
- `\HM\QueryLoop\QueryPresets\get_query_preset( $name )` - Get a specific preset
- `\HM\QueryLoop\QueryPresets\apply_query_preset( $name, $query_vars, $context )` - Manually apply a preset

## Example Use Case

Create a custom archive layout with different query loops:

1. **First Query Loop**: Show 3 featured posts in a grid layout
   - Posts per page: 3
   - Hide on paginated pages: Yes
   - Exclude already displayed posts: No

2. **Second Query Loop**: Show remaining posts in a list layout
   - Posts per page: 10
   - Hide on paginated pages: No
   - Exclude already displayed posts: Yes (excludes the 3 featured posts)

On page 1, both query loops appear. On page 2+, only the second query loop appears, continuing to exclude the 3 featured posts from page 1.

## Requirements

- WordPress 6.0 or higher
- PHP 7.4 or higher
- Node.js 16 or higher (for development)

## Release Process

This plugin uses GitHub Actions for automated versioning and release asset creation.

### Creating a Release

1. Check the `release` branch is built and ready (assets should be in the `build/` directory)
2. Go to the GitHub repository and create a new release:
   - [Go to the Actions tab, and then the Release action](https://github.com/humanmade/hm-query-loop/actions/workflows/release.yml)
   - Select "Run Workflow" and fill in the new version number and any other fields as needed
   - Run the workflow
3. The GitHub Action will automatically:
   - Checkout the code at the tag you created
   - Replace `__VERSION__` placeholders with the actual version number
   - Commit the built and versioned files to the tag
   - Create a production-ready ZIP file (excluding dev files)
   - Upload the ZIP as a release asset

The tag version (e.g., `1.2.3`) will be used as the plugin version. The version number should follow semantic versioning.

## License

GPL-2.0+

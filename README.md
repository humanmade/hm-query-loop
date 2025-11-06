# HM Query Loop

A WordPress plugin that extends the core Query Loop block with advanced controls for managing multiple query loops on a single page.

## Features

### 1. Posts Per Page Override for Inherited Queries

When a Query Loop block is set to "Inherit query from template", you can now override the number of posts to display. This is useful when you want to show a different number of posts than the main query. Leave the field empty to use the default number of posts.

### 2. Hide on Paginated Pages

Toggle whether the query loop should be hidden when viewing page 2 or higher (when the `paged` query var is greater than 1). This is useful for creating layouts where different query loops appear on the first page vs subsequent pages.

### 3. Exclude Already Displayed Posts

Enable this option to automatically exclude posts that have been displayed by previous query loops on the same page. This ensures no duplicate posts appear when you have multiple query loops with different layouts.

**Important:** The exclusion applies to all query loops rendered before the current one, regardless of whether they were visible (e.g., hidden due to pagination settings).

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

## Usage

1. Add a Query Loop block to your page or template
2. In the block settings sidebar, find the "HM Query Loop Settings" panel
3. Configure the options as needed:
   - **Posts per page (Override)**: Only visible when inheriting query - enter a number to override posts per page, or leave empty to use default
   - **Hide on paginated pages**: Toggle to hide this block on page 2+
   - **Exclude already displayed posts**: Toggle to avoid showing duplicate posts

## Block Context

The plugin exposes a single `hm-query-loop/settings` context object that can be accessed by child blocks (like `core/post-template`):

```js
{
	perPage: number | undefined,      // Custom posts per page value
	hideOnPaged: boolean,             // Whether to hide on paginated pages
	excludeDisplayed: boolean          // Whether to exclude displayed posts
}
```

This context is automatically registered for the `core/post-template` block both in JavaScript and PHP.

## Technical Implementation

The plugin uses a dual-approach to handle both inherited and non-inherited Query Loop blocks:

### For Inherited Queries (uses main query):

- **`pre_render_block`**: Runs before a Query Loop block renders
  - Captures block attributes and stores them globally
  - Checks pagination visibility settings (returns empty string if hidden)
  - Hooks `modify_query_from_block_attrs` to `pre_get_posts`

- **`pre_get_posts` (via `modify_query_from_block_attrs`)**: Dynamically hooked during block rendering
  - Retrieves block attributes from global storage
  - Modifies the query (posts per page, exclusions)
  - Works with inherited queries and main query

- **`render_block`**: Runs after the Query Loop block renders
  - Unhooks `modify_query_from_block_attrs` from `pre_get_posts`
  - Clears global block attributes

### For Non-Inherited Queries (custom WP_Query):

- **`query_loop_block_query_vars`**: Passes custom block attributes into WP_Query vars
  - Adds `hm_query_loop_id`, `hm_query_loop_per_page`, `hm_query_loop_exclude_displayed`
  - This filter runs for non-inherited queries only

Note: Since `query_loop_block_query_vars` doesn't fire for inherited queries, we use the `pre_render_block`/`render_block` approach to hook/unhook `pre_get_posts` dynamically around the block rendering.

### Post Tracking:

- **`the_posts`**: Runs after posts are fetched
  - Tracks post IDs from Query Loop blocks (both approaches) and main query
  - Builds a global list for subsequent query loops to exclude

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

1. Make sure the `release` branch is built and ready (assets should be in the `build/` directory)
2. Go to the GitHub repository and create a new release:
   - Click "Releases" → "Draft a new release"
   - Create a new tag (e.g., `v1.2.3`) from the `release` branch
   - Add release title and notes
   - Click "Publish release"
3. The GitHub Action will automatically:
   - Checkout the code at the tag you created
   - Replace `__VERSION__` placeholders with the actual version number
   - Commit the versioned file back to the tag
   - Create a production-ready ZIP file (excluding dev files)
   - Upload the ZIP as a release asset

The tag version (e.g., `v1.2.3`) will be used as the plugin version. The version number should follow semantic versioning.

## License

GPL-2.0+

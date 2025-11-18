# End-to-End Tests

This directory contains Playwright end-to-end tests for the HM Query Loop plugin.

## Prerequisites

- Node.js 16+
- npm

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the WordPress environment:
   ```bash
   npm run wp-env start
   ```

## Running Tests

Run all tests:
```bash
npm run test:e2e
```

Run tests in debug mode:
```bash
npm run test:e2e:debug
```

Run tests in watch mode (reruns on file changes):
```bash
npm run test:e2e:watch
```

## Test Structure

- `fixtures.js` - Test fixtures and utilities for WordPress admin and editor
- `posts-per-page.spec.js` - Tests for the posts per page override functionality

## WordPress Environment

The tests use `@wordpress/env` to spin up a local WordPress instance with the plugin installed. The environment configuration is in `.wp-env.json`.

Default ports:
- Development: http://localhost:8888
- Tests: http://localhost:8889

## CI/CD

Tests are automatically run on GitHub Actions for pull requests and pushes to main branches. See `.github/workflows/playwright-tests.yml` for the configuration.

## Writing Tests

Tests use Playwright Test framework with custom WordPress fixtures. The fixtures provide utilities for:

- Admin authentication
- Creating posts/pages
- Inserting blocks
- Opening block settings
- Publishing content

Example test:
```javascript
test('should show posts per page control', async ({ page, editor }) => {
  await editor.createNewPost('page');
  // ... test code
});
```

## Troubleshooting

### Environment not starting

If the WordPress environment fails to start, try:
```bash
npm run wp-env stop
npm run wp-env start
```

### Tests failing locally but passing in CI

Ensure you're running the latest version of dependencies:
```bash
npm install
npm run build
npx playwright install --with-deps
```

### Port conflicts

If ports 8888 or 8889 are already in use, you can change them in `.wp-env.json`.

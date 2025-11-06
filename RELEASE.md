# Release Process

This document describes the automated release process for the HM Query Loop plugin.

## Overview

The plugin uses GitHub Actions to automate versioning when you manually create a release. When you create a release in the GitHub UI, the workflow will:

1. Checkout the code at the tag you created
2. Replace `__VERSION__` placeholders with the actual version
3. Commit the versioned file back to the tag
4. Create a production-ready ZIP file (excluding dev files)
5. Upload the ZIP as a release asset

## Prerequisites

Before creating a release, the `release` branch should already have:
- All code changes merged from `main`
- Built assets in the `build/` directory (from the build workflow)
- Passing tests

## Creating a Release

### Step 1: Prepare the Release Branch

Make sure the `release` branch is up to date with built assets:

```bash
git checkout release
git pull origin release
```

The `release` branch should already contain built files in the `build/` directory from the build workflow.

### Step 2: Create a Release in GitHub UI

1. Go to your GitHub repository
2. Click on the "Releases" tab
3. Click "Draft a new release"
4. Fill in the release form:
   - **Tag**: Create a new tag (e.g., `v1.2.3`)
   - **Target**: Select the `release` branch
   - **Title**: Release name (e.g., "v1.2.3")
   - **Description**: Release notes (what's new, bug fixes, etc.)
5. Click "Publish release"

**Important:** The tag must follow the format `vX.Y.Z` (e.g., `v1.2.3`)

### Step 3: Monitor the Workflow

1. After publishing, go to the "Actions" tab
2. Watch the "Version and Release" workflow run
3. The workflow will:
   - Update the version in the plugin file
   - Update the tag to point to the versioned commit
   - Create and upload a ZIP file

### Step 4: Verify the Release

1. Go back to the "Releases" page
2. Your release should now have a ZIP file attached
3. Download and test the ZIP to ensure it works correctly

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **Major version** (1.0.0 → 2.0.0): Breaking changes
- **Minor version** (1.0.0 → 1.1.0): New features, backwards compatible
- **Patch version** (1.0.0 → 1.0.1): Bug fixes, backwards compatible

## What Gets Released

The GitHub Action creates a ZIP file containing:

- `hm-query-loop.php` (with version replaced)
- `build/` directory (compiled assets)
- Any other necessary plugin files

The following are **excluded** from releases:
- `.git/` directory
- `.github/` directory
- `node_modules/`
- `src/` (source files)
- `package.json` and `package-lock.json`
- Development documentation (`README.md`)

## Troubleshooting

### "Tag already exists"

If you need to recreate a release:

1. Delete the existing release in GitHub UI
2. Delete the tag locally and remotely:
   ```bash
   git tag -d v1.2.3
   git push origin :refs/tags/v1.2.3
   ```
3. Create a new release with the same or different version

### Workflow fails

Check the workflow logs in the GitHub Actions tab. Common issues:
- Missing `build/` directory on the release branch
- Incorrect tag format (must be `vX.Y.Z`)
- Permissions issues (workflow needs `contents: write`)

### ZIP file not uploaded

If the ZIP file isn't attached to the release:
1. Check the workflow logs for errors
2. Make sure the workflow completed successfully
3. The ZIP file should be named `hm-query-loop-vX.Y.Z.zip`

## Manual Release (Fallback)

If the automated process fails, you can create a release manually:

1. Checkout the tag: `git checkout v1.2.3`
2. Replace `__VERSION__` in `hm-query-loop.php` with the actual version
3. Make sure `build/` directory exists with compiled assets
4. Create a ZIP file excluding dev files:
   ```bash
   zip -r hm-query-loop-v1.2.3.zip . \
     -x "*.git*" \
     -x "node_modules/*" \
     -x "src/*" \
     -x "package*.json"
   ```
5. Upload the ZIP to the GitHub release

## Notes

- The `release` branch should be kept built with assets in `build/`
- Tags are created manually through GitHub UI, not automatically
- The workflow updates the tag to point to versioned code
- You can create multiple releases from the same branch
- The workflow requires `contents: write` permission to update tags

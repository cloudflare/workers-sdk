# Wrangler Devtools Pages Project

This package contains a Workers specific version of Chrome Devtools that is used by the Wrangler dev command. It is a customized fork of Chrome DevTools specifically tailored for debugging Cloudflare Workers. This package provides Worker-specific functionality through carefully maintained patches on top of Chrome DevTools.

## Overview

This package is used across multiple Cloudflare products:

- Workers Playground (`workers-playground`)
- Quick Editor (`@cloudflare/quick-edit`)
- Wrangler CLI via the `InspectorProxy`

## Features

Our customized DevTools implementation provides:

- Source code viewing and live updates
- Network request inspection
- Worker-specific UI optimizations

## Development

We maintain this fork by applying patches on top of Chrome DevTools. These patches need to be periodically rebased as Chrome DevTools evolves.

**Key Development Tasks:**

- Generating patches from our customizations
- Rebasing patches onto new Chrome DevTools versions
- Testing functionality across all integration points

## Updating DevTools

We perform quarterly updates to stay current with upstream Chrome DevTools. The update process involves:

1. Cloning the devtools-frontend repo
2. Applying our existing patches
3. Rebasing onto the latest Chrome DevTools
4. Regenerating patches
5. Thorough testing across all integration points

**For detailed instructions on updating DevTools, please refer to our internal documentation on keeping devtools up-to-date.**

## Testing

Two methods are available for testing updates:

**Local Development:**

- Build and serve DevTools locally
- Test against local Playground instance
- Make targeted fixes as needed

**Preview Builds:**

- Add `preview:wrangler-devtools` label to PRs
- Use deployed preview URL for testing
- Verify functionality in Playground

## Acceptance Criteria

Our DevTools implementation must maintain full functionality across:

- Console operations (logging, errors, filters)
- Source code viewing and debugging
- Network request inspection
- Worker-specific UI customizations

## Contributing

When making changes:

- Keep patches minimal and targeted
- Prefer CSS-based UI modifications
- Test thoroughly across all integration points
- Document any new patches or modifications

## Deployment

Deployments are managed by GitHub Actions:

- deploy-pages-previews.yml:
  - Runs on any PR that has the `preview:wrangler-devtools` label.
  - Deploys a preview, which can then be accessed via [https://<SHA>.cloudflare-devtools.pages.dev/].
- changesets.yml:
  - Runs when a "Version Packages" PR, containing a changeset that touches this package, is merged to `main`.
  - Deploys this package to production, which can then be accessed via [https://cloudflare-devtools.pages.dev/].

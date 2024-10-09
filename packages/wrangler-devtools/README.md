# Wrangler Devtools Pages Project

This package contains a Workers specific version of Chrome Devtools that is used by the Wrangler dev command.

## Deployment

Deployments are managed by GitHub Actions:

- deploy-pages-previews.yml:
  - Runs on any PR that has the `preview:wrangler-devtools` label.
  - Deploys a preview, which can then be accessed via [https://<SHA>.cloudflare-devtools.pages.dev/].
- changesets.yml:
  - Runs when a "Version Packages" PR, containing a changeset that touches this package, is merged to `main`.
  - Deploys this package to production, which can then be accessed via [https://cloudflare-devtools.pages.dev/].

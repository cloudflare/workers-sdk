# Wrangler Devtools Pages Project

This package contains a Workers specific version of Chrome Devtools that is used by the Wrangler dev command.

## Deployment

Deployments are managed by the Github Action defined at .github/workflows/deploy-pages-projects.yaml.

This action runs on:

- every push to `main`. This will deploy the project to production, which can then be accessed via [https://cloudflare-devtools.pages.dev/].
- any PR that has the `preview:wrangler-devtools` label. This will deploy a preview, which can then be accessed via [https://<SHA>.cloudflare-devtools.pages.dev/].

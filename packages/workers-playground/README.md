# Workers Playground

This package contains the client side assets used in the Workers Playground available in the Cloudflare Dashboard at [https://workers.cloudflare.com/playground].

It is deployed as a Cloudflare Worker with static assets (assets-only in production).

## Developing locally

> This is intended for internal Cloudflare developers. Currently, it's not possible to contribute to this package as an external contributor

- Ensure the rest of the team are aware you're working on the Workers Playground, as there's only one instance of the testing `playground-preview-worker`.

- Run `pnpm run dev` in the root of this package. That will start the local Vite server for the playground frontend, with API calls hitting the testing `playground-preview-worker`.

- To test changes to the playground preview worker, run `pnpm run deploy:testing` in `packages/playground-preview-worker` to deploy it to the test environment.

## Building

1. Run `pnpm -F workers-playground build`

This generates the files into the `dist` directory that can then be deployed as a Cloudflare Worker with static assets.

## Deployment

Deployments are managed by GitHub Actions:

- deploy-pages-previews.yml:
  - Runs on any PR that has the `preview:workers-playground` label.
  - Uploads a preview version via `wrangler versions upload`.
- changesets.yml:
  - Runs when a "Version Packages" PR, containing a changeset that touches this package, is merged to `main`.
  - Deploys this package to production via `wrangler deploy`.

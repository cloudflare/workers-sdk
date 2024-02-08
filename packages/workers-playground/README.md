# Workers Playground Pages Project

This package contains the client side assets used in the Workers Playground available in the Cloudflare Dashboard at [https://workers.cloudflare.com/playground].

## Developing

In the root of the monorepo:

1. Run `pnpm -F workers-playground dev`

This will run the Vite dev server, which will watch the source files and reload the browser on changes.

## Building

1. Run `pnpm -F workers-playground build`

This generates the files into the `dist` directory that can then be deployed to Cloudflare Pages.

## Deployment

Deployments are managed by the Github Action defined at .github/workflows/deploy-pages-projects.yaml.

This action runs on:

- every push to `main`. This will deploy the project to production, which can then be accessed via [https://workers-playground.pages.dev/].
- any PR that has the `preview:workers-playground` label. This will deploy a preview, which can then be accessed via [https://<SHA>.workers-playground.pages.dev/].

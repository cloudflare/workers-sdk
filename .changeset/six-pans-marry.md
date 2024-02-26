---
"create-cloudflare": minor
---

feature: Use new `vite-cloudflare` template in Remix projects.

Remix has released a [new official Cloudflare template](https://remix.run/docs/en/main/future/vite#cloudflare-proxy) that uses `getPlatformProxy` under the hood to provide better support for bindings in dev. Remix projects created with C3 will now use this new template.

Along with this change, projects will use the default vite-based dev command from `create-remix` instead of using `wrangler pages dev` on build output.

A new `build-cf-types` script has also been added to re-generate the `Env` type defined in `load-context.ts` based on the contents of `wrangler.toml`. A default `wrangler.toml` will be added to new Remix projects to accomodate this workflow.

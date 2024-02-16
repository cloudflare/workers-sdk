---
"create-cloudflare": minor
---

feature: Improve bindings support in Svelte template.

C3 will now create Svelte projects with a hook that uses `getPlatformProxy` to proxy bindings in development mode. A `wrangler.toml` file will also be added where bindings can be added to be used in conjunction with `getPlatformProxy`.

Along with this change, projects will use the default vite-based dev command from `create-svelte` instead of using `wrangler pages dev` on build output.

When Typescript is used, the `app.d.ts` will be updated to add type definitions for `cf` and `ctx` to the `Platform` interface from the `@cloudflare/workers-types` package. Types for bindings on `platform.env` can be re-generated with a newly added `build-cf-types` script.

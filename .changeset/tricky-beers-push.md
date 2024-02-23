---
"create-cloudflare": minor
---

feature: Improve bindings support in Astro template.

C3 will now create Astro projects configured to use miniflare in dev automatically. This is done by adding a configuration for the adapter of `{ runtime: 'local'}` (see [Astro docs](https://docs.astro.build/en/guides/integrations-guide/cloudflare/#runtime) for more details). A `wrangler.toml` file will also be added where bindings can be added to be used in dev.

Along with this change, projects will now use the default vite-based `astro dev` command instead of using `wrangler pages dev` on build output.

When Typescript is used, the `src/env.d.ts` file will be updated to add type definitions `runtime.env` which can be re-generated with a newly added `build-cf-types` script.

---
"wrangler": patch
---

Omit `mainModule` from generated types when the entrypoint is a framework build artefact

`wrangler types` declared `Cloudflare.GlobalProps.mainModule` as `typeof import("<main>")`. When `main` points into a framework build output directory (for example SvelteKit's `.svelte-kit/cloudflare/_worker.js`), that import made `tsc` and `svelte-check` follow the reference and type-check generated code, producing errors in `worker-configuration.d.ts` on a clean project — or failing outright before the first build had run.

The `mainModule` declaration is now skipped when the entrypoint resolves inside a directory whose name begins with `.`, relative to the Wrangler config. Entrypoints in ordinary directories, and those outside the config directory, are unaffected.

`durableNamespaces` was previously emitted only alongside `mainModule`; it is now declared independently, so Durable Object namespace types survive for these projects.

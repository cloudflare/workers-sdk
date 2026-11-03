---
"miniflare": minor
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
---

Support local Artifacts across Wrangler, Vite, and Workers Vitest

Set `remote: false` on an Artifacts binding to opt into the Miniflare simulator and persistent local repositories during development. Omitted `remote` continues to use the deployed resource, with a warning that changes affect real repositories; `remote: true` explicitly selects it. When remote bindings are disabled (`wrangler dev --local`, or Vite's `remoteBindings: false`), Artifacts bindings use the local simulator. Local development does not require Cloudflare credentials, but does require Git 2.32 or newer on the host.

In Miniflare's own options, Artifacts bindings route like every other binding: only `dev.remote: true` with a remote proxy connection uses the deployed resource. Wrangler, Vite and Workers Vitest resolve the deployed-by-default rule before passing options to Miniflare.

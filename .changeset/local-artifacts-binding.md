---
"miniflare": minor
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
---

Support local Artifacts across Wrangler, Vite, and Workers Vitest

Set `remote: false` on an Artifacts binding to opt into the Miniflare simulator and persistent local repositories during development. Omitted `remote` continues to use the deployed resource, with a warning that changes affect real repositories; `remote: true` explicitly selects it. When remote bindings are disabled (`wrangler dev --local`, or Vite's `remoteBindings: false`), Artifacts bindings use the local simulator. Local development does not require Cloudflare credentials, but does require Git 2.32 or newer on the host.

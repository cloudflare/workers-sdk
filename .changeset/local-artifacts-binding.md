---
"miniflare": minor
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Support local Artifacts across Wrangler, Vite, and Workers Vitest

Set `remote: false` on an Artifacts binding to opt into the Miniflare simulator and persistent local repositories during development. Omitted `remote` continues to use the deployed resource; `remote: true` explicitly selects it. Local development does not require Cloudflare credentials, but does require Git 2.32 or newer on the host.

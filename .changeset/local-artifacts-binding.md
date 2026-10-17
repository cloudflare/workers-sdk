---
"miniflare": minor
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Enable local Artifacts by default across Wrangler, Vite, and Workers Vitest

Artifacts bindings now use the Miniflare simulator and persistent local repositories by default in development. Set `remote: true` on the binding to opt into the deployed resource. Local development does not require Cloudflare credentials, but does require Git 2.32 or newer on the host.

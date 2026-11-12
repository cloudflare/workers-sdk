---
"wrangler": minor
"miniflare": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/workers-utils": minor
---

Use the local simulator for Artifacts bindings that omit `remote`

**Behavior change:** Artifacts bindings now default to the local simulator during development, like KV, R2 and D1. Previously, an omitted `remote` in Wrangler and the Vite plugin used the deployed Artifacts resource. If you want deployed repos in `wrangler dev` or `vite dev`, set `"remote": true` on the binding (`dev: { remote: true }` in `cloudflare.config.ts`). Artifacts is in beta, so this ships as a minor release.

While `remote` is omitted, `wrangler dev`, `getPlatformProxy()` and the Vite plugin warn when remote bindings are enabled, once for each binding rather than on every config reload: "Artifacts binding REPOS uses the local simulator by default. Set `remote: true` to use deployed repos, or `remote: false` to silence this warning." Workers Vitest and `wrangler dev --local` already used the simulator, so they don't warn. Local Artifacts needs no Cloudflare credentials, but requires Git 2.32 or newer on the host.
